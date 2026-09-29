import { imageSize } from "image-size";
import { DEFAULT_PROFILE, type ProfileFont, type StripProfile } from "@/app/lib/profile";

export type ProfileRow = {
  title: string; font: ProfileFont; background: string; accent: string;
  photo_key: string | null; revision: number;
};

export function serializeProfile(row: ProfileRow | null): StripProfile {
  return row ? {
    title: row.title, font: row.font, background: row.background, accent: row.accent,
    photoUrl: row.photo_key ? `/api/profile/photo?v=${row.revision}` : null,
    revision: row.revision,
  } : { ...DEFAULT_PROFILE };
}

/** Bound the actual stream, not just the caller's Content-Length header. */
export async function readProfileInput(request: Request) {
  if (!request.body) throw new Error("Empty request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > 700_000) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      value += decoder.decode(chunk, { stream: true });
    }
    return JSON.parse(value + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

export function decodeProfilePhoto(value: unknown) {
  if (typeof value !== "string" || value.length > 690_000) return null;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (character) => character.charCodeAt(0));
    const dimensions = imageSize(bytes);
    if (bytes.length > 512_000 || dimensions.type !== "jpg" ||
        !dimensions.width || !dimensions.height || dimensions.width > 1024 || dimensions.height > 1024) return null;
    return bytes;
  } catch { return null; }
}
