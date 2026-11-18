export function appOrigin(request: Request) {
  const configured = process.env.APP_URL;
  const canonical = new URL(configured || request.url);
  if (
    canonical.protocol === "https:" ||
    process.env.IRRELEVANT_DESKTOP === "true"
  )
    return canonical.origin;
  // Next's internal request URL can normalize 127.0.0.1 to localhost.
  // Accept only the two loopback aliases on the configured development port.
  if (["127.0.0.1", "localhost"].includes(canonical.hostname)) {
    try {
      const incoming = new URL(`http://${request.headers.get("host")}`);
      if (
        ["127.0.0.1", "localhost"].includes(incoming.hostname) &&
        incoming.port === canonical.port
      )
        return incoming.origin;
    } catch {}
  }
  return canonical.origin;
}
