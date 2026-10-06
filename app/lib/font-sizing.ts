/** Optical sizing, shared by profile headings, font menus and Strip text.
 * H/x outline tops, in em units, audited by scripts/audit-font-sizing.py.
 * Titles weight capitals at 65%, lowercase at 35%. Paragraphs weight
 * capitals at 25%, lowercase at 75%, so small serif/pixel lowercase remains
 * readable. Measuring both preserves each face's natural case proportions.
 * Native faces have separate measurements for title (700) and text (450).
 * This is a render adjustment only. Stored fontSize remains the user's size.
 */
export const FONT_VISUAL_METRICS = {
  letter: { text: [0.71582, 0.518555], title: [0.71582, 0.518555] },
  sans: { text: [0.70459, 0.528238], title: [0.70459, 0.537598] },
  serif: { text: [0.696777, 0.479004], title: [0.696777, 0.483887] },
  mono: { text: [0.70459, 0.530389], title: [0.70459, 0.53765] },
  rounded: { text: [0.711873, 0.51949], title: [0.714111, 0.533936] },
  display: { text: [0.712, 0.429], title: [0.712, 0.429] },
  arial: { text: [0.71582, 0.518555], title: [0.71582, 0.518555] },
  times: { text: [0.662109, 0.447266], title: [0.662109, 0.456543] },
  "changa-one": { text: [0.625, 0.5], title: [0.625, 0.5] },
  "rubik-black": { text: [0.7, 0.52], title: [0.7, 0.52] },
  shrikhand: { text: [0.666, 0.529], title: [0.666, 0.529] },
  "dela-gothic-one": { text: [0.726, 0.546], title: [0.726, 0.546] },
  "rammetto-one": { text: [0.779785, 0.606934], title: [0.779785, 0.606934] },
  gloock: { text: [0.75, 0.508], title: [0.75, 0.508] },
  "yeseva-one": { text: [0.7, 0.5], title: [0.7, 0.5] },
  "jacquarda-bastarda-9": { text: [0.769231, 0.461538], title: [0.769231, 0.461538] },
  unifrakturcook: { text: [0.749512, 0.527344], title: [0.749512, 0.527344] },
  // Retain the same normalization for older saved profiles and Strips.
  condensed: { text: [0.708, 0.496], title: [0.708, 0.523] },
  hand: { text: [0.8675, 0.53375], title: [0.8675, 0.53375] },
  bungee: { text: [0.72, 0.72], title: [0.72, 0.72] },
  "rubik-mono-one": { text: [0.7, 0.7], title: [0.7, 0.7] },
  notable: { text: [0.7, 0.7], title: [0.7, 0.7] },
} as const;

type FontSizeContext = "title" | "text";
const opticalHeight = ([capHeight, xHeight]: readonly number[], context: FontSizeContext) => {
  const capWeight = context === "title" ? 0.65 : 0.25;
  return capHeight * capWeight + xHeight * (1 - capWeight);
};
const referenceHeight = {
  title: opticalHeight(FONT_VISUAL_METRICS.letter.title, "title"),
  text: opticalHeight(FONT_VISUAL_METRICS.letter.text, "text"),
};

export function fontVisualScale(id: unknown, context: FontSizeContext = "text") {
  const metrics = typeof id === "string" && Object.hasOwn(FONT_VISUAL_METRICS, id)
    ? FONT_VISUAL_METRICS[id as keyof typeof FONT_VISUAL_METRICS]
    : FONT_VISUAL_METRICS.sans;
  return referenceHeight[context] / opticalHeight(metrics[context], context);
}

export function normalizedFontSize(id: unknown, size: number, context: FontSizeContext = "text") {
  return Math.round(size * fontVisualScale(id, context) * 1000) / 1000;
}
