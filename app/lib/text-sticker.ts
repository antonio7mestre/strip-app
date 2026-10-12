import { profileFontInfo, type ProfileFont } from "./profile";
import { normalizeTextAlignment, type TextAlignment } from "./text-alignment";

export const TEXT_STICKER_MAX_LENGTH = 280;
export const TEXT_STICKER_WIDTH = 320;
export const TEXT_STICKER_PADDING = 12;
export const EMPTY_TEXT_STICKER_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";

export type TextSticker = {
  content: string;
  fontStyle: ProfileFont;
  fontSize: number;
  textColor: string;
  textAlign: TextAlignment;
  backgroundColor?: string;
};

/** Store editable words alongside the ordinary sticker image. No HTML or SVG. */
export function normalizeTextSticker(value: unknown): TextSticker | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.content !== "string") return undefined;
  return {
    content: Array.from(data.content.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")).slice(0, TEXT_STICKER_MAX_LENGTH).join(""),
    fontStyle: profileFontInfo(data.fontStyle).id,
    fontSize: typeof data.fontSize === "number" && Number.isFinite(data.fontSize) ? Math.min(72, Math.max(14, data.fontSize)) : 32,
    textColor: typeof data.textColor === "string" && /^#[\da-f]{6}$/i.test(data.textColor) ? data.textColor.toUpperCase() : "#FFFFFF",
    textAlign: normalizeTextAlignment(data.textAlign ?? "center"),
    backgroundColor: typeof data.backgroundColor === "string" && /^#[\da-f]{6}$/i.test(data.backgroundColor) ? data.backgroundColor.toUpperCase() : undefined,
  };
}
