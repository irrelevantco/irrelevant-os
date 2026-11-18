import { createHash } from "node:crypto";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/database.types";
import { seal, unseal, secretKey } from "./crypto";
import {
  GOOGLE_SCOPES,
  googleJson,
  tokenSchema,
  verifyGoogleAccount,
} from "./google-http";
import { z } from "zod";
export function credentialKeyId() {
  return createHash("sha256").update(secretKey()).digest("hex").slice(0, 16);
}
export type Db = SupabaseClient<Database>;
export type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string[];
};
const connectionSchema = z.object({
  ciphertext: z.string(),
  email: z.string(),
  scopes: z.array(z.string()),
});
export function googleConfigured() {
  try {
    secretKey();
    return Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    );
  } catch {
    return false;
  }
}
export function redirectUri(origin: string) {
  const configured =
    process.env.GOOGLE_REDIRECT_URI ||
    `${origin}/api/integrations/google/callback`;
  const url = new URL(configured);
  if (
    url.origin !== origin ||
    !(
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw Error(
      "Google redirect must match this app's HTTPS or loopback origin.",
    );
  return url.href;
}
export async function connection(db: Db, org: string) {
  if (!googleConfigured()) return null;
  const r = await db.rpc("google_connection", {
    org,
    payload: { key_id: credentialKeyId() },
  });
  if (r.error) throw Error("Could not load the owner Google connection.");
  return r.data ? connectionSchema.parse(r.data) : null;
}
export async function storeTokens(
  db: Db,
  org: string,
  user: string,
  tokens: Tokens,
) {
  const r = await db.rpc("google_connection", {
    org,
    payload: {
      op: "save",
      key_id: credentialKeyId(),
      email: "contact.irrelevantcollective@gmail.com",
      ciphertext: seal(tokens, `${org}:${user}:${credentialKeyId()}`),
      scopes: tokens.scopes,
    },
  });
  if (r.error) throw Error("Could not save encrypted Google credentials.");
}
export async function exchangeGoogle(
  code: string,
  verifier: string,
  redirect: string,
) {
  return tokenSchema.parse(
    await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        code_verifier: verifier,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }).toString(),
    }),
  );
}
export async function accessToken(db: Db, org: string, user: string) {
  const c = await connection(db, org);
  if (!c) throw Error("Connect the company Google account first.");
  let tokens = unseal<Tokens>(
    c.ciphertext,
    `${org}:${user}:${credentialKeyId()}`,
  );
  if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  const next = tokenSchema.parse(
    await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }).toString(),
    }),
  );
  tokens = {
    access_token: next.access_token,
    refresh_token: next.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + next.expires_in * 1000,
    scopes: next.scope.split(" "),
  };
  await storeTokens(db, org, user, tokens);
  return tokens.access_token;
}
export async function finishConnection(
  db: Db,
  org: string,
  user: string,
  code: string,
  verifier: string,
  redirect: string,
) {
  const next = await exchangeGoogle(code, verifier, redirect);
  await verifyGoogleAccount(next.access_token);
  const scopes = next.scope.split(" ");
  if (
    !GOOGLE_SCOPES.filter((s) => s.startsWith("https:")).every((s) =>
      scopes.includes(s),
    )
  )
    throw Error(
      "The requested sending and Calendar permissions were not all granted.",
    );
  const old = await connection(db, org);
  const refresh =
    next.refresh_token ??
    (old
      ? unseal<Tokens>(old.ciphertext, `${org}:${user}:${credentialKeyId()}`)
          .refresh_token
      : undefined);
  if (!refresh)
    throw Error(
      "Google did not provide offline access. Reconnect and grant consent.",
    );
  await storeTokens(db, org, user, {
    access_token: next.access_token,
    refresh_token: refresh,
    expires_at: Date.now() + next.expires_in * 1000,
    scopes,
  });
}
export async function rpc(
  db: Db,
  name:
    | "acquisition_state"
    | "save_acquisition_settings"
    | "enqueue_hourly_discovery"
    | "discovery_seen_sources"
    | "save_agreed_meeting"
    | "cancel_sales_meeting"
    | "approve_email_delivery"
    | "claim_email_delivery"
    | "finish_email_delivery"
    | "calendar_meeting",
  org: string,
  payload: Json = {},
) {
  const r = await db.rpc(name, { org, payload });
  if (r.error) throw Error(r.error.message.slice(0, 300));
  return r.data;
}
