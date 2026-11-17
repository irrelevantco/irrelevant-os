// Runtime aliases let the packaged desktop server use a chosen backend without rebuilding.
// All callers are server modules; no secrets are accepted as publishable keys.
export function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
