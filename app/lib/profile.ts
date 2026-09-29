export const PROFILE_FONTS = [
  { id: "sans", label: "Classic", family: '"Helvetica Neue", Arial, sans-serif' },
  { id: "serif", label: "Editorial", family: 'Georgia, "Times New Roman", serif' },
  { id: "mono", label: "Typewriter", family: '"Courier New", monospace' },
  { id: "rounded", label: "Soft", family: 'ui-rounded, "Arial Rounded MT Bold", sans-serif' },
  { id: "condensed", label: "Bold", family: 'Impact, "Arial Narrow", sans-serif' },
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
  title: "", font: "sans", background: "#000000", accent: "#3155FF",
  photoUrl: null, revision: 0,
};
export const PROFILE_COLORS = [
  { name: "Black", value: "#000000" }, { name: "Paper", value: "#F5F1E8" },
  { name: "Cobalt", value: "#3155FF" }, { name: "Pink", value: "#FF8CCC" },
  { name: "Acid", value: "#D7FF00" }, { name: "Orange", value: "#FF4D00" },
  { name: "Lavender", value: "#A78BFA" }, { name: "Sky", value: "#B8E6F1" },
] as const;

export function profileInk(color: string) {
  const channels = color.slice(1).match(/.{2}/g)!.map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
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
