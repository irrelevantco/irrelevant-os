import { z } from "zod";
import { load } from "cheerio";
import { googleJson } from "../acquisition/google-http";
import { SENDER_EMAIL } from "../acquisition/contracts";

export function newReplyText(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .split(
      /\n\s*(?:On .{1,300}wrote:|-{2,}\s*Original Message\s*-{2,}|From:\s)/i,
    )[0]
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .trim()
    .slice(0, 3000);
}
export function classifyReply(body: string, automated = false) {
  if (automated)
    return { classification: "automated" as const, selected_option: null };
  const text = newReplyText(body).toLowerCase().replace(/[’‘]/g, "'");
  if (
    /\b(unsubscribe|remove me|stop (?:emailing|contacting|sending)|do not (?:email|contact)|don't (?:email|contact)|no (?:more|further) (?:emails|contact))\b/.test(
      text,
    )
  )
    return { classification: "opt_out" as const, selected_option: null };
  if (
    /\b(not interested|no thanks|not a fit|not right now|not looking|no thank you)\b/.test(
      text,
    )
  )
    return { classification: "negative" as const, selected_option: null };
  const selection = text
    .trim()
    .match(
      /^(?:yes[,! ]*)?(?:option\s*)?([12])(?:\s+(?:please|works(?: for me)?|is good|sounds good))?[.!]?$/,
    );
  if (selection)
    return {
      classification: "selection" as const,
      selected_option: Number(selection[1]),
    };
  if (
    /\b(interested|sounds good|yes please|let's talk|lets talk|schedule (?:a )?(?:call|meeting)|set up (?:a )?(?:call|meeting)|tell me more|learn more|happy to (?:talk|chat)|available (?:for|to))\b/.test(
      text,
    )
  )
    return { classification: "positive" as const, selected_option: null };
  return { classification: "other" as const, selected_option: null };
}
export function headerAddress(raw: string) {
  const bracket = raw.match(/<([^<>]+)>\s*$/),
    address = (bracket?.[1] ?? raw).trim().toLowerCase();
  return z.email().safeParse(address).success && !/[\r\n,]/.test(address)
    ? address
    : null;
}
export function rfcMessageId(raw: string | undefined) {
  return raw && /^<[^<>\r\n\s]{1,300}>$/.test(raw) ? raw : null;
}
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function messageText(payload: Part) {
  const plain: string[] = [],
    html: string[] = [];
  let visited = 0;
  function read(part: Part, depth = 0) {
    if (++visited > 40 || depth > 6) return;
    if (part.body?.data && part.body.data.length <= 100000) {
      const text = Buffer.from(part.body.data, "base64url").toString("utf8");
      if (part.mimeType === "text/plain") plain.push(text);
      if (part.mimeType === "text/html") html.push(text);
    }
    for (const child of part.parts ?? []) read(child, depth + 1);
  }
  read(payload);
  if (plain.length) return newReplyText(plain.join("\n"));
  const $ = load(html.join("\n"));
  $("script,style,blockquote,.gmail_quote").remove();
  return newReplyText($("body").text());
}
const messageSchema = z.object({
  id: z.string().min(1).max(200),
  threadId: z.string().max(200),
  internalDate: z.string(),
  labelIds: z.array(z.string()).default([]),
  payload: z
    .object({
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .default([]),
    })
    .passthrough(),
});
export async function gmailThread(
  token: string,
  threadId: string,
  recipient: string,
  since: string,
  transport: typeof fetch = fetch,
) {
  if (!/^[\w-]{1,200}$/.test(threadId))
    throw Error("Google thread identifier is invalid.");
  const data = z
    .object({ messages: z.array(messageSchema).max(1000).default([]) })
    .parse(
      await googleJson(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
        transport,
      ),
    );
  let latestRfc: string | null = null;
  const replies = data.messages
    .toSorted((a, b) => Number(a.internalDate) - Number(b.internalDate))
    .flatMap((message) => {
      const headers = Object.fromEntries(
        message.payload.headers.map((h) => [h.name.toLowerCase(), h.value]),
      );
      latestRfc = rfcMessageId(headers["message-id"]) ?? latestRfc;
      const sender = headerAddress(headers.from ?? "");
      const time = Number(message.internalDate);
      if (
        message.threadId !== threadId ||
        !Number.isFinite(time) ||
        time < new Date(since).getTime() ||
        time > Date.now() + 60000 ||
        message.labelIds.includes("SENT") ||
        sender === SENDER_EMAIL ||
        sender !== recipient.toLowerCase()
      )
        return [];
      const body = messageText(message.payload as Part);
      if (!body) return [];
      const automated =
        /^(auto-generated|auto-replied)(?:;|$)/i.test(
          headers["auto-submitted"] ?? "",
        ) ||
        /^(bulk|list|junk)$/i.test(headers.precedence ?? "") ||
        Boolean(headers["x-autoreply"] || headers["x-autorespond"]);
      const authentication =
        message.payload.headers.find(
          (h) => h.name.toLowerCase() === "authentication-results",
        )?.value ?? "";
      const authenticatedDomain = authentication
        .match(/\bheader\.from=([^;\s]+)/i)?.[1]
        ?.toLowerCase();
      const authenticated =
        /^mx\.google\.com;/i.test(authentication.trim()) &&
        /\bdmarc=pass\b/i.test(authentication) &&
        authenticatedDomain === sender.split("@")[1];
      return [
        {
          message_id: message.id,
          thread_id: threadId,
          received_at: new Date(time).toISOString(),
          subject: (headers.subject ?? "").slice(0, 500),
          body,
          authenticated_sender:
            authenticated &&
            !message.labelIds.some((label) =>
              ["SPAM", "TRASH"].includes(label),
            ),
          ...classifyReply(body, automated),
        },
      ];
    });
  return { replies, rfc_message_id: latestRfc };
}
export async function gmailSentCount(
  token: string,
  transport: typeof fetch = fetch,
  now = new Date(),
) {
  const after = Math.floor((now.getTime() - 86400000) / 1000);
  const messages = new Set<string>();
  let page: string | undefined;
  // IDs only: account-wide sent volume, including mail sent outside this app.
  for (let i = 0; i < 5; i++) {
    const params = new URLSearchParams({
      q: `in:sent after:${after}`,
      maxResults: "100",
      ...(page ? { pageToken: page } : {}),
    });
    const result = z
      .object({
        messages: z
          .array(z.object({ id: z.string() }))
          .max(100)
          .default([]),
        nextPageToken: z.string().optional(),
      })
      .parse(
        await googleJson(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
          transport,
        ),
      );
    result.messages.forEach((message) => messages.add(message.id));
    page = result.nextPageToken;
    if (!page) return messages.size;
  }
  return Math.max(500, messages.size); // More pages means the account allowance is exhausted.
}
export async function gmailHistory(
  token: string,
  cursor: { history_id?: string; page_token?: string | null },
  transport: typeof fetch = fetch,
) {
  const headers = { Authorization: `Bearer ${token}` };
  if (!cursor.history_id) {
    const profile = z
      .object({ historyId: z.string().regex(/^\d{1,50}$/) })
      .parse(
        await googleJson(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers },
          transport,
        ),
      );
    return {
      history_id: profile.historyId,
      page_token: null,
      thread_ids: [] as string[],
    };
  }
  if (!/^\d{1,50}$/.test(cursor.history_id))
    throw Error("Google history cursor is invalid.");
  const params = new URLSearchParams({
    startHistoryId: cursor.history_id,
    historyTypes: "messageAdded",
    labelId: "INBOX",
    maxResults: "10",
    ...(cursor.page_token ? { pageToken: cursor.page_token } : {}),
  });
  const result = z
    .object({
      historyId: z.string().regex(/^\d{1,50}$/),
      nextPageToken: z.string().max(500).optional(),
      history: z
        .array(
          z.object({
            messagesAdded: z
              .array(
                z.object({
                  message: z.object({ threadId: z.string().max(200) }),
                }),
              )
              .max(100)
              .optional(),
          }),
        )
        .max(100)
        .default([]),
    })
    .parse(
      await googleJson(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`,
        { headers },
        transport,
      ),
    );
  const ids = [
    ...new Set(
      result.history.flatMap(
        (h) => h.messagesAdded?.map((m) => m.message.threadId) ?? [],
      ),
    ),
  ];
  if (ids.length > 100)
    throw Error(
      "Google history page exceeded its tracked-thread processing limit.",
    );
  return {
    history_id: result.nextPageToken ? cursor.history_id : result.historyId,
    page_token: result.nextPageToken ?? null,
    thread_ids: ids,
  };
}
export async function gmailPriorContact(
  token: string,
  recipient: string,
  transport: typeof fetch = fetch,
) {
  z.email().parse(recipient);
  const params = new URLSearchParams({
    q: `in:sent to:${JSON.stringify(recipient)}`,
    maxResults: "1",
  });
  const result = z
    .object({
      messages: z
        .array(
          z.object({ id: z.string().max(200), threadId: z.string().max(200) }),
        )
        .max(1)
        .default([]),
    })
    .parse(
      await googleJson(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
        transport,
      ),
    );
  return result.messages[0] ?? null;
}
