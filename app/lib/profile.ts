export const PROFILE_FONTS = [
  { id: "letter", label: "Letter", family: '"Arial Black", "Helvetica Neue", Arial, sans-serif' },
  { id: "sans", label: "Sans", family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' },
  { id: "serif", label: "Serif", family: '"Iowan Old Style", "Baskerville", Georgia, serif' },
  { id: "mono", label: "Mono", family: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace' },
  { id: "rounded", label: "Rounded", family: 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: "condensed", label: "Condensed", family: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif' },
  { id: "display", label: "Display", family: 'Didot, "Bodoni 72", "Times New Roman", serif' },
  { id: "hand", label: "Handwritten", family: '"Noteworthy", "Bradley Hand", "Comic Sans MS", cursive' },
] as const;

export type ProfileFont = (typeof PROFILE_FONTS)[number]["id"];
export type StripProfile = {
  title: string;
  font: ProfileFont;
  background: string;
  accent: string;
  photoUrl: string | null;
  revision: number;
};
export const DEFAULT_PROFILE: StripProfile = {
  title: "", font: "letter", background: "#000000", accent: "#FFFFFF",
  photoUrl: null, revision: 0,
};
export const PROFILE_COLORS = [
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#000000" }, { name: "Acid", value: "#8ACE00" },
  { name: "Hot pink", value: "#FF4FA3" }, { name: "Chrome", value: "#D9D9D9" },
  { name: "Electric blue", value: "#3155FF" }, { name: "Laser violet", value: "#7A2CFF" },
  { name: "Safety orange", value: "#FF4D00" }, { name: "Paper", value: "#F5F1E8" },
  { name: "Pink", value: "#FF8CCC" }, { name: "Acid yellow", value: "#D7FF00" },
] as const;

function profileLuminance(color: string) {
  const channels = color.slice(1).match(/.{2}/g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function profileInk(color: string) {
  return profileLuminance(color) > 0.179 ? "#000000" : "#FFFFFF";
}

export const PROFILE_COLOR_ERROR = "Change colors so text is more readable";
// A permissive save guard for personal themes, not an accessibility rating.
// The same threshold drives preview ink, tap feedback and server validation.
export const PROFILE_MIN_TEXT_CONTRAST = 3;

export function profileContrast(background: string, text: string) {
  const a = profileLuminance(background), b = profileLuminance(text);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function profileColorsReadable(profile: Pick<StripProfile, "background" | "accent">) {
  return profileContrast(profile.background, profile.accent) >= PROFILE_MIN_TEXT_CONTRAST;
}

/** Older profiles used accent only on buttons, so they may need safe reading ink.
 * Editing always previews the exact choice, even before it passes Save. */
export function profileTextColor(profile: Pick<StripProfile, "background" | "accent">, editing = false) {
  return editing || profileColorsReadable(profile) ? profile.accent : profileInk(profile.background);
}

/** Only neutral ink follows the background. A chosen color belongs to its owner. */
export function applyProfileChanges(profile: StripProfile, changes: Partial<StripProfile>): StripProfile {
  const next = { ...profile, ...changes };
  if (changes.background && changes.accent === undefined && /^#(?:000000|ffffff)$/i.test(profile.accent)) {
    next.accent = profileInk(changes.background);
  }
  return next;
}

/** Preserve a cover's edge when it blends into the profile canvas. */
export function profileCoverOutline(cover: string, background: string) {
  const channels = (color: string) => {
    const hex = color.trim().replace(/^#/, "");
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return /^[\da-f]{6}$/i.test(full)
      ? full.match(/.{2}/g)!.map((part) => parseInt(part, 16)) : null;
  };
  const a = channels(cover), b = channels(background);
  if (!a || !b || a.some((channel, index) => Math.abs(channel - b[index]) > 16)) return undefined;
  return profileInk(`#${b.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
}

export function profileTitle(profile: Pick<StripProfile, "title">, username: string | null | undefined) {
  return profile.title.trim() || username || "Your profile";
}

export function validateProfile(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (typeof data.title !== "string" || data.title.length > 60 ||
      !PROFILE_FONTS.some(({ id }) => id === data.font) ||
      typeof data.background !== "string" || !/^#[\da-f]{6}$/i.test(data.background) ||
      typeof data.accent !== "string" || !/^#[\da-f]{6}$/i.test(data.accent) ||
      typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.revision < 0) return null;
  return {
    title: Array.from(data.title.trim()).filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join(""),
    font: data.font as ProfileFont,
    background: data.background.toUpperCase(), accent: data.accent.toUpperCase(),
    revision: data.revision,
  };
}
