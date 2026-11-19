// Every engine fixture and clock change lives in a disposable local database.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { assertLocalTestEnvironment } from "./local-guard";
import { parseCsv, autoMapping, previewRows } from "../../src/lib/imports/csv";
assertLocalTestEnvironment();
const base = [
  "compose",
  "--env-file",
  "work/stack.env",
  "-f",
  "compose.phase1.yml",
  "exec",
  "-T",
  "db",
];
const database = "engine_test_" + randomUUID().replaceAll("-", "").slice(0, 12),
  owner = randomUUID(),
  member = randomUUID(),
  outsider = randomUUID();
const clock = "'2026-11-18T15:00:00Z'::timestamptz";
function sql(db: string, input: string, ok = true) {
  const r = spawnSync(
    "docker",
    [
      ...base,
      "psql",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      db,
    ],
    { input, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (ok) assert.equal(r.status, 0, r.stderr);
  return ok ? r.stdout.trim() : r.status !== 0;
}
const quoted = (value: unknown) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const prefix = (user = owner) =>
  `set request.jwt.claims='{"sub":"${user}","role":"authenticated"}';set role authenticated;`;
let org = "",
  passed = 0;
const call = (op: string, p: Record<string, unknown> = {}, user = owner) =>
  JSON.parse(
    String(
      sql(
        database,
        prefix(user) +
          `select public.engine_control('${org}',${quoted({ ...p, op })});`,
      ),
    ) || "null",
  );
const check = (value: unknown, label: string) => {
  assert.ok(value, label);
  passed++;
};
const fails = (op: string, p: Record<string, unknown> = {}, user = owner) =>
  sql(
    database,
    prefix(user) +
      `select public.engine_control('${org}',${quoted({ ...p, op })});`,
    false,
  );
const rpc = (name: string, p: Record<string, unknown>, user = owner) =>
  JSON.parse(
    String(
      sql(
        database,
        prefix(user) + `select public.${name}('${org}',${quoted(p)});`,
      ),
    ) || "null",
  );
const auth = spawnSync(
  "docker",
  [
    ...base,
    "pg_dump",
    "-U",
    "postgres",
    "--schema-only",
    "--schema=auth",
    "postgres",
  ],
  { encoding: "utf8" },
);
assert.equal(auth.status, 0, auth.stderr);
sql("postgres", `create database ${database}`);
try {
  sql(database, auth.stdout);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql(
      database,
      readFileSync(`supabase/migrations/${f}`, "utf8").replaceAll(
        "now()",
        clock,
      ),
    );
  sql(
    database,
    `insert into auth.users(id,email) values('${owner}','engine-owner@example.test'),('${member}','engine-member@example.test'),('${outsider}','engine-outsider@example.test');`,
  );
  org = String(
    sql(
      database,
      prefix() + "select public.create_organization('Synthetic engine test');",
    ),
  );
  sql(
    database,
    `insert into public.organization_members(organization_id,user_id,role) values('${org}','${member}','member');`,
  );
  const settings = {
    enabled: true,
    target_leads: 1000,
    contact_goal: 10000,
    research_enabled: true,
    discovery_enabled: false,
    auto_import: false,
    daily_research_limit: 25,
    daily_discovery_limit: 24,
    territories: [
      { city: "Erie", state: "PA" },
      { city: "Dunkirk", state: "NY" },
    ],
    categories: ["cleaning", "cafe", "beauty"],
    ai_provider: "rules",
    ai_model: "",
  };
  check(
    Boolean(call("configure", settings)?.saved),
    "Owner configures bounded engine",
  );
  check(fails("configure", settings, member), "Member cannot configure engine");
  check(
    fails("configure", settings, outsider),
    "Other tenant cannot configure engine",
  );
  check(
    sql(
      database,
      `set role anon;select public.engine_control('${org}','{"op":"tick"}');`,
      false,
    ),
    "Anonymous execution denied",
  );
  check(
    sql(
      database,
      prefix() +
        `update public.engine_settings set target_leads=2000 where organization_id='${org}';`,
      false,
    ),
    "Direct settings mutation denied",
  );
  sql(
    database,
    `set request.jwt.claims='{"sub":"${owner}"}';with b as(insert into public.businesses(organization_id,name,industry,location,website,email,created_by) select '${org}','Synthetic engine '||lpad(i::text,4,'0'),'Cleaning','Test City PA','https://engine-'||i||'.example.test','business-'||i||'@example.test','${owner}' from generate_series(1,1205) i returning id,name) insert into public.leads(organization_id,business_id,created_by,status,research_priority) select '${org}',id,'${owner}','Discovered',case when name like '%0001' then 'A' else 'C' end from b;`,
  );
  const page = rpc("pipeline_page", {}),
    discovered = page.groups.find(
      (g: { status: string }) => g.status === "Discovered",
    );
  check(
    page.total === 1205 &&
      discovered.count === 1205 &&
      discovered.leads.length === 12,
    "Full pipeline includes more than 1000 records",
  );
  check(
    discovered.leads[0].research_priority === "A",
    "A priority precedes newer C records",
  );
  const last = rpc("pipeline_page", { stage: "Discovered", page: 101 });
  check(
    last.groups[0].leads.length === 5,
    "Last server page reaches records beyond the previous cap",
  );
  check(
    rpc("pipeline_page", { query: "Synthetic engine 1205" }).total === 1,
    "Search finds an older record beyond the loaded slice",
  );
  check(
    rpc("pipeline_page", {}, member).total === 1205,
    "Member reads own full pipeline",
  );
  check(
    sql(
      database,
      prefix(outsider) + `select public.pipeline_page('${org}');`,
      false,
    ),
    "Cross-tenant pipeline reads rejected",
  );
  const inventory = JSON.parse(
    String(
      sql(database, prefix() + `select public.inventory_summary('${org}');`),
    ),
  );
  check(
    inventory.active_leads === 1205 && inventory.trashed_leads === 0,
    "Inventory reconciles real active and Trash counts",
  );
  const lead = discovered.leads[0].id;
  const tick = call("tick");
  check(tick.active === true, "Clock-controlled weekday heartbeat executes");
  check(
    call("tick").active === false,
    "Duplicate heartbeat does not create a burst",
  );
  const job = JSON.parse(
    String(
      sql(database, prefix() + `select public.claim_agent_job('${org}');`),
    ),
  );
  check(
    job.job.kind === "research_audit" && job.job.lead_id === lead,
    "Research claims the highest-priority prospect",
  );
  const points = ["Digital Presence", "Social Presence", "Customer Growth"].map(
    (pillar) => ({
      pillar,
      observation: "Synthetic source observation",
      recommendation: "Synthetic recommendation",
      source_url: "https://example.org/source",
      verification_status: "verified",
      confidence: "high",
      last_researched_date: "2026-11-18",
    }),
  );
  sql(
    database,
    prefix() +
      `select public.finish_agent_job('${org}','${job.job.id}','${job.job.lease_token}',${quoted({ points, suggested_offer: "Discuss scope", provider: "synthetic", public_contacts: [{ email: "captured@example.test", source_url: "https://example.org/contact" }] })});`,
  );
  check(
    fails("accept_research", {
      job_id: job.job.id,
      confirmed: true,
      contact_email: "invented@example.test",
    }),
    "Research cannot copy an email absent from the captured proposal",
  );
  check(
    fails("accept_research", {
      job_id: job.job.id,
      confirmed: true,
      contact_email: "captured@example.test",
    }),
    "Research cannot overwrite an existing business email",
  );
  call("accept_research", { job_id: job.job.id, confirmed: true });
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.growth_review_points where organization_id='${org}' and verification_status='verified';`,
      ),
    ) === 0,
    "Research acceptance cannot mark its own findings verified",
  );
  let review = JSON.parse(
    String(
      sql(
        database,
        prefix() +
          `select to_jsonb(r) from public.growth_reviews r where lead_id='${lead}';`,
      ),
    ),
  );
  sql(
    database,
    prefix() +
      `select public.save_growth_review('${org}','${lead}',${review.revision},${quoted(points)},'Discussion only');`,
  );
  review = JSON.parse(
    String(
      sql(
        database,
        prefix() +
          `select to_jsonb(r) from public.growth_reviews r where lead_id='${lead}';`,
      ),
    ),
  );
  sql(
    database,
    prefix() +
      `select public.approve_growth_review('${org}','${lead}',${review.revision});select public.configure_agents('${org}',${quoted({ paused: false, daily_job_limit: 100, explee_daily_credit_limit: 0, sender_name: "Synthetic Owner", sender_email: "contact.irrelevantcollective@gmail.com", postal_address: "Synthetic test address" })});`,
  );
  const policy = {
    daily_limit: 25,
    total_limit: 100,
    follow_ups: true,
    auto_replies: true,
    auto_meetings: true,
    confirmed: true,
    expected_revision: 0,
    key_id: "test",
    template_version: "sourced-v1",
    expected_sender: {
      name: "Synthetic Owner",
      email: "contact.irrelevantcollective@gmail.com",
      address: "Synthetic test address",
    },
  };
  check(
    fails("approve_campaign", policy),
    "Campaign requires sending and tracked-thread scopes",
  );
  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events.owned",
  ];
  sql(
    database,
    prefix() +
      `select public.google_connection('${org}',${quoted({ op: "save", key_id: "test", email: "contact.irrelevantcollective@gmail.com", ciphertext: "synthetic-not-a-real-credential-envelope-00000000", scopes })});`,
  );
  check(
    fails("approve_campaign", {
      ...policy,
      expected_sender: { ...policy.expected_sender, address: "Stale address" },
    }),
    "Stale sender identity cannot approve a campaign",
  );
  check(
    call("approve_campaign", policy).revision === 1,
    "Owner approves the reviewed seven-day policy",
  );
  const prepared = call("prepare_send", {
    lead_id: lead,
    kind: "intro",
    key_id: "test",
  });
  check(
    prepared?.id,
    "Approved three-pillar review generates a persisted introduction",
  );
  check(
    call("prepare_send", { lead_id: lead, kind: "intro", key_id: "test" })
      .id === prepared.id,
    "Introduction preparation is idempotent",
  );
  check(
    call("claim_send", { id: prepared.id, key_id: "test" }) === null,
    "Automatic sending waits for observed account volume",
  );
  call("account_usage", { count: 500, key_id: "test" });
  check(
    call("claim_send", { id: prepared.id, key_id: "test" }) === null,
    "Mail sent outside this app consumes the allowance",
  );
  call("account_usage", { count: 0, key_id: "test" });
  const claimed = call("claim_send", { id: prepared.id, key_id: "test" });
  check(
    claimed?.status === "sending" &&
      claimed.body.includes("Synthetic source observation"),
    "Exact rendered evidence is reserved before delivery",
  );
  check(
    call("claim_send", { id: prepared.id, key_id: "test" }) === null,
    "A claimed message cannot send twice",
  );
  rpc("finish_email_delivery", {
    id: prepared.id,
    message_id: "synthetic-gmail-1",
    thread_id: "synthetic-thread",
  });
  const reply = {
    lead_id: lead,
    message_id: "synthetic-reply-1",
    thread_id: "synthetic-thread",
    received_at: "2026-11-18T15:00:00Z",
    subject: "Re: review",
    body: "Sounds good",
    classification: "positive",
    selected_option: null,
    authenticated_sender: true,
  };
  const saved = call("record_reply", reply);
  check(saved.id, "Gmail reply becomes an actual contact event");
  check(
    call("record_reply", reply).id === saved.id,
    "Reply sync is idempotent",
  );
  const offer = call("offer_slots", {
    reply_id: saved.id,
    key_id: "test",
    slots: [
      { starts_at: "2026-11-19T14:00:00Z", ends_at: "2026-11-19T14:30:00Z" },
      { starts_at: "2026-11-19T15:00:00Z", ends_at: "2026-11-19T15:30:00Z" },
    ],
  });
  check(
    offer.id,
    "Authenticated positive reply may receive checked appointment options",
  );
  check(
    fails("record_booking", {
      reply_id: saved.id,
      offer_id: offer.id,
      key_id: "test",
    }),
    "Positive interest alone cannot book a meeting",
  );
  check(
    fails("offer_slots", {
      reply_id: saved.id,
      key_id: "test",
      slots: [
        { starts_at: "2026-11-21T14:00:00Z", ends_at: "2026-11-21T14:30:00Z" },
        { starts_at: "2026-11-21T15:00:00Z", ends_at: "2026-11-21T15:30:00Z" },
      ],
    }) === false,
    "Existing offer lookup is idempotent and never replaced by a new slot payload",
  );
  sql(
    database,
    `update public.email_deliveries set started_at='2026-11-18T14:58:00Z' where id='${prepared.id}';`,
  );
  call("thread_checked", {
    lead_id: lead,
    thread_id: "synthetic-thread",
    rfc_message_id: "<synthetic-reply@example.test>",
  });
  const offerMessage = call("prepare_send", {
    lead_id: lead,
    kind: "offer",
    reply_id: saved.id,
    offer_id: offer.id,
    key_id: "test",
  });
  check(
    Boolean(offerMessage?.id),
    "An offered appointment is prepared from the positive reply",
  );
  check(
    call("claim_send", { id: offerMessage.id, key_id: "test" })?.status ===
      "sending",
    "A freshly synchronized appointment offer is claimed once",
  );
  rpc("finish_email_delivery", {
    id: offerMessage.id,
    message_id: "synthetic-offer-message",
    thread_id: "synthetic-thread",
  });
  call("ack_sent", { id: offerMessage.id });
  const selection = call("record_reply", {
    ...reply,
    message_id: "synthetic-selection",
    classification: "selection",
    body: "Option 1",
    selected_option: 1,
  });
  sql(
    database,
    prefix() +
      `update public.leads set estimated_value_cents=300000 where id='${lead}';`,
  );
  const booking = call("record_booking", {
    reply_id: selection.id,
    offer_id: offer.id,
    key_id: "test",
  });
  check(
    booking.meeting.starts_at === "2026-11-19T14:00:00+00:00",
    "Only the exact selected offered time is booked",
  );
  check(
    call("record_booking", {
      reply_id: selection.id,
      offer_id: offer.id,
      key_id: "test",
    }).meeting.id === booking.meeting.id,
    "Repeated selection cannot create a duplicate meeting",
  );
  rpc("calendar_meeting", {
    id: booking.meeting.id,
    op: "claim",
    invite_guest: true,
  });
  rpc("calendar_meeting", {
    id: booking.meeting.id,
    op: "finish",
    event_id: "ir" + booking.meeting.id.replaceAll("-", ""),
    calendar_url: "https://www.google.com/calendar/event?eid=synthetic",
  });
  call("booking_result", { offer_id: offer.id });
  check(
    rpc("acquisition_state", { metrics_only: true }).meeting_value_cents ===
      300000,
    "Recorded agreed meeting updates estimated opportunity value",
  );
  check(
    sql(
      database,
      prefix() +
        `select public.change_lead_trash('${org}','${lead}',false,(select updated_at from public.leads where id='${lead}'));`,
      false,
    ),
    "Future appointment prevents lead removal",
  );
  const opt = call("record_reply", {
    ...reply,
    message_id: "synthetic-optout",
    classification: "opt_out",
    body: "Please stop emailing me",
  });
  check(opt.classification === "opt_out", "Actual opt-out is recorded");
  check(
    fails("prepare_send", {
      lead_id: lead,
      kind: "follow_up_1",
      key_id: "test",
    }),
    "Suppression is enforced before follow-up preparation",
  );
  const status = String(
    sql(
      database,
      prefix() + `select status from public.leads where id='${lead}';`,
    ),
  );
  check(status === "Suppressed", "Opt-out suppresses the lead");
  check(
    Boolean(
      sql(
        database,
        prefix() +
          `select handled_at from public.engine_replies where id='${selection.id}';`,
      ),
    ),
    "A later genuine reply retires an older pending automatic response",
  );
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.suppression_entries where lead_id='${lead}';`,
      ),
    ) === 1,
    "Suppression identity is retained",
  );
  call("pause_campaign");
  check(
    fails("approve_campaign", { ...policy, expected_revision: 0 }),
    "Old campaign revision cannot be reused",
  );
  check(
    sql(
      database,
      prefix(outsider) + `select public.engine_state('${org}');`,
      false,
    ),
    "Other tenant cannot inspect engine state",
  );
  const state = rpc("engine_state", {});
  check(
    state.sent === 2 && state.replies.length === 3,
    "Engine metrics reflect recorded confirmations and replies only",
  );
  const secondLead = discovered.leads[1].id;
  let secondRevision = Number(
    sql(
      database,
      prefix() +
        `select revision from public.growth_reviews where lead_id='${secondLead}';`,
    ),
  );
  sql(
    database,
    prefix() +
      `select public.save_growth_review('${org}','${secondLead}',${secondRevision},${quoted(points)},'Discussion only');`,
  );
  secondRevision = Number(
    sql(
      database,
      prefix() +
        `select revision from public.growth_reviews where lead_id='${secondLead}';`,
    ),
  );
  sql(
    database,
    prefix() +
      `select public.approve_growth_review('${org}','${secondLead}',${secondRevision});`,
  );
  // Resume only the synthetic policy, then mutate contact after preparation.
  call("approve_campaign", { ...policy, expected_revision: 1 });
  const staleMessage = call("prepare_send", {
    lead_id: secondLead,
    kind: "intro",
    key_id: "test",
  });
  sql(
    database,
    prefix() +
      `update public.businesses set email='changed@example.test' where id=(select business_id from public.leads where id='${secondLead}');`,
  );
  check(
    call("claim_send", { id: staleMessage.id, key_id: "test" }) === null &&
      String(
        sql(
          database,
          prefix() +
            `select status from public.email_deliveries where id='${staleMessage.id}';`,
        ),
      ) === "cancelled",
    "A contact changed after preparation cancels the exact queued introduction",
  );
  call("pause_campaign");
  const uncertainManual = randomUUID();
  sql(
    database,
    `insert into public.email_deliveries(id,organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,request_key,fingerprint,status,created_by,started_at) select '${uncertainManual}',organization_id,lead_id,recipient,subject,body,draft_updated_at,review_revision,gen_random_uuid(),'synthetic-manual-unknown','unknown',created_by,${clock} from public.email_deliveries where id='${staleMessage.id}';`,
  );
  check(
    rpc("engine_state", {}).outbox.some(
      (d: { id: string; kind: string }) =>
        d.id === uncertainManual && d.kind === "manual",
    ),
    "Uncertain manual sends are visible alongside campaign outcomes for reconciliation",
  );
  call("resolve_delivery", {
    id: uncertainManual,
    message_id: "",
    confirmed: true,
  });
  check(
    String(
      sql(
        database,
        prefix() +
          `select status from public.email_deliveries where id='${uncertainManual}';`,
      ),
    ) === "failed",
    "Owner can reconcile a prior manual unknown without re-sending it",
  );
  sql(
    database,
    `insert into public.agent_jobs(organization_id,lead_id,kind,status,input,attempts,created_at,started_at) select '${org}','${secondLead}','research_audit','failed','{"ai_provider":"rules","ai_model":""}',1,${clock}-interval '1 day',${clock} from generate_series(1,24);`,
  );
  const backlog = String(
    sql(
      database,
      prefix() +
        `select public.enqueue_agent_job('${org}','research_audit','${secondLead}','synthetic-backlog-job','{"ai_provider":"openai","ai_model":"unapproved"}');`,
    ),
  );
  check(
    String(
      sql(
        database,
        prefix() +
          `select input->>'ai_provider' from public.agent_jobs where id='${backlog}';`,
      ),
    ) === "rules",
    "A direct enqueue cannot select an unapproved paid provider",
  );
  check(
    JSON.parse(
      String(
        sql(
          database,
          prefix() +
            `select coalesce(public.claim_agent_job('${org}'),'null'::jsonb);`,
        ),
      ),
    ) === null,
    "Carried-over research starts consume today's dispatch allowance",
  );
  const csv =
    "business_name,industry,location,source_url,source_timestamp,research_priority,audit_hypothesis_not_verified\n" +
    Array.from(
      { length: 1001 },
      (_, i) =>
        `Large import ${i},Synthetic services,Test Town PA,https://www.openstreetmap.org/node/${100000 + i},2026-11-18T12:00:00Z,C,Unverified research starting point`,
    ).join("\n");
  const parsed = parseCsv(csv),
    mapping = autoMapping(parsed.headers),
    rows = previewRows(parsed.records, mapping);
  const previewSql = `select public.preview_prospect_import('${org}','Large synthetic import','large.csv','${createHash("sha256").update(csv).digest("hex")}',${quoted(mapping)},${quoted(rows)});`;
  const batch = String(sql(database, prefix() + previewSql));
  check(
    batch === String(sql(database, prefix() + previewSql)),
    "A 1001-row preview is fingerprint-idempotent",
  );
  sql(
    database,
    prefix() +
      `select public.commit_prospect_import('${org}','${batch}');select public.commit_prospect_import('${org}','${batch}');`,
  );
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.leads where research_metadata->>'import_batch_id'='${batch}';`,
      ),
    ) === 1001,
    "Repeated large import commits create exactly 1001 leads",
  );
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.businesses where source_url like 'https://www.openstreetmap.org/node/%' and source_observed_at='2026-11-18T12:00:00Z';`,
      ),
    ) === 1001,
    "Large imports preserve source URLs and collection timestamps",
  );
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.leads where research_metadata->>'import_batch_id'='${batch}' and status='Discovered' and estimated_value_cents is null and research_metadata->>'independently_verified'='false';`,
      ),
    ) === 1001,
    "Large imports remain unverified Discovered prospects without assumed budgets",
  );
  const duplicateBatch = String(
    sql(
      database,
      prefix() +
        previewSql.replace(
          createHash("sha256").update(csv).digest("hex"),
          createHash("sha256")
            .update(csv + "\n")
            .digest("hex"),
        ),
    ),
  );
  sql(
    database,
    prefix() +
      `select public.commit_prospect_import('${org}','${duplicateBatch}');`,
  );
  check(
    Number(
      sql(
        database,
        prefix() +
          `select count(*) from public.import_rows where batch_id='${duplicateBatch}' and status='duplicate';`,
      ),
    ) === 1001,
    "A differently fingerprinted re-import skips all existing business identities",
  );
  check(
    Number(
      sql(
        database,
        `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'engine_%' and p.prosecdef and p.proconfig @> array['search_path=""'] and has_function_privilege('anon',p.oid,'execute');`,
      ),
    ) === 0,
    "Anonymous users cannot execute private engine helpers",
  );
  console.log(
    `Engine integration: ${passed} checks passed in a disposable local database. No Google or discovery calls were made.`,
  );
} finally {
  sql("postgres", `drop database if exists ${database} with(force)`);
}
