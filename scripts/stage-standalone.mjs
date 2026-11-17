import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
const target = path.join(process.cwd(), ".next", "standalone");
await mkdir(path.join(target, ".next"), { recursive: true });
await cp(".next/static", path.join(target, ".next", "static"), {
  recursive: true,
});
await cp("public", path.join(target, "public"), { recursive: true });
await mkdir(path.join(target, "data", "imports"), { recursive: true });
await cp(
  "data/imports/irrelevant_os_30_prospects.csv",
  path.join(target, "data", "imports", "irrelevant_os_30_prospects.csv"),
);
for (const entry of await readdir(target)) {
  if (entry.startsWith(".env"))
    await rm(path.join(target, entry), { force: true });
}
console.log("Standalone static assets staged; environment files excluded.");
