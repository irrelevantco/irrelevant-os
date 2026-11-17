import { randomBytes, createHmac } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
if (existsSync(".env.local") || existsSync("work/stack.env")) {
  console.error(
    "Existing local environment preserved. To regenerate, first stop your local stack and deliberately remove both files.",
  );
  process.exit(1);
}
const secret = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const base64 = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const content = `${base64({ alg: "HS256", typ: "JWT" })}.${base64({ role: "anon", iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 315360000 })}`;
const anon = `${content}.${createHmac("sha256", secret).update(content).digest("base64url")}`;
mkdirSync("work", { recursive: true });
writeFileSync(
  "work/stack.env",
  `POSTGRES_PASSWORD=${password}\nJWT_SECRET=${secret}\n`,
  { mode: 0o600 },
);
writeFileSync(
  ".env.local",
  `APP_URL=http://localhost:3000\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}\nALLOW_LOCAL_INTEGRATION_TESTS=true\n`,
  { mode: 0o600 },
);
console.log(
  "Generated local-only credentials in ignored files. No external account is required.",
);
