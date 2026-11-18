import { z } from "zod";
import { SENDER_EMAIL } from "./contracts";

export type SendReadiness = {
  googleConnected: boolean;
  gmailSendGranted: boolean;
  sendingEnabled: boolean;
  agentsPaused: boolean;
  reviewApproved: boolean;
  savedDraft: string;
  recipient: string | null;
  senderName: string;
  senderEmail: string;
  postalAddress: string;
  leadStatus: string;
};

// These explain the page lock. The server independently rechecks approval,
// suppression, revisions and quotas immediately before any provider call.
export function sendBlockers(input: SendReadiness, leadId: string) {
  const blockers: {
    code: string;
    message: string;
    href: string;
    action: string;
  }[] = [];
  const add = (code: string, message: string, href: string, action: string) =>
    blockers.push({ code, message, href, action });
  if (!input.googleConnected)
    add(
      "google",
      "Google is not connected for this CRM account and workspace. Browser consent must use the same CRM account and workspace as this app.",
      "/dashboard/connections",
      "Connect Google",
    );
  else if (!input.gmailSendGranted)
    add(
      "scope",
      "The Google connection does not include Gmail sending permission.",
      "/dashboard/connections",
      "Renew Google permission",
    );
  if (!input.sendingEnabled)
    add(
      "sending",
      "Separately approved Gmail sending is switched off. Enable it and save acquisition controls.",
      "/dashboard/connections",
      "Open sending controls",
    );
  if (input.agentsPaused)
    add(
      "paused",
      "Agents are paused. Resume preparation, then return to this saved draft.",
      "/dashboard/agents",
      "Open Agent control",
    );
  if (!input.senderName.trim())
    add(
      "name",
      "Your sender name has not been saved.",
      "/dashboard/agents",
      "Save sender identity",
    );
  if (input.senderEmail.toLowerCase() !== SENDER_EMAIL)
    add(
      "sender",
      `The saved sender email must be ${SENDER_EMAIL}.`,
      "/dashboard/agents",
      "Save sender email",
    );
  if (!input.postalAddress.trim())
    add(
      "address",
      "Your business postal address has not been saved.",
      "/dashboard/agents",
      "Save postal address",
    );
  if (!z.email().safeParse(input.recipient).success)
    add(
      "recipient",
      "This business needs a valid saved contact email.",
      `/dashboard/leads/${leadId}`,
      "Edit business contact",
    );
  if (!input.savedDraft.trim())
    add(
      "draft",
      "The email draft has not been saved. Save the draft above before approving delivery.",
      "#outreach-draft",
      "Go to draft",
    );
  if (!input.reviewApproved)
    add(
      "review",
      "The current Growth Review is awaiting owner approval. Verify a source-backed observation, save the review, then approve that version.",
      `/dashboard/research/${leadId}`,
      "Review and approve evidence",
    );
  if (["Won", "Lost", "Suppressed"].includes(input.leadStatus))
    add(
      "closed",
      "This lead is closed or suppressed and cannot receive outreach.",
      `/dashboard/leads/${leadId}`,
      "View lead status",
    );
  return blockers;
}
