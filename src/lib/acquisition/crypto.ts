import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function secretKey(value = process.env.OAUTH_TOKEN_ENCRYPTION_KEY) {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32)
    throw Error("Configure a 32-byte base64 OAuth encryption key.");
  return key;
}
export function seal(value: unknown, context: string, key = secretKey()) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function unseal<T>(
  value: string,
  context: string,
  key = secretKey(),
): T {
  const [version, iv, tag, data, ...extra] = value.split(".");
  if (version !== "v1" || extra.length || !iv || !tag || !data)
    throw Error("Invalid encrypted credential.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString(),
  );
}
