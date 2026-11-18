import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { assertLocalTestEnvironment } from "./local-guard";
import { trashListSchema } from "../../src/lib/lead-trash";

const { url, key } = assertLocalTestEnvironment();
const make = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const owner = make(),
  other = make(),
  member = make(),
  anon = make();
const run = randomUUID().slice(0, 8);
let passed = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  passed++;
}
function sql(input: string) {
  const r = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      "work/stack.env",
      "-f",
      "compose.phase1.yml",
      "exec",
      "-T",
      "db",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const users = [];
for (const [i, db] of [owner, other, member].entries()) {
  const result = await db.auth.signUp({
    email: `trash-${run}-${i}@example.test`,
    password: `Local-test-${randomUUID()}!`,
  });
  assert.ok(
    result.data.session,
    result.error?.message ?? "Expected test signup",
  );
  users.push(result.data.user!.id);
}
const org = (
  await owner.rpc("create_organization", {
    organization_name: `Trash test ${run}`,
  })
).data as string;
const foreign = (
  await other.rpc("create_organization", {
    organization_name: `Other Trash ${run}`,
  })
).data as string;
sql(
  `insert into public.organization_members(organization_id,user_id,role) values('${org}','${users[2]}','member');`,
);
const create = async (name: string) => {
  const r = await owner.rpc("create_prospect", {
    payload: {
      organization_id: org,
      name: `${name} ${run}`,
      industry: "Synthetic service",
      location: "Test city",
      estimated_value_cents: 300000,
    },
  });
  assert.ok(r.data, r.error?.message ?? "Expected local fixture");
  return r.data as string;
};
const lead = await create("Recoverable lead");
const snapshot = async (id: string) => {
  const r = await owner
    .from("leads")
    .select("updated_at,status,business_id")
    .eq("id", id)
    .single();
  assert.ok(r.data, r.error?.message ?? "Expected local fixture");
  return r.data;
};
const before = await snapshot(lead);
const request = {
  org,
  lead,
  restore: false,
  expected_updated_at: before.updated_at,
};
await owner.from("lead_notes").insert({
  organization_id: org,
  lead_id: lead,
  body: "Retain this synthetic note",
});
await owner.rpc("configure_agents", {
  org,
  config: {
    paused: false,
    daily_job_limit: 25,
    explee_daily_credit_limit: 0,
    sender_name: "Test",
    sender_email: "test@example.test",
    postal_address: "Synthetic test address",
  },
});
const job = await owner.rpc("enqueue_agent_job", {
  org,
  lead,
  job_kind: "research_plan",
  request_key: randomUUID(),
});
assert.ok(job.data, job.error?.message ?? "Expected queued job");
// Only synthetic fixtures; no Google connection and no sending function is invoked.
sql(
  `insert into public.email_deliveries(organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,request_key,fingerprint,created_by) values('${org}','${lead}','never-send@example.test','Synthetic','Synthetic fixture',now(),1,'${randomUUID()}','${randomUUID()}','${users[0]}');`,
);
check(
  Boolean((await anon.rpc("change_lead_trash", request)).error),
  "Anonymous removal denied",
);
check(
  Boolean((await other.rpc("change_lead_trash", request)).error),
  "Other tenant removal denied",
);
check(
  Boolean((await member.rpc("change_lead_trash", request)).error),
  "Member removal denied",
);
check(
  Boolean(
    (
      await owner.rpc("change_lead_trash", {
        ...request,
        expected_updated_at: "2000-01-01T00:00:00Z",
      })
    ).error,
  ),
  "Stale removal denied",
);
check(
  Boolean(
    (
      await owner
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", lead)
    ).error,
  ),
  "Direct removal-column writes denied",
);
const removed = await owner.rpc("change_lead_trash", request);
check(removed.data === lead && !removed.error, "Owner removes its lead");
check(
  (await owner.rpc("change_lead_trash", request)).data === lead,
  "Removal idempotent",
);
check(
  (await owner.from("leads").select("id").eq("id", lead)).data?.length === 0,
  "Removed lead hidden from active reads",
);
check(
  (await member.from("leads").select("id").eq("id", lead)).data?.length === 0,
  "Removed lead hidden from member reads",
);
check(
  (await owner.rpc("crm_summary", { org })).data.total === 0,
  "CRM summary excludes removed lead",
);
check(
  (await owner.from("businesses").select("id").eq("id", before.business_id))
    .data?.length === 1,
  "Business provenance retained",
);
check(
  (await owner.from("lead_notes").select("id").eq("lead_id", lead)).data
    ?.length === 1,
  "Note history retained",
);
check(
  (await owner.from("agent_jobs").select("status").eq("id", job.data)).data?.[0]
    .status === "cancelled",
  "Queued preparation cancelled",
);
check(
  (await owner.from("email_deliveries").select("status").eq("lead_id", lead))
    .data?.[0].status === "cancelled",
  "Queued delivery approval cancelled",
);
check(
  Boolean(
    (
      await owner.rpc("enqueue_agent_job", {
        org,
        lead,
        job_kind: "research_plan",
        request_key: randomUUID(),
      })
    ).error,
  ),
  "Removed lead cannot queue agents",
);
const listing = trashListSchema.parse(
  (await owner.rpc("list_lead_trash", { org })).data,
);
check(
  listing.count === 1 && listing.leads[0].id === lead,
  "Owner sees recoverable Trash record",
);
check(
  Boolean((await other.rpc("list_lead_trash", { org })).error),
  "Cross-tenant Trash read denied",
);
check(
  Boolean((await member.rpc("list_lead_trash", { org })).error),
  "Member Trash read denied",
);
check(
  Boolean((await anon.rpc("list_lead_trash", { org })).error),
  "Anonymous Trash read denied",
);
check(
  Boolean((await owner.rpc("list_lead_trash", { org: foreign })).error),
  "Forged organization denied",
);
const restore = {
  ...request,
  restore: true,
  expected_updated_at: listing.leads[0].updated_at,
};
check(
  Boolean((await other.rpc("change_lead_trash", restore)).error),
  "Cross-tenant restore denied",
);
check(
  (await owner.rpc("change_lead_trash", restore)).data === lead,
  "Owner restores lead",
);
check(
  (await owner.rpc("change_lead_trash", restore)).data === lead,
  "Restore idempotent",
);
check(
  (await owner.rpc("crm_summary", { org })).data.total === 1,
  "Restored lead returns to summary",
);
check(
  (await owner.from("email_deliveries").select("status").eq("lead_id", lead))
    .data?.[0].status === "cancelled",
  "Restore does not resume approvals",
);
check(
  (
    await owner
      .from("audit_events")
      .select("id")
      .eq("entity_id", lead)
      .contains("changed_fields", ["deleted_at"])
  ).data?.length === 2,
  "Removal and restoration are audited",
);
const duplicate = await owner.rpc("create_prospect", {
  payload: {
    organization_id: org,
    name: `Recoverable lead ${run}`,
    industry: "Services",
    location: "Test city",
  },
});
check(
  Boolean(duplicate.error),
  "Import/manual identity cannot recreate the same business",
);
await owner.rpc("log_contact_event", {
  org,
  lead,
  event_kind: "opt_out",
  event_at: new Date().toISOString(),
  event_note: "Synthetic opt-out",
});
const suppressed = await snapshot(lead);
await owner.rpc("change_lead_trash", {
  ...request,
  expected_updated_at: suppressed.updated_at,
});
const suppressedTrash = trashListSchema.parse(
  (await owner.rpc("list_lead_trash", { org })).data,
).leads[0];
await owner.rpc("change_lead_trash", {
  ...restore,
  expected_updated_at: suppressedTrash.updated_at,
});
check(
  (await snapshot(lead)).status === "Suppressed",
  "Restoration preserves suppression stage",
);
check(
  (await owner.from("suppression_entries").select("id").eq("lead_id", lead))
    .data?.length === 1,
  "Suppression identity retained",
);
const busy = await create("Busy lead");
const busySnapshot = await snapshot(busy);
sql(
  `insert into public.email_deliveries(organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,request_key,fingerprint,created_by,status) values('${org}','${busy}','never-send@example.test','Synthetic','Synthetic fixture',now(),1,'${randomUUID()}','${randomUUID()}','${users[0]}','sending');`,
);
check(
  Boolean(
    (
      await owner.rpc("change_lead_trash", {
        ...request,
        lead: busy,
        expected_updated_at: busySnapshot.updated_at,
      })
    ).error,
  ),
  "In-flight delivery prevents removal",
);
check(
  (await snapshot(busy)).business_id === busySnapshot.business_id,
  "Blocked removal leaves active lead intact",
);
console.log(
  `Lead Trash integration: ${passed} checks passed (synthetic loopback fixtures only).`,
);
