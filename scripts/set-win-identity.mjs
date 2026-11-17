import { rcedit } from "rcedit";
import { readFile } from "node:fs/promises";
import path from "node:path";
const exe = process.argv[2];
if (process.platform !== "win32" || !exe)
  throw new Error(
    "Run this packaging step on Windows with the target executable.",
  );
const version = JSON.parse(
  await readFile("desktop/package.json", "utf8"),
).version;
await rcedit(exe, {
  icon: path.resolve("public/brand-ir.ico"),
  "file-version": version,
  "product-version": version,
  "version-string": {
    CompanyName: "iRRELEVANT CO",
    FileDescription: "iRRELEVANT OS",
    ProductName: "iRRELEVANT OS",
    OriginalFilename: "iRRELEVANT OS.exe",
  },
});
const bytes = await readFile(exe),
  ico = await readFile("public/brand-ir.ico");
for (let index = 0; index < ico.readUInt16LE(4); index++) {
  const entry = 6 + 16 * index,
    size = ico.readUInt32LE(entry + 8),
    offset = ico.readUInt32LE(entry + 12);
  if (!bytes.includes(ico.subarray(offset, offset + size)))
    throw new Error("The executable is missing a branded icon image.");
}
console.log(
  "Verified embedded neon iR icon resources in the Windows executable.",
);
