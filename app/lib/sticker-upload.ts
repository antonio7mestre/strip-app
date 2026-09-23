import { STICKER_PACK } from "./sticker-pack";

const packSources = new Set(STICKER_PACK.map((sticker) => sticker.src));
const uploads = new Map<string, Promise<string>>();
const MAX_CACHED_STICKERS = 24;

function stickerUploadSource(src: string) {
  const cached = uploads.get(src);
  if (cached) return cached;

  const pending = (async () => {
    const response = await fetch(src, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not load sticker for saving");
    const blob = await response.blob();
    if (blob.type !== "image/webp" || blob.size === 0 || blob.size > 1024 * 1024) {
      throw new Error("Invalid sticker image");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return `data:image/webp;base64,${btoa(binary)}`;
  })();
  uploads.set(src, pending);
  if (uploads.size > MAX_CACHED_STICKERS) {
    uploads.delete(uploads.keys().next().value!);
  }
  void pending.catch(() => {
    if (uploads.get(src) === pending) uploads.delete(src);
  });
  return pending;
}

/** Upload the bundled cutout through the normal media path. Never replace the
 * editor's displayed source, which would make Safari decode/paint it again. */
export async function prepareStickerUploads<T extends { type: string; src?: string }>(
  blocks: readonly T[],
): Promise<T[]> {
  return Promise.all(blocks.map(async (block) => {
    if (block.type !== "sticker" || !block.src || !packSources.has(block.src)) {
      return block;
    }
    return { ...block, src: await stickerUploadSource(block.src) };
  }));
}
