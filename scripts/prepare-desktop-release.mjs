import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { nextReleaseVersion } from "../desktop/release-version.cjs";
const sha = process.env.APP_SOURCE_SHA;
if (!/^[a-f0-9]{40}$/.test(sha ?? ""))
  throw Error("Exact source commit required");
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
};
async function api(path) {
  const r = await fetch(
    `https://api.github.com/repos/irrelevantco/irrelevant-os/${path}`,
    { headers, redirect: "error", signal: AbortSignal.timeout(20000) },
  );
  if (!r.ok) throw Error(`Release preflight failed (${r.status})`);
  return r.json();
}
const [head, releases] = await Promise.all([
  api("git/ref/heads/main"),
  api("releases?per_page=100"),
]);
if (
  head.object.sha !== sha ||
  releases.some((r) => !r.draft && r.target_commitish === sha)
) {
  await appendFile(process.env.GITHUB_OUTPUT, "skip=true\n");
  console.log("No new release: source is superseded or already published.");
  process.exit(0);
}
const desktop = JSON.parse(await readFile("desktop/package.json", "utf8"));
const versions = releases
  .filter((r) => !r.draft)
  .map((r) => /^v(\d+\.\d+\.\d+)-personal-preview$/.exec(r.tag_name)?.[1])
  .filter(Boolean);
const version = nextReleaseVersion(desktop.version, versions);
await mkdir("work", { recursive: true });
for (const file of [
  "package.json",
  "desktop/package.json",
  "package-lock.json",
  "desktop/package-lock.json",
]) {
  const data = JSON.parse(await readFile(file, "utf8"));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
}
await writeFile(
  "src/lib/version.ts",
  `export const APP_VERSION = "${version}";\n`,
);
await writeFile(
  "work/desktop-release-notes.md",
  `Windows personal preview ${version}\n\nSource commit: ${sha}\n\nBuilt automatically after successful acquisition CRM checks. Includes the saved-message line-ending fix and native, approved app updates. Install the Setup edition once to receive future in-app updates. Existing local database, connection and Google setup are preserved.\n\nThis is an unsigned personal preview. Updates download only after you approve them and install only after you choose Install and restart. Save edits and finish pending sends first. No email or Calendar invitation is sent by release checks.\n\n[Setup and update guide](https://github.com/irrelevantco/irrelevant-os/blob/main/docs/PERSONAL_APP.md)\n`,
);
await appendFile(process.env.GITHUB_ENV, `APP_RELEASE_VERSION=${version}\n`);
await appendFile(process.env.GITHUB_OUTPUT, "skip=false\n");
console.log(`Prepared Windows release ${version} for ${sha.slice(0, 7)}.`);
