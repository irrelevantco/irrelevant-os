import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLocalTestEnvironment } from "./local-guard";
import type { Database, Json } from "../../src/lib/supabase/database.types";
const { url, key } = assertLocalTestEnvironment();
const client = () =>
  createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = client(),
  b = client(),
  anon = client();
const run = randomUUID().slice(0, 8);
let passed = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed++;
}
const [ua, ub] = await Promise.all([
  a.auth.signUp({
    email: `rls-a-${run}@example.test`,
    password: `Local-only-${randomUUID()}!`,
  }),
  b.auth.signUp({
    email: `rls-b-${run}@example.test`,
    password: `Local-only-${randomUUID()}!`,
  }),
]);
assert.ok(
  ua.data.session && ub.data.session,
  "Local signup must auto-confirm.",
);
const oa = await a.rpc("create_organization", {
  organization_name: `RLS A ${run}`,
});
const ob = await b.rpc("create_organization", {
  organization_name: `RLS B ${run}`,
});
assert.ok(oa.data && ob.data, JSON.stringify([oa.error, ob.error]));
const orgA = oa.data,
  orgB = ob.data;
const payload = (org: string, name: string) => ({
  organization_id: org,
  name,
  industry: "Services",
  location: "Test City",
  website: `https://${name.toLowerCase().replaceAll(" ", "-")}.example.test/`,
  email: null,
  phone: null,
  source_notes: "Synthetic local test fixture",
  estimated_value_cents: 300000,
  next_follow_up: "2026-11-17",
});
const la = await a.rpc("create_prospect", {
  payload: payload(orgA, `Alpha ${run}`),
});
const lb = await b.rpc("create_prospect", {
  payload: payload(orgB, `Beta ${run}`),
});
assert.ok(la.data && lb.data, JSON.stringify([la.error, lb.error]));
check(
  (await a.from("leads").select("id")).data?.length === 1,
  "A sees only its lead",
);
check(
  (await a.from("businesses").select("id").eq("organization_id", orgB)).data
    ?.length === 0,
  "Cross-tenant businesses hidden",
);
check(
  (await a.from("organizations").select("id").eq("id", orgB)).data?.length ===
    0,
  "Cross-tenant organization hidden",
);
check(
  (await anon.from("leads").select("id")).error?.code === "42501",
  "Anonymous CRM reads denied",
);
check(
  Boolean(
    (
      await anon.rpc("create_organization", {
        organization_name: "Unauthorized",
      })
    ).error,
  ),
  "Anonymous organization creation denied",
);
check(
  Boolean(
    (
      await a.rpc("create_prospect", {
        payload: payload(orgB, `Forged ${run}`),
      })
    ).error,
  ),
  "Cross-tenant creation denied",
);
check(
  (
    await a
      .from("leads")
      .update({ status: "Won" })
      .eq("id", lb.data)
      .select("id")
  ).data?.length === 0,
  "Cross-tenant update affects no rows",
);
check(
  Boolean(
    (await a.from("leads").update({ organization_id: orgB }).eq("id", la.data))
      .error,
  ),
  "Moving tenant forbidden by column permissions",
);
check(
  Boolean(
    (
      await a
        .from("organization_members")
        .insert({
          organization_id: orgB,
          user_id: ua.data.user!.id,
          role: "owner",
        })
    ).error,
  ),
  "Self-enrollment into other tenant denied",
);
check(
  Boolean(
    (
      await a
        .from("lead_notes")
        .insert({
          organization_id: orgA,
          lead_id: lb.data,
          body: "Cross-tenant note",
        })
    ).error,
  ),
  "Composite foreign key rejects cross-tenant note",
);
check(
  Boolean(
    (
      await a
        .from("lead_notes")
        .insert({
          organization_id: orgA,
          lead_id: la.data,
          body: "Forged author",
          created_by: ub.data.user!.id,
        })
    ).error,
  ),
  "Forged note author rejected",
);
const note = await a
  .from("lead_notes")
  .insert({
    organization_id: orgA,
    lead_id: la.data,
    body: "Verified local test note",
  })
  .select("id")
  .single();
check(!note.error, "Own note insert permitted");
check(
  Boolean(
    (
      await a
        .from("lead_notes")
        .update({ body: "Rewrite" })
        .eq("id", note.data!.id)
    ).error,
  ),
  "Note rewrite forbidden",
);
check(
  (await b.from("lead_notes").select("id").eq("lead_id", la.data)).data
    ?.length === 0,
  "Other tenant cannot read notes",
);
check(
  Boolean(
    (
      await a
        .from("audit_events")
        .insert({
          organization_id: orgA,
          entity_type: "leads",
          entity_id: la.data,
          action: "fake",
        })
    ).error,
  ),
  "Audit forgery forbidden",
);
check(
  (await a.from("audit_events").select("id").eq("organization_id", orgB)).data
    ?.length === 0,
  "Other tenant audit history hidden",
);
check(
  (await a.from("audit_events").select("id")).data!.length >= 4,
  "Database triggers record CRM changes",
);
const otherSummary = await a.rpc("crm_summary", { org: orgB });
check(
  (otherSummary.data as { total: number }).total === 0,
  "Summary RPC cannot aggregate another tenant",
);
check(
  (await a.rpc("create_prospect", { payload: payload(orgA, `Alpha ${run}`) }))
    .error?.code === "23505",
  "Duplicate prospect rejected",
);
const dupe = payload(orgA, `Alpha ${run}`);
dupe.name = "A different name";
dupe.website = dupe.website.replace("https://", "https://www.");
check(
  (await a.rpc("create_prospect", { payload: dupe })).error?.code === "23505",
  "www duplicate domain rejected",
);
const invalid = payload(orgA, `Rollback ${run}`) as Record<string, Json>;
invalid.estimated_value_cents = -1;
check(
  Boolean((await a.rpc("create_prospect", { payload: invalid })).error),
  "Invalid lead rejected",
);
check(
  (await a.from("businesses").select("id").eq("name", `Rollback ${run}`)).data
    ?.length === 0,
  "Business insert rolled back when lead insert fails",
);
check(
  !(await a.from("leads").update({ status: "Qualified" }).eq("id", la.data))
    .error,
  "Own lead update permitted",
);
const ownSummary = await a.rpc("crm_summary", { org: orgA });
check(
  (ownSummary.data as { qualified: number }).qualified === 1,
  "Database metric reflects actual lead update",
);
console.log(
  `${passed} RLS/integrity assertions passed against local PostgreSQL + Supabase Auth + PostgREST.`,
);
console.log(
  `Synthetic test organizations: RLS A ${run}, RLS B ${run}. Kept for inspection; never use this script against production.`,
);
