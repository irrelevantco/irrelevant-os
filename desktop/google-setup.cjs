const { randomBytes } = require("node:crypto");
function installedClient(text, priorKey) {
  let source;
  try {
    source = JSON.parse(text)?.installed;
  } catch {
    throw Error("Could not parse the Google OAuth JSON. No setup was saved.");
  }
  if (
    !source ||
    typeof source.client_id !== "string" ||
    !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(source.client_id) ||
    typeof source.client_secret !== "string" ||
    source.client_secret.length < 8 ||
    source.client_secret.length > 2000
  )
    throw Error(
      "Choose an official Google Desktop OAuth client JSON, not a Web client, service account or API key.",
    );
  return {
    clientId: source.client_id,
    clientSecret: source.client_secret,
    encryptionKey: priorKey || randomBytes(32).toString("base64"),
  };
}
module.exports = { installedClient };
