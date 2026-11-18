import { describe, expect, it } from "vitest";
import {
  sendBlockers,
  type SendReadiness,
} from "../../src/lib/acquisition/send-readiness";

const ready: SendReadiness = {
  googleConnected: true,
  gmailSendGranted: true,
  sendingEnabled: true,
  agentsPaused: false,
  reviewApproved: true,
  savedDraft: "Synthetic saved message; never sent.",
  recipient: "public@example.test",
  senderName: "Synthetic Operator",
  senderEmail: "contact.irrelevantcollective@gmail.com",
  postalAddress: "123 Synthetic Test Street",
  leadStatus: "Ready for Outreach",
};
describe("email approval readiness", () => {
  it("unlocks only after every page prerequisite is satisfied", () => {
    expect(sendBlockers(ready, "synthetic-lead")).toEqual([]);
  });
  it.each([
    ["sendingEnabled", false, "sending", "/dashboard/connections"],
    ["gmailSendGranted", false, "scope", "/dashboard/connections"],
    ["agentsPaused", true, "paused", "/dashboard/agents"],
    ["reviewApproved", false, "review", "/dashboard/research/synthetic-lead"],
    ["savedDraft", "   ", "draft", "#outreach-draft"],
    ["senderName", " ", "name", "/dashboard/agents"],
    ["senderEmail", "other@example.test", "sender", "/dashboard/agents"],
    ["postalAddress", " ", "address", "/dashboard/agents"],
    [
      "recipient",
      "invalid-email",
      "recipient",
      "/dashboard/leads/synthetic-lead",
    ],
  ])(
    "explains the %s blocker and links to its remedy",
    (field, value, code, href) => {
      expect(
        sendBlockers({ ...ready, [field as string]: value }, "synthetic-lead"),
      ).toEqual([expect.objectContaining({ code, href })]);
    },
  );
  it("distinguishes a missing owner/workspace connection from a missing scope", () => {
    const blocks = sendBlockers(
      { ...ready, googleConnected: false, gmailSendGranted: false },
      "synthetic-lead",
    );
    expect(blocks.map((b) => b.code)).toEqual(["google"]);
    expect(blocks[0].message).toContain("same CRM account and workspace");
  });
  it.each(["Won", "Lost", "Suppressed"])(
    "keeps %s leads locked even with all configuration complete",
    (leadStatus) => {
      expect(sendBlockers({ ...ready, leadStatus }, "synthetic-lead")).toEqual([
        expect.objectContaining({ code: "closed" }),
      ]);
    },
  );
});
