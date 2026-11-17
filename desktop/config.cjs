const { parseEnv } = require("node:util");
function validateConfig(raw) {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid connection settings.");
  if (raw.mode === "hosted") {
    const url = new URL(String(raw.appUrl || ""));
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Hosted app address must use HTTPS without credentials.");
    return { mode: "hosted", appUrl: url.origin };
  }
  if (raw.mode !== "bundled") throw new Error("Choose a connection mode.");
  const url = new URL(String(raw.supabaseUrl || ""));
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    )
  )
    throw new Error(
      "Use a hosted HTTPS Supabase URL, or the loopback local Supabase URL.",
    );
  const key = String(raw.publishableKey || "").trim();
  if (key.length < 20 || key.length > 3000)
    throw new Error("Enter a Supabase publishable/anon key.");
  if (!key.startsWith("sb_publishable_")) {
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(key.split(".")[1] || "", "base64url").toString(),
      );
    } catch {
      throw new Error("Invalid publishable/anon key.");
    }
    if (claims.role !== "anon")
      throw new Error(
        "Only publishable/anon keys are allowed. Never use a service-role key.",
      );
  }
  const email = String(raw.operatorEmail || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new Error("Enter your operator account email.");
  return {
    mode: "bundled",
    supabaseUrl: url.origin,
    publishableKey: key,
    operatorEmail: email,
  };
}
function importEnvironment(text) {
  const env = parseEnv(text);
  return {
    supabaseUrl: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "",
    publishableKey:
      env.SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "",
  };
}
module.exports = { validateConfig, importEnvironment };
