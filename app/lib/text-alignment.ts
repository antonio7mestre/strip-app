export type TextAlignment = "left" | "center" | "right";

/** Old blocks and invalid input retain the original left alignment. */
export function normalizeTextAlignment(value: unknown): TextAlignment {
  return value === "center" || value === "right" ? value : "left";
}
