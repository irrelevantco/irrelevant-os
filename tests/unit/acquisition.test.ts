import { describe, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { seal, unseal, secretKey } from "../../src/lib/acquisition/crypto";
import {
  meetingTimes,
  messageBody,
  emailRaw,
} from "../../src/lib/acquisition/contracts";
import {
  gmailSend,
  verifyGoogleAccount,
  calendarSave,
  calendarCancel,
  calendarId,
  GOOGLE_SCOPES,
} from "../../src/lib/acquisition/google-http";
const require = createRequire(import.meta.url);
const { installedClient } = require("../../desktop/google-setup.cjs");
const now = new Date("2026-01-01T00:00:00Z");
describe("acquisition security and provider boundaries", () => {
  it("encrypts credentials, rejects tampering and binds each envelope to its owner/organization", () => {
    const key = randomBytes(32),
      value = seal({ refresh_token: "synthetic-only" }, "org:owner", key);
    expect(value).not.toContain("synthetic-only");
    expect(unseal(value, "org:owner", key)).toEqual({
      refresh_token: "synthetic-only",
    });
    expect(() => unseal(value, "other:owner", key)).toThrow();
    expect(() =>
      unseal(value.slice(0, -5) + "AAAAA", "org:owner", key),
    ).toThrow();
    expect(() => secretKey("short")).toThrow();
  });
  it("uses Eastern offsets correctly across winter and summer", () => {
    expect(meetingTimes("2026-01-05T07:00", 30, now).starts_at).toBe(
      "2026-01-05T12:00:00.000Z",
    );
    expect(meetingTimes("2026-07-06T07:00", 30, now).starts_at).toBe(
      "2026-07-06T11:00:00.000Z",
    );
  });
  it("rejects weekends, past dates, invalid dates and appointments crossing 3 p.m.", () => {
    for (const time of [
      "2026-01-03T09:00",
      "2026-02-30T10:00",
      "2026-01-05T06:59",
      "2026-01-05T14:45",
      "2025-12-31T10:00",
    ]) {
      expect(() => meetingTimes(time, 30, now)).toThrow();
    }
    expect(() => meetingTimes("2026-01-05T10:00", 121, now)).toThrow();
    expect(meetingTimes("2026-01-05T14:30", 30, now).ends_at).toBe(
      "2026-01-05T20:00:00.000Z",
    );
  });
  it("encodes Unicode email text and rejects injected headers", () => {
    const body = messageBody(
      "Synthetic café review",
      "Test Operator",
      "123 Test Street",
    );
    const raw = Buffer.from(
      emailRaw("public@example.test", "A café review", body),
      "base64url",
    ).toString();
    expect(raw).toContain("contact.irrelevantcollective@gmail.com");
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(
      Buffer.from(
        raw.split("\r\n\r\n")[1].replaceAll("\r\n", ""),
        "base64",
      ).toString(),
    ).toBe(body);
    expect(() =>
      emailRaw(
        "public@example.test",
        "Subject\r\nBcc: someone@example.test",
        body,
      ),
    ).toThrow();
  });
  it("makes at most one Gmail send request and requires an actual returned message ID", async () => {
    const transport = vi.fn().mockRejectedValue(Error("timeout"));
    await expect(
      gmailSend(
        "synthetic-token",
        {
          recipient: "public@example.test",
          subject: "Test",
          body: "Synthetic only",
        },
        transport,
      ),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    const bad = vi.fn().mockResolvedValue(new Response("{}"));
    await expect(
      gmailSend(
        "synthetic-token",
        {
          recipient: "public@example.test",
          subject: "Test",
          body: "Synthetic only",
        },
        bad,
      ),
    ).rejects.toThrow();
  });
  it("binds Google authorization to the verified company email and excludes mailbox read scopes", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ email: "other@example.test", email_verified: true }),
        ),
      );
    await expect(
      verifyGoogleAccount("synthetic-token", transport),
    ).rejects.toThrow("Connect contact");
    expect(GOOGLE_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(GOOGLE_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/gmail.modify",
    );
  });
  it("reconciles a deterministic Calendar event before attempting any new invitation", async () => {
    const id = randomUUID();
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: calendarId(id),
          htmlLink: "https://calendar.google.com/calendar/event?eid=synthetic",
        }),
      ),
    );
    const result = await calendarSave(
      "synthetic-token",
      {
        id,
        starts_at: "2026-11-19T14:00:00Z",
        ends_at: "2026-11-19T14:30:00Z",
        kind: "call",
        business_name: "Synthetic",
        public_email: null,
        agreement_note: "Synthetic agreement",
      },
      false,
      transport,
    );
    expect(result.id).toBe(calendarId(id));
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][1].method).toBeUndefined();
  });
  it("refuses an occupied Calendar slot instead of sending an invitation", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: "2026-11-19T14:00:00Z",
                    end: "2026-11-19T15:00:00Z",
                  },
                ],
              },
            },
          }),
        ),
      );
    await expect(
      calendarSave(
        "synthetic-token",
        {
          id: randomUUID(),
          starts_at: "2026-11-19T14:00:00Z",
          ends_at: "2026-11-19T14:30:00Z",
          kind: "meeting",
          business_name: "Synthetic",
          public_email: "public@example.test",
          agreement_note: "Synthetic agreement",
        },
        true,
        transport,
      ),
    ).rejects.toThrow("busy");
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("defaults Calendar creation to no guest notification", async () => {
    const id = randomUUID();
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response('{"calendars":{"primary":{"busy":[]}}}'),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: calendarId(id) })),
      );
    await calendarSave(
      "synthetic-token",
      {
        id,
        starts_at: "2026-11-19T14:00:00Z",
        ends_at: "2026-11-19T14:30:00Z",
        kind: "call",
        business_name: "Synthetic",
        public_email: "public@example.test",
        agreement_note: "Synthetic agreement",
      },
      false,
      transport,
    );
    const call = transport.mock.calls[2];
    expect(call[0]).toContain("sendUpdates=none");
    expect(JSON.parse(call[1].body)).not.toHaveProperty("attendees");
    expect(JSON.parse(call[1].body).description).not.toContain(
      "Synthetic agreement",
    );
  });
  it("accepts only installed Google OAuth setup and preserves the encryption key on reimport", () => {
    expect(() =>
      installedClient(JSON.stringify({ web: { client_id: "wrong" } })),
    ).toThrow("Desktop");
    const a = installedClient(
      JSON.stringify({
        installed: {
          client_id: "synthetic.apps.googleusercontent.com",
          client_secret: "synthetic-secret",
        },
      }),
    );
    expect(Buffer.from(a.encryptionKey, "base64")).toHaveLength(32);
    const b = installedClient(
      JSON.stringify({
        installed: {
          client_id: "synthetic.apps.googleusercontent.com",
          client_secret: "synthetic-secret-new",
        },
      }),
      a.encryptionKey,
    );
    expect(b.encryptionKey).toBe(a.encryptionKey);
  });
  it("reconciles missing Calendar events without issuing a deletion", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 }));
    await calendarCancel("synthetic-token", randomUUID(), transport);
    expect(transport).toHaveBeenCalledOnce();
  });
  it("cancels only a deterministic app event with explicit notification semantics", async () => {
    const id = randomUUID();
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"status":"confirmed"}'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await calendarCancel("synthetic-token", id, transport);
    expect(transport.mock.calls[1][0]).toContain(
      calendarId(id) + "?sendUpdates=all",
    );
    expect(transport.mock.calls[1][1].method).toBe("DELETE");
  });
});
