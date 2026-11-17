import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../src/lib/supabase/database.types";
import { assertLocalTestEnvironment } from "./local-guard";
import { claimedJobSchema } from "../../src/lib/agents/contracts";
import { prepare } from "../../src/lib/agents/prepare";
import { PILLARS } from "../../src/lib/reviews";
const { url, key } = assertLocalTestEnvironment();
const make = () =>
  createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = make(),
  b = make(),
  member = make(),
  anonymous = make();
let passed = 0;
function check(c: unknown, message: string) {
  assert.ok(c, message);
  passed++;
}
const run = randomUUID().slice(0, 8);
for (const [i, db] of [a, b, member].entries()) {
  const result = await db.auth.signUp({
    email: `agents-${run}-${i}@example.test`,
    password: `Test-only-${randomUUID()}!`,
  });
  assert.ok(
    result.data.session,
    result.error?.message ?? "Expected local session",
  );
}
const org = (
  await a.rpc("create_organization", { organization_name: `Agent Test ${run}` })
).data!;
const other = (
  await b.rpc("create_organization", {
    organization_name: `Other Agent Test ${run}`,
  })
).data!;
assert.ok(org && other);
function sql(query: string) {
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
      "-U",
      "postgres",
    ],
    { input: query, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
sql(
  `insert into public.organization_members(organization_id,user_id,role) values('${org}','${(await member.auth.getUser()).data.user!.id}','member');`,
);
const lead = (
  await a.rpc("create_prospect", {
    payload: {
      organization_id: org,
      name: `Example ${run}`,
      industry: "Cleaning",
      location: "Erie PA",
      website: `https://${run}.example.test`,
      email: `hello@${run}.example.test`,
    },
  })
).data!;
assert.ok(lead);
const config = {
  paused: false,
  daily_job_limit: 25,
  explee_daily_credit_limit: 0,
  sender_name: "Test Operator",
  sender_email: "hello@example.test",
  postal_address: "123 Example Street",
};
const queue = (
  kind: string = "research_plan",
  request_key = randomUUID(),
  target = lead,
) =>
  a.rpc("enqueue_agent_job", {
    org,
    job_kind: kind,
    lead: target,
    request_key,
  });
check(Boolean((await queue()).error), "Default state is paused");
check(
  Boolean((await member.rpc("configure_agents", { org, config })).error),
  "Member cannot change limits",
);
check(
  Boolean((await b.rpc("configure_agents", { org, config })).error),
  "Other tenant cannot configure agents",
);
assert.equal((await a.rpc("configure_agents", { org, config })).error, null);
check(
  Boolean((await queue("outreach_draft")).error),
  "Unverified review cannot generate outreach",
);
check(
  Boolean((await queue("follow_up")).error),
  "Uncontacted lead cannot generate follow-up",
);
const request = randomUUID();
const results = await Promise.all([
  queue("research_plan", request),
  queue("research_plan", request),
]);
check(
  results.every((r) => !r.error) && results[0].data === results[1].data,
  "Concurrent enqueue is idempotent",
);
check(
  (await b.from("agent_jobs").select("id")).data?.length === 0,
  "Tenant RLS hides jobs",
);
check(
  (await anonymous.from("agent_jobs").select("id")).error !== null,
  "Anonymous cannot read jobs",
);
check(
  Boolean(
    (
      await a
        .from("agent_jobs")
        .update({ status: "succeeded" })
        .eq("id", results[0].data!)
    ).error,
  ),
  "Direct job forgery denied",
);
check(
  Boolean((await member.rpc("claim_agent_job", { org })).error),
  "Member cannot run agent",
);
check(
  Boolean((await b.rpc("claim_agent_job", { org })).error),
  "Other tenant cannot claim jobs",
);
check(
  Boolean((await anonymous.rpc("claim_agent_job", { org })).error),
  "Anonymous owner-less claim denied",
);
const first = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
check(
  first.job.kind === "research_plan",
  "Authenticated owner claims only eligible jobs",
);
check(
  !(await a.rpc("claim_agent_job", { org })).data,
  "Concurrent claim cannot steal an active lease",
);
check(
  Boolean(
    (
      await a.rpc("finish_agent_job", {
        org,
        job: first.job.id,
        lease: randomUUID(),
        output: { title: "forged" },
      })
    ).error,
  ),
  "Incorrect lease cannot finish",
);
assert.equal(
  (
    await a.rpc("finish_agent_job", {
      org,
      job: first.job.id,
      lease: first.job.lease_token,
      output: prepare(first) as unknown as Json,
    })
  ).error,
  null,
);
check(
  (await a.from("agent_jobs").select("status").eq("id", first.job.id).single())
    .data?.status === "succeeded",
  "Worker result persisted",
);
// A sourced, manually approved review is still required before outreach preparation.
let revision = 1;
const points = PILLARS.map((pillar, i) => ({
  pillar,
  observation: i === 0 ? "The contact page lists a public phone number." : "",
  recommendation:
    i === 0 ? "Discuss whether a quote form would be useful." : "",
  source_url: i === 0 ? `https://${run}.example.test/contact` : null,
  verification_status: i === 0 ? "verified" : "unverified",
  confidence: i === 0 ? "high" : "unknown",
  last_researched_date: i === 0 ? "2026-11-17" : null,
}));
assert.equal(
  (
    await a.rpc("save_growth_review", {
      org,
      lead,
      expected_revision: revision,
      points,
      offer: "Digital Foundation",
    })
  ).error,
  null,
);
revision++;
assert.equal(
  (
    await a.rpc("approve_growth_review", {
      org,
      lead,
      expected_revision: revision,
    })
  ).error,
  null,
);
const draftJob = (await queue("outreach_draft")).data!;
assert.ok(draftJob);
const context = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
const output = prepare(context) as unknown as Json;
assert.equal(
  (
    await a.rpc("finish_agent_job", {
      org,
      job: draftJob,
      lease: context.job.lease_token,
      output,
    })
  ).error,
  null,
);
check(
  Boolean(
    (await member.rpc("accept_agent_draft", { org, job: draftJob })).error,
  ),
  "Member cannot accept proposal",
);
assert.equal(
  (await a.rpc("accept_agent_draft", { org, job: draftJob })).error,
  null,
);
check(
  (
    await a
      .from("outreach_drafts")
      .select("status,email_draft")
      .eq("lead_id", lead)
      .single()
  ).data?.status === "draft",
  "Accept remains draft-only",
);
check(
  !(await a.rpc("accept_agent_draft", { org, job: draftJob })).error,
  "Repeated acceptance is idempotent",
);
const staleId = (await queue("outreach_draft")).data!;
const stale = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
assert.equal(
  (
    await a.rpc("finish_agent_job", {
      org,
      job: staleId,
      lease: stale.job.lease_token,
      output: prepare(stale) as unknown as Json,
    })
  ).error,
  null,
);
assert.equal(
  (
    await a.rpc("save_outreach_draft", {
      org,
      lead,
      email_body: "A newer human edit",
      opening_script: "A newer script",
    })
  ).error,
  null,
);
check(
  Boolean((await a.rpc("accept_agent_draft", { org, job: staleId })).error),
  "Stale proposals cannot overwrite manual edits",
);
const follow = () => queue("follow_up");
check(
  Boolean((await follow()).error),
  "Draft acceptance is not actual outbound contact",
);
assert.equal(
  (
    await a.rpc("log_contact_event", {
      org,
      lead,
      event_kind: "outbound_email",
      event_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      event_note: "Synthetic historical email actually sent outside app",
    })
  ).error,
  null,
);
const followId = (await follow()).data!;
check(Boolean(followId), "Logged historical outbound permits preparation");
assert.equal(
  (
    await a.rpc("log_contact_event", {
      org,
      lead,
      event_kind: "reply",
      event_at: new Date().toISOString(),
      event_note: "Synthetic reply",
    })
  ).error,
  null,
);
check(
  (await a.from("agent_jobs").select("status").eq("id", followId).single()).data
    ?.status === "cancelled",
  "Reply cancels pending follow-up",
);
check(Boolean((await follow()).error), "Reply blocks more follow-up jobs");
const cancelledId = (await queue()).data!;
const cancelled = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
await a.rpc("stop_agent_jobs", { org });
check(
  Boolean(
    (
      await a.rpc("finish_agent_job", {
        org,
        job: cancelledId,
        lease: cancelled.job.lease_token,
        output: { title: "late" },
      })
    ).error,
  ),
  "Stop invalidates active lease",
);
check(
  !(await a.rpc("claim_agent_job", { org })).data,
  "Paused agents cannot claim work",
);
await a.rpc("configure_agents", { org, config });
const expiredId = (await queue()).data!;
const expired = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
sql(
  `update public.agent_jobs set lease_until=now()-interval '1 second' where id='${expiredId}';`,
);
const retry = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
check(
  retry.job.id === expiredId &&
    retry.job.lease_token !== expired.job.lease_token,
  "Expired pure job is reclaimed with a new lease",
);
check(
  Boolean(
    (
      await a.rpc("finish_agent_job", {
        org,
        job: expiredId,
        lease: expired.job.lease_token,
        output: {},
      })
    ).error,
  ),
  "Expired lease rejected after reclaim",
);
await a.rpc("finish_agent_job", {
  org,
  job: expiredId,
  lease: retry.job.lease_token,
  failure: "Synthetic failure",
});
sql(
  `update public.agent_jobs set run_after=now()-interval '1 second' where id='${expiredId}';`,
);
const finalTry = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
await a.rpc("finish_agent_job", {
  org,
  job: expiredId,
  lease: finalTry.job.lease_token,
  failure: "Synthetic failure",
});
check(
  (
    await a
      .from("agent_jobs")
      .select("status,attempts")
      .eq("id", expiredId)
      .single()
  ).data?.status === "failed",
  "Pure preparation retries bounded at three attempts",
);
const discoverArgs = {
  org,
  job_kind: "discovery",
  request_key: randomUUID(),
  parameters: { industry: "Cleaning", city: "Erie", count: 2 },
};
check(
  Boolean((await a.rpc("enqueue_agent_job", discoverArgs)).error),
  "Zero allowance blocks provider search",
);
await a.rpc("configure_agents", {
  org,
  config: { ...config, explee_daily_credit_limit: 1 },
});
const billedResult = await a.rpc("enqueue_agent_job", discoverArgs);
const billed = billedResult.data!;
assert.ok(billed, JSON.stringify(billedResult.error));
check(
  Boolean(
    (
      await a.rpc("enqueue_agent_job", {
        ...discoverArgs,
        request_key: randomUUID(),
      })
    ).error,
  ),
  "Reserved credits prevent over-budget enqueue",
);
const billedContext = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
await a.rpc("finish_agent_job", {
  org,
  job: billed,
  lease: billedContext.job.lease_token,
  failure: "Synthetic provider timeout",
});
check(
  (await a.from("agent_jobs").select("status").eq("id", billed).single()).data
    ?.status === "failed",
  "Ambiguous provider request is never retried",
);
await a.rpc("configure_agents", {
  org,
  config: { ...config, explee_daily_credit_limit: 3 },
});
const overId = (
  await a.rpc("enqueue_agent_job", {
    ...discoverArgs,
    request_key: randomUUID(),
  })
).data!;
const over = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org })).data,
);
await a.rpc("finish_agent_job", {
  org,
  job: overId,
  lease: over.job.lease_token,
  output: { companies: [], credits_charged: 2 },
});
check(
  (
    await a
      .from("agent_settings")
      .select("paused")
      .eq("organization_id", org)
      .single()
  ).data?.paused,
  "Unexpected provider charges automatically pause automation",
);
await a.rpc("configure_agents", { org, config });
await a.rpc("log_contact_event", {
  org,
  lead,
  event_kind: "opt_out",
  event_at: new Date().toISOString(),
  event_note: "Synthetic opt-out",
});
check(
  (await a.from("suppression_entries").select("id")).data?.length === 1,
  "Opt-out persists suppression",
);
check(
  (await b.from("suppression_entries").select("id")).data?.length === 0,
  "Suppression RLS protects tenant",
);
check(
  Boolean((await queue()).error),
  "Suppressed leads cannot queue preparation",
);
await a.from("leads").update({ status: "Researching" }).eq("id", lead);
check(
  Boolean((await queue()).error),
  "Changing CRM stage does not bypass suppression",
);
check(
  Boolean(
    (
      await a.rpc("approve_growth_review", {
        org,
        lead,
        expected_revision: revision,
      })
    ).error,
  ),
  "Suppression blocks Ready for Outreach approval",
);
check(
  Boolean(
    (
      await a
        .from("contact_events")
        .update({ note: "rewritten" })
        .eq("lead_id", lead)
    ).error,
  ),
  "Contact history is append-only",
);
// New key-free provider permissions and quotas. No real provider requests here.
const freeOrg = (
  await a.rpc("create_organization", {
    organization_name: `Free Discovery ${run}`,
  })
).data!;
check(
  Boolean((await anonymous.rpc("resume_preparation", { org: freeOrg })).error),
  "Anonymous cannot resume preparation",
);
check(
  Boolean((await b.rpc("resume_preparation", { org: freeOrg })).error),
  "Other tenant cannot resume preparation",
);
check(
  Boolean((await member.rpc("resume_preparation", { org })).error),
  "Member cannot resume preparation",
);
check(
  Boolean((await b.rpc("preparation_capabilities", { org: freeOrg })).error),
  "Capability probe requires membership",
);
check(
  Boolean(
    (await anonymous.rpc("preparation_capabilities", { org: freeOrg })).error,
  ),
  "Anonymous cannot probe capabilities",
);
check(
  !(await a.rpc("resume_preparation", { org: freeOrg })).error,
  "Owner resumes default free preparation",
);
const freeSettings = (
  await a
    .from("agent_settings")
    .select("*")
    .eq("organization_id", freeOrg)
    .single()
).data!;
check(
  freeSettings.paused === false && freeSettings.explee_daily_credit_limit === 0,
  "Resume enables preparation without paid allowance",
);
await a.rpc("configure_agents", {
  org: freeOrg,
  config: {
    ...config,
    paused: true,
    daily_job_limit: 8,
    sender_name: "Preserved Operator",
  },
});
await a.rpc("resume_preparation", { org: freeOrg });
const preserved = (
  await a
    .from("agent_settings")
    .select("*")
    .eq("organization_id", freeOrg)
    .single()
).data!;
check(
  preserved.daily_job_limit === 8 &&
    preserved.sender_name === "Preserved Operator" &&
    preserved.paused === false,
  "Resume preserves configured limits and sender identity",
);
const freeRequest = {
  org: freeOrg,
  job_kind: "discovery",
  request_key: randomUUID(),
  parameters: {
    provider: "osm",
    category: "plumber",
    industry: "Plumbing",
    city: "Erie",
    state: "PA",
    count: 5,
  },
};
const freeResult = await a.rpc("enqueue_agent_job", freeRequest);
check(
  Boolean(freeResult.data) && !freeResult.error,
  "Free discovery queues with zero Explee credits",
);
check(
  (await a.rpc("enqueue_agent_job", freeRequest)).data === freeResult.data,
  "Free discovery re-enqueue is idempotent even during cooldown",
);
check(
  Boolean(
    (
      await a.rpc("enqueue_agent_job", {
        ...freeRequest,
        request_key: randomUUID(),
      })
    ).error,
  ),
  "Free discovery enqueue cooldown is enforced",
);
const freeClaim = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org: freeOrg })).data,
);
check(
  freeClaim.job.id === freeResult.data && freeClaim.job.reserved_credits === 0,
  "Zero-allowance free discovery is claimable without reserving paid credits",
);
await a.rpc("finish_agent_job", {
  org: freeOrg,
  job: freeClaim.job.id,
  lease: freeClaim.job.lease_token,
  output: { provider: "osm", companies: [], credits_charged: 0 },
});
check(
  (
    await a
      .from("agent_settings")
      .select("paused")
      .eq("organization_id", freeOrg)
      .single()
  ).data?.paused === false,
  "Zero-cost result does not pause preparation",
);
sql(
  `update public.agent_jobs set created_at=now()-interval '2 minutes' where id='${freeClaim.job.id}';`,
);
const secondFree = (
  await a.rpc("enqueue_agent_job", {
    ...freeRequest,
    request_key: randomUUID(),
  })
).data!;
check(Boolean(secondFree), "Next free request queues after enqueue cooldown");
check(
  !(await a.rpc("claim_agent_job", { org: freeOrg })).data,
  "Execution cooldown prevents rapid provider requests",
);
sql(
  `update public.agent_jobs set started_at=now()-interval '2 minutes' where id='${freeClaim.job.id}';`,
);
const secondClaim = claimedJobSchema.parse(
  (await a.rpc("claim_agent_job", { org: freeOrg })).data,
);
await a.rpc("finish_agent_job", {
  org: freeOrg,
  job: secondClaim.job.id,
  lease: secondClaim.job.lease_token,
  failure: "Synthetic free provider timeout",
});
check(
  (await a.from("agent_jobs").select("status").eq("id", secondFree).single())
    .data?.status === "failed",
  "Free discovery timeouts are not automatically retried",
);
sql(
  `update public.agent_jobs set created_at=now()-interval '2 minutes' where id='${secondFree}';`,
);
const thirdFree = (
  await a.rpc("enqueue_agent_job", {
    ...freeRequest,
    request_key: randomUUID(),
  })
).data!;
check(Boolean(thirdFree), "Third daily free request queues");
sql(
  `update public.agent_jobs set created_at=now()-interval '2 minutes' where id='${thirdFree}';`,
);
check(
  Boolean(
    (
      await a.rpc("enqueue_agent_job", {
        ...freeRequest,
        request_key: randomUUID(),
      })
    ).error,
  ),
  "Daily free discovery cap blocks a fourth request",
);
check(
  Boolean(
    (
      await a.rpc("enqueue_agent_job", {
        ...freeRequest,
        request_key: randomUUID(),
        parameters: { ...freeRequest.parameters, category: null },
      })
    ).error,
  ),
  "Malformed direct free discovery request is rejected",
);
console.log(
  `${passed} agent integration assertions passed. No external provider was contacted.`,
);
