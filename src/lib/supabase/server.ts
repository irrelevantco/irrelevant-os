import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabaseConfig } from "./config";
export function isConfigured() {
  const { url, key } = supabaseConfig();
  return Boolean(url && key);
}
export async function createClient() {
  if (!isConfigured())
    throw new Error("Supabase is not configured. Follow README.md.");
  const jar = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url!, key!, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (changes) => {
        try {
          changes.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components cannot set cookies. The proxy refreshes them. */
        }
      },
    },
  });
}
