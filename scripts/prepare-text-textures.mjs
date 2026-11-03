// Only compress/resize the user's selected originals. Never modify the sources.
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { TEXT_TEXTURES } from "../app/lib/text-textures.ts";

const source = process.argv[2];
if (!source) throw new Error("Pass the selected-backgrounds directory");
const destination = resolve("public/textures/v1");
await mkdir(destination, { recursive: true });
let originals = 0, full = 0, thumbs = 0;
for (const texture of TEXT_TEXTURES) {
  const input = resolve(source, `${texture.id}.png`);
  originals += (await stat(input)).size;
  const output = await sharp(input).rotate().resize({ width: 1280, withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 }).toFile(resolve(destination, `${texture.id}.webp`));
  const thumbnail = await sharp(input).rotate().resize(240, 240, { fit: "cover" })
    .webp({ quality: 65, effort: 5 }).toFile(resolve(destination, `${texture.id}-thumb.webp`));
  full += output.size; thumbs += thumbnail.size;
}
console.log(JSON.stringify({ count: TEXT_TEXTURES.length, originals, full, thumbs }));
