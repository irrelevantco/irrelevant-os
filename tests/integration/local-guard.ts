export function assertLocalTestEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const hostname = new URL(url).hostname;
  if (
    process.env.ALLOW_LOCAL_INTEGRATION_TESTS !== "true" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(hostname) ||
    !key
  )
    throw new Error(
      "Tests may create accounts only in an explicitly enabled loopback Supabase environment.",
    );
  return { url, key };
}
