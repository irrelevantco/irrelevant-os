import { appOrigin } from "@/lib/acquisition/origin";
import { NextResponse, type NextRequest } from "next/server";
import { requireContext } from "@/lib/context";
import { unseal } from "@/lib/acquisition/crypto";
import { finishConnection, redirectUri } from "@/lib/acquisition/google";
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const response = NextResponse.redirect(
    new URL("/dashboard/connections?google=failed", origin),
  );
  response.cookies.delete({
    name: "ir_google",
    path: "/api/integrations/google",
  });
  response.headers.set("Cache-Control", "private, no-store");
  try {
    const raw = request.cookies.get("ir_google")?.value;
    if (!raw) return response;
    const state = unseal<{
      state: string;
      verifier: string;
      org: string;
      user: string;
      expires: number;
    }>(raw, "google-oauth-state");
    if (
      state.expires < Date.now() ||
      request.nextUrl.searchParams.get("state") !== state.state ||
      request.nextUrl.searchParams.has("error")
    )
      return response;
    const { db, organization, user, role } = await requireContext();
    if (
      role !== "owner" ||
      organization.id !== state.org ||
      user.id !== state.user
    )
      return response;
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return response;
    await finishConnection(
      db,
      organization.id,
      user.id,
      code,
      state.verifier,
      redirectUri(origin),
    );
    response.headers.set(
      "Location",
      `${origin}/dashboard/connections?google=connected`,
    );
    return response;
  } catch {
    return response;
  }
}
