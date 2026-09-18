export type StripEndingStyle = {
  backgroundColor: string;
  buttonColor: string;
};

export const DEFAULT_STRIP_ENDING_STYLE: StripEndingStyle = {
  backgroundColor: "#000000",
  buttonColor: "#FFFFFF",
};

/** The last in-flow block determines the reader's monochrome action card. */
export function automaticStripEndingStyle(
  blocks: readonly { id: string; type: string; backgroundColor?: string }[],
  mediaColors: Readonly<Record<string, string>> = {},
): StripEndingStyle {
  const last = [...blocks].reverse().find((block) => block.type !== "sticker");
  if (!last) return { ...DEFAULT_STRIP_ENDING_STYLE };
  const color = normalizeHexColor(
    last.type === "text" ? last.backgroundColor : mediaColors[last.id],
    "#000000",
  );
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels.reduce(
    (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
    0,
  );
  const backgroundColor = luminance > 0.179 ? "#000000" : "#FFFFFF";
  return {
    backgroundColor,
    buttonColor: backgroundColor === "#000000" ? "#FFFFFF" : "#000000",
  };
}

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
