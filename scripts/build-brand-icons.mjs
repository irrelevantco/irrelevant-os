import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
const svg = await readFile("public/brand-ir.svg");
for (const size of [192, 512])
  await sharp(svg).resize(size, size).png().toFile(`public/icon-${size}.png`);
const inner = await sharp(svg).resize(320, 320).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#d7ff5f" },
})
  .composite([{ input: inner, left: 96, top: 96 }])
  .png()
  .toFile("public/icon-maskable.png");
const sizes = [16, 24, 32, 48, 64, 128, 256],
  images = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
images.forEach((bytes, index) => {
  const entry = 6 + 16 * index;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(bytes.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile("public/brand-ir.ico", Buffer.concat([directory, ...images]));
console.log("Built matching Windows, taskbar and PWA icon assets.");
