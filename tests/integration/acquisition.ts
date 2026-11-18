import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertLocalTestEnvironment } from "./local-guard";
import { PILLARS } from "../../src/lib/reviews";
import {
  messageBody,
  encodeApprovalBody,
  decodeApprovalBody,
} from "../../src/lib/acquisition/contracts";
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
for (const [i, db] of [owner, other, member].entries()) {
  const r = await db.auth.signUp({
    email: `acquisition-${run}-${i}@example.test`,
    password: `Test-only-${randomUUID()}!`,
  });
  assert.ok(
    r.data.session,
    r.error?.message ?? "Expected a local test session",
  );
}
let passed = 0;
function check(c: unknown, msg: string) {
  assert.ok(c, msg);
  passed++;
}
const org = (
  await owner.rpc("create_organization", {
    organization_name: `Acquisition Test ${run}`,
  })
).data;
assert.ok(org);
const foreign = (
  await other.rpc("create_organization", {
    organization_name: `Other Acquisition ${run}`,
  })
).data;
assert.ok(foreign);
const lead = (
  await owner.rpc("create_prospect", {
    payload: {
      organization_id: org,
      name: `Synthetic Business ${run}`,
      industry: "Cleaning",
      location: "Erie PA",
      website: `https://${run}.example.test`,
      email: `public@${run}.example.test`,
    },
  })
).data;
assert.ok(lead);
const memberId = (await member.auth.getUser()).data.user!.id;
const membership = spawnSync(
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
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: `insert into public.organization_members(organization_id,user_id,role) values('${org}','${memberId}','member');`,
    encoding: "utf8",
  },
);
assert.equal(membership.status, 0, membership.stderr);
const deniedNames = [
  "acquisition_state",
  "save_acquisition_settings",
  "enqueue_hourly_discovery",
  "discovery_seen_sources",
  "save_agreed_meeting",
  "cancel_sales_meeting",
  "approve_email_delivery",
  "claim_email_delivery",
  "finish_email_delivery",
  "calendar_meeting",
  "google_connection",
];
for (const name of deniedNames) {
  check(
    Boolean((await anon.rpc(name, { org, payload: {} })).error),
    `Anonymous denied ${name}`,
  );
  check(
    Boolean((await other.rpc(name, { org, payload: {} })).error),
    `Other tenant denied ${name}`,
  );
}
for (const name of deniedNames.filter(
  (name) => !["acquisition_state", "discovery_seen_sources"].includes(name),
))
  check(
    Boolean((await member.rpc(name, { org, payload: {} })).error),
    `Member cannot invoke owner action ${name}`,
  );
check(
  !(await member.rpc("acquisition_state", { org })).error,
  "Member reads tenant-safe acquisition state",
);
check(
  !(await member.rpc("discovery_seen_sources", { org })).error,
  "Member can read organization discovery provenance",
);
const settings = {
  enabled: true,
  categories: [
    "cleaning",
    "hvac",
    "plumber",
    "roofer",
    "electrician",
    "gardener",
    "builder",
  ],
  city: "Erie",
  state: "PA",
  sending_enabled: false,
};
check(
  !(await owner.rpc("save_acquisition_settings", { org, payload: settings }))
    .error,
  "Owner enables bounded hourly workflow",
);
check(
  (
    await owner
      .from("agent_settings")
      .select("daily_job_limit,paused")
      .eq("organization_id", org)
      .single()
  ).data?.daily_job_limit === 100,
  "Explicit hourly opt-in raises bounded daily ceiling",
);
const first = await owner.rpc("enqueue_hourly_discovery", { org }),
  again = await owner.rpc("enqueue_hourly_discovery", { org });
assert.equal(first.error, null);
check(
  again.data.queued === 0,
  "Same hourly bucket cannot enqueue duplicate searches",
);
check(
  [0, 7].includes(first.data.queued),
  "Current business window is enforced by database clock",
);
check(
  (await anon.from("sales_meetings").select("id")).error !== null,
  "Meeting table denies anonymous reads",
);
check(
  (await other.from("sales_meetings").select("id")).data?.length === 0,
  "Meeting RLS hides other tenants",
);
check(
  Boolean(
    (await owner.from("email_deliveries").insert({ organization_id: org }))
      .error,
  ),
  "Direct delivery forgery denied",
);
check(
  Boolean(
    (
      await owner.rpc("save_acquisition_settings", {
        org,
        payload: { ...settings, sending_enabled: true },
      })
    ).error,
  ),
  "Sending requires a connected scope",
);
check(
  Boolean(
    (
      await owner.rpc("google_connection", {
        org,
        payload: {
          op: "save",
          email: "other@example.test",
          ciphertext: "synthetic-encrypted-payload-not-a-token",
          scopes: [],
        },
      })
    ).error,
  ),
  "Company Gmail identity is fixed",
);
check(
  !(
    await owner.rpc("google_connection", {
      org,
      payload: {
        op: "save",
        email: "contact.irrelevantcollective@gmail.com",
        ciphertext: "synthetic-encrypted-payload-not-a-token",
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
      },
    })
  ).error,
  "Owner stores only an opaque synthetic envelope",
);
check(
  (await owner.rpc("acquisition_state", { org })).data.ciphertext === undefined,
  "Public state never serializes credentials",
);
const secondary = await owner.rpc("google_connection", {
  org,
  payload: {
    op: "save",
    key_id: "secondary",
    email: "contact.irrelevantcollective@gmail.com",
    ciphertext: "synthetic-secondary-envelope-no-token",
    scopes: [],
  },
});
assert.equal(secondary.error, null);
check(
  (await owner.rpc("google_connection", { org })).data.ciphertext ===
    "synthetic-encrypted-payload-not-a-token",
  "Another runtime cannot overwrite the primary encrypted credential",
);
check(
  (
    await owner.rpc("google_connection", {
      org,
      payload: { key_id: "secondary" },
    })
  ).data.ciphertext === "synthetic-secondary-envelope-no-token",
  "Runtime credential namespace is explicit",
);
await owner.rpc("google_connection", {
  org,
  payload: { op: "delete", key_id: "secondary" },
});
const agentSettings = {
  paused: false,
  daily_job_limit: 100,
  explee_daily_credit_limit: 0,
  sender_name: "Synthetic Operator",
  sender_email: "contact.irrelevantcollective@gmail.com",
  postal_address: "123 Synthetic Test Street",
};
await owner.rpc("configure_agents", { org, config: agentSettings });
await owner.rpc("save_acquisition_settings", {
  org,
  payload: { ...settings, enabled: false, sending_enabled: true },
});
const date = new Date(Date.now() + 7 * 86400000);
while ([0, 6].includes(date.getUTCDay()))
  date.setUTCDate(date.getUTCDate() + 1);
date.setUTCHours(14, 0, 0, 0);
const meeting = {
  lead_id: lead,
  kind: "call",
  starts_at: date.toISOString(),
  ends_at: new Date(+date + 1800000).toISOString(),
  agreement_note:
    "Synthetic agreement fixture; no actual client was contacted.",
  confirmed: true,
  estimated_value_cents: 300000,
  request_key: randomUUID(),
};
const booked = await owner.rpc("save_agreed_meeting", {
  org,
  payload: meeting,
});
assert.equal(
  booked.error,
  null,
  booked.error?.message ?? "Expected an agreed appointment",
);
check(Boolean(booked.data.id), "Owner records an agreed appointment");
check(
  (await owner.rpc("save_agreed_meeting", { org, payload: meeting })).data
    .id === booked.data.id,
  "Meeting creation idempotent",
);
check(
  Boolean(
    (
      await owner.rpc("save_agreed_meeting", {
        org,
        payload: { ...meeting, request_key: randomUUID() },
      })
    ).error,
  ),
  "Overlapping appointment rejected",
);
check(
  Boolean(
    (
      await owner.rpc("save_agreed_meeting", {
        org,
        payload: { ...meeting, request_key: randomUUID(), confirmed: false },
      })
    ).error,
  ),
  "Proposed slot cannot be recorded as agreed",
);
const secondMeeting = await owner.rpc("save_agreed_meeting", {
  org,
  payload: {
    ...meeting,
    starts_at: new Date(+date + 3600000).toISOString(),
    ends_at: new Date(+date + 5400000).toISOString(),
    request_key: randomUUID(),
  },
});
assert.equal(secondMeeting.error, null);
check(
  (
    await owner.rpc("acquisition_state", {
      org,
      payload: { metrics_only: true },
    })
  ).data.meeting_value_cents === 300000,
  "Two meetings count the same lead value once",
);
check(
  Boolean(
    (
      await owner.rpc("calendar_meeting", {
        org,
        payload: { id: booked.data.id, op: "claim" },
      })
    ).error,
  ),
  "Calendar scope is required before a sync claim",
);
await owner.rpc("google_connection", {
  org,
  payload: {
    op: "save",
    email: "contact.irrelevantcollective@gmail.com",
    ciphertext: "synthetic-encrypted-payload-not-a-token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events.owned",
    ],
  },
});
check(
  !(
    await owner.rpc("calendar_meeting", {
      org,
      payload: { id: booked.data.id, op: "claim" },
    })
  ).error,
  "Scoped owner can claim Calendar synchronization",
);
const synced = await owner.rpc("calendar_meeting", {
  org,
  payload: {
    id: booked.data.id,
    op: "finish",
    event_id: "ir" + booked.data.id.replaceAll("-", ""),
    calendar_url: "https://calendar.google.com/calendar/event?eid=synthetic",
  },
});
check(
  synced.data?.status === "scheduled",
  "Confirmed synthetic Calendar response is recorded",
);
check(
  Boolean(
    (
      await owner.rpc("cancel_sales_meeting", {
        org,
        payload: { id: booked.data.id },
      })
    ).error,
  ),
  "Linked event cannot be silently cancelled only in the CRM",
);
await owner.rpc("calendar_meeting", {
  org,
  payload: { id: booked.data.id, op: "claim_cancel" },
});
check(
  (
    await owner.rpc("calendar_meeting", {
      org,
      payload: { id: booked.data.id, op: "cancelled" },
    })
  ).data?.status === "cancelled",
  "Confirmed synthetic Calendar cancellation updates local status",
);

check(
  !(
    await owner.rpc("cancel_sales_meeting", {
      org,
      payload: { id: booked.data.id },
    })
  ).error,
  "Previously confirmed cancellation is idempotent",
);
check(
  (await owner.rpc("acquisition_state", { org })).data.meeting_value_cents ===
    300000,
  "Remaining appointment retains opportunity estimate",
);
await owner.rpc("cancel_sales_meeting", {
  org,
  payload: { id: secondMeeting.data.id },
});
check(
  (await owner.rpc("acquisition_state", { org })).data.meeting_value_cents ===
    0,
  "No active agreed appointments means zero meeting-backed value",
);
const points = PILLARS.map((pillar, i) => ({
  pillar,
  observation:
    i === 0 ? "Synthetic observation for permission tests only." : "",
  recommendation: i === 0 ? "Synthetic recommendation." : "",
  source_url: i === 0 ? "https://example.test/synthetic" : null,
  verification_status: i === 0 ? "verified" : "unverified",
  confidence: i === 0 ? "high" : "unknown",
  last_researched_date: i === 0 ? "2026-11-17" : null,
}));
await owner.rpc("save_growth_review", {
  org,
  lead,
  expected_revision: 1,
  points,
  offer: "Synthetic scope; budget unknown",
});
await owner.rpc("approve_growth_review", { org, lead, expected_revision: 2 });
await owner.rpc("save_outreach_draft", {
  org,
  lead,
  email_body:
    "Synthetic draft. Never sent.\n\nUTF-8: café — 🟢\r\nMixed line endings and trailing whitespace.  \n",
  opening_script: "Synthetic script",
});
let draft = (
  await owner
    .from("outreach_drafts")
    .select("*")
    .eq("organization_id", org)
    .eq("lead_id", lead)
    .single()
).data!;
const exactPreview = messageBody(
  draft.email_draft,
  agentSettings.sender_name,
  agentSettings.postal_address,
);
const approvalForm = new FormData();
approvalForm.set("expected_body_base64", encodeApprovalBody(exactPreview));
const submittedForm = await new Request("http://localhost/synthetic-approval", {
  method: "POST",
  body: approvalForm,
}).formData();
const submittedPreview = decodeApprovalBody(
  String(submittedForm.get("expected_body_base64")),
);
assert.equal(
  submittedPreview,
  exactPreview,
  "Multipart transport must preserve exact saved text",
);
const approval = {
  lead_id: lead,
  request_key: randomUUID(),
  draft_updated_at: draft.updated_at,
  subject: "Synthetic approval",
  confirmed: true,
  recipient: `public@${run}.example.test`,
  expected_body: submittedPreview,
};
check(
  Boolean(
    (
      await owner.rpc("approve_email_delivery", {
        org,
        payload: { ...approval, recipient: "changed@example.test" },
      })
    ).error,
  ),
  "Recipient must match the exact preview",
);
check(
  Boolean(
    (
      await owner.rpc("approve_email_delivery", {
        org,
        payload: { ...approval, expected_body: "Changed footer" },
      })
    ).error,
  ),
  "Body/footer changes invalidate approval",
);
const approved = await owner.rpc("approve_email_delivery", {
  org,
  payload: approval,
});
assert.equal(
  approved.error,
  null,
  approved.error?.message ?? "Expected exact-message approval",
);
check(Boolean(approved.data.id), "Exact saved message can be approved");
check(
  (await owner.rpc("approve_email_delivery", { org, payload: approval })).data
    .id === approved.data.id,
  "Repeated approval uses one delivery record",
);
await owner.rpc("save_outreach_draft", {
  org,
  lead,
  email_body: "A newer synthetic edit",
  opening_script: "Synthetic script",
});
check(
  Boolean(
    (
      await owner.rpc("claim_email_delivery", {
        org,
        payload: { id: approved.data.id },
      })
    ).error,
  ),
  "Edit after approval blocks sending",
);
for (let i = 0; i < 6; i++) {
  draft = (
    await owner.from("outreach_drafts").select("*").eq("lead_id", lead).single()
  ).data!;
  const a = await owner.rpc("approve_email_delivery", {
    org,
    payload: {
      ...approval,
      subject: `Synthetic attempt ${i}`,
      request_key: randomUUID(),
      draft_updated_at: draft.updated_at,
      expected_body: messageBody(
        draft.email_draft,
        agentSettings.sender_name,
        agentSettings.postal_address,
      ),
    },
  });
  assert.equal(a.error, null);
  const claim = await owner.rpc("claim_email_delivery", {
    org,
    payload: { id: a.data.id },
  });
  if (i === 5) {
    check(
      Boolean(claim.error),
      "Sixth send attempt is blocked by the daily quota",
    );
    break;
  }
  check(
    claim.data?.status === "sending",
    "Owner claims a separately approved attempt",
  );
  check(
    (
      await owner.rpc("claim_email_delivery", {
        org,
        payload: { id: a.data.id },
      })
    ).data === null,
    "A claimed message is never claimed twice",
  );
  await owner.rpc("finish_email_delivery", {
    org,
    payload: {
      id: a.data.id,
      ...(i === 0
        ? {}
        : {
            message_id: `synthetic-provider-${i}`,
            thread_id: `synthetic-thread-${i}`,
          }),
    },
  });
}
check(
  (
    await owner
      .from("email_deliveries")
      .select("status")
      .eq("organization_id", org)
      .eq("status", "unknown")
  ).data?.length === 1,
  "Uncertain outcome remains unknown, never retried",
);
check(
  (
    await owner
      .from("contact_events")
      .select("id")
      .eq("organization_id", org)
      .eq("source", "gmail")
  ).data?.length === 4,
  "Only confirmed synthetic provider responses create outbound contact",
);
await owner.rpc("google_connection", { org, payload: { op: "delete" } });
check(
  (await owner.rpc("acquisition_state", { org })).data.settings
    .sending_enabled === false,
  "Disconnect disables sending",
);
console.log(
  `${passed} acquisition assertions passed against isolated local test organizations. Google was not contacted; no email or invitation was sent.`,
);
