export function operatorAllowed(
  email: string | undefined,
  allowlist: string | undefined,
  production: boolean,
) {
  if (!production) return true;
  const allowed = (allowlist ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}
