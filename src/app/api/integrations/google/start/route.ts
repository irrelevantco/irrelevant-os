import { appOrigin } from "@/lib/acquisition/origin";
import { NextResponse } from "next/server";
import { requireContext } from "@/lib/context";
import { randomBytes, createHash } from "node:crypto";
import { seal } from "@/lib/acquisition/crypto";
import { GOOGLE_SCOPES } from "@/lib/acquisition/google-http";
import { googleConfigured, redirectUri } from "@/lib/acquisition/google";
import { THREAD_READ_SCOPE } from "@/lib/engine/contracts";
export async function POST(request: Request) {
  const origin = appOrigin(request);
  if (request.headers.get("origin") !== origin)
    return new Response("Invalid origin", { status: 403 });
  const { organization, user, role } = await requireContext();
  if (role !== "owner" || !googleConfigured())
    return NextResponse.redirect(
      new URL("/dashboard/connections?google=setup", origin),
      303,
    );
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const mailbox = (await request.formData()).get("mailbox") === "on";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: [...GOOGLE_SCOPES, ...(mailbox ? [THREAD_READ_SCOPE] : [])].join(
      " ",
    ),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: "contact.irrelevantcollective@gmail.com",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(
    "ir_google",
    seal(
      {
        state,
        verifier,
        org: organization.id,
        user: user.id,
        expires: Date.now() + 600000,
        mailbox,
      },
      "google-oauth-state",
    ),
    {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "lax",
      path: "/api/integrations/google",
      maxAge: 600,
    },
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
