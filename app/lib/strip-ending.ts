export type StripEndingStyle = {
  backgroundColor: string;
  buttonColor: string;
};

export const DEFAULT_STRIP_ENDING_STYLE: StripEndingStyle = {
  backgroundColor: "#000000",
  buttonColor: "#FFFFFF",
};

const STRIP_ENDING_RECORD_ID = "strip-ending";

type StripEndingRecord = StripEndingStyle & {
  id: typeof STRIP_ENDING_RECORD_ID;
  type: "ending";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const compact = value.trim().replace(/^#/, "");
  const expanded =
    compact.length === 3
      ? compact
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : compact;
  return /^[0-9a-f]{6}$/i.test(expanded)
    ? `#${expanded.toUpperCase()}`
    : fallback;
}

function isStripEndingRecord(value: unknown): value is StripEndingRecord {
  return isRecord(value) && value.type === "ending";
}

export function normalizeStripEndingStyle(value: unknown): StripEndingStyle {
  const candidate = isRecord(value) ? value : {};
  return {
    backgroundColor: normalizeHexColor(
      candidate.backgroundColor,
      DEFAULT_STRIP_ENDING_STYLE.backgroundColor,
    ),
    buttonColor: normalizeHexColor(
      candidate.buttonColor,
      DEFAULT_STRIP_ENDING_STYLE.buttonColor,
    ),
  };
}

export function readStripContent(value: string): {
  blocks: unknown[];
  endingStyle: StripEndingStyle;
} {
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    // Broken or legacy content falls back to an empty Strip and default ending.
  }

  const endingRecord = [...items].reverse().find(isStripEndingRecord);
  return {
    blocks: items.filter((item) => !isStripEndingRecord(item)),
    endingStyle: normalizeStripEndingStyle(endingRecord),
  };
}

export function writeStripContent(
  blocks: readonly unknown[],
  endingStyle?: unknown,
) {
  const ending: StripEndingRecord = {
    id: STRIP_ENDING_RECORD_ID,
    type: "ending",
    ...normalizeStripEndingStyle(endingStyle),
  };
  return JSON.stringify([
    ...blocks.filter((block) => !isStripEndingRecord(block)),
    ending,
  ]);
}
