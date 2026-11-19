import { z } from "zod";
export const ASSISTANT_TASKS = [
  { id: "home", label: "Get started", prompt: "Choose a task. I’ll show the next step and the controls that apply." },
  { id: "discover", label: "Find businesses", prompt: "Choose a location and category. A search creates candidates for review, not verified leads." },
  { id: "research", label: "Research a business", prompt: "Choose a business, prepare a public-web review, then verify the three pillars." },
  { id: "email", label: "Prepare or send email", prompt: "Choose a business to review its saved draft, sources, sender and sending requirements." },
  { id: "automation", label: "Automation & timing", prompt: "Choose what runs and when. Preparing work and approving email delivery are separate choices." },
  { id: "campaign", label: "Approve an email campaign", prompt: "Review the full templates, sender, examples and limits before authorizing a seven-day campaign." },
  { id: "meetings", label: "Replies & meetings", prompt: "Review actual replies and agreed times. A proposed time becomes a meeting only after the business agrees." },
  { id: "imports", label: "Import or convert files", prompt: "Preview and map your file before importing. Spreadsheet conversion can stay on your device." },
  { id: "identity", label: "Sender & limits", prompt: "Save your sender identity and review limits. Optional paid providers stay separate from the built-in rules." },
  { id: "activity", label: "Work & approvals", prompt: "See recorded jobs, proposals and errors. Draft preparation is distinct from an actual sent message." },
  { id: "pause", label: "Pause all agents", prompt: "Stop queued and running preparation and pause automatic sending. An external request already in progress may still complete." },
] as const;
export type AssistantTask = typeof ASSISTANT_TASKS[number]["id"];
export const assistantTaskSchema = z.enum(ASSISTANT_TASKS.map(t => t.id));
export const assistantQuerySchema = z.object({
  task: assistantTaskSchema.catch("home"),
  lead: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});
