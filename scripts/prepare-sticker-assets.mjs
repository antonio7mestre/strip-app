import { mkdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Asset packaging only: preserve the generated RGB and alpha, remove empty
// canvas margins, then encode the same compact format used by the existing pack.
const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error("Pass a source manifest and output directory");
const sources = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(outputPath, { recursive: true });
const result = [];
for (const { id, name, source } of sources) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid sticker id: ${id}`);
  const target = path.join(outputPath, `${id}.webp`);
  try { await access(target); throw new Error(`Refusing to replace ${target}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < 0) throw new Error(`Empty sticker: ${id}`);
  const output = await sharp(source)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(target);
  result.push({ id, name, width: output.width, height: output.height, bytes: output.size });
}
console.log(JSON.stringify(result, null, 2));
