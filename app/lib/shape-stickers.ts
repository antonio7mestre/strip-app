export const SHAPE_STICKER_DEFAULT_COLOR = "#3155FF";

export const SHAPE_STICKER_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "White", value: "#FFFFFF" },
  { name: "Acid", value: "#8ACE00" },
  { name: "Hot pink", value: "#FF4FA3" },
  { name: "Electric blue", value: SHAPE_STICKER_DEFAULT_COLOR },
  { name: "Laser violet", value: "#7A2CFF" },
  { name: "Safety orange", value: "#FF4D00" },
] as const;

export const SHAPE_STICKERS = [
  { id: "sparkle", name: "Sparkle", path: "M128 18 C139 84 172 117 238 128 C172 139 139 172 128 238 C117 172 84 139 18 128 C84 117 117 84 128 18 Z" },
  { id: "heart", name: "Heart", path: "M128 225 C109 207 22 147 22 88 C22 49 48 27 80 27 C101 27 116 38 128 56 C140 38 155 27 176 27 C208 27 234 49 234 88 C234 147 147 207 128 225 Z" },
  { id: "star", name: "Star", path: "M128 17 L155 88 L231 91 L173 139 L193 213 L128 172 L63 213 L83 139 L25 91 L101 88 Z" },
  { id: "flower", name: "Flower", path: "M128 86 C99 30 44 32 51 81 C7 97 22 146 70 151 C48 194 85 229 128 196 C171 229 208 194 186 151 C234 146 249 97 205 81 C212 32 157 30 128 86 Z M128 109 A19 19 0 1 0 128 147 A19 19 0 1 0 128 109 Z", fillRule: "evenodd" },
  { id: "bolt", name: "Lightning bolt", path: "M144 13 L42 139 L107 139 L83 243 L215 101 L146 101 Z" },
  { id: "burst", name: "Burst", path: "M128 13 L149 64 L202 34 L190 91 L246 100 L204 139 L238 184 L179 177 L166 236 L128 193 L90 236 L77 177 L18 184 L52 139 L10 100 L66 91 L54 34 L107 64 Z" },
  { id: "moon", name: "Crescent moon", path: "M167 19 C91 23 35 77 35 136 C35 196 83 237 143 237 C189 237 221 211 237 178 C163 202 93 154 93 91 C93 59 121 31 167 19 Z" },
  { id: "cloud", name: "Cloud", path: "M63 200 C32 200 17 180 17 156 C17 132 37 113 65 114 C72 74 100 52 135 52 C168 52 193 70 201 102 C226 104 242 122 242 146 C242 175 220 200 188 200 Z" },
  { id: "diamond", name: "Diamond", path: "M128 15 L235 128 L128 241 L21 128 Z" },
  { id: "drop", name: "Teardrop", path: "M128 17 C111 52 38 126 38 171 C38 218 76 242 128 242 C180 242 218 218 218 171 C218 126 145 52 128 17 Z" },
  { id: "bubble", name: "Speech bubble", path: "M128 27 C61 27 22 66 22 119 C22 174 62 204 112 205 L84 240 L151 201 C204 193 234 159 234 119 C234 66 195 27 128 27 Z" },
  { id: "squiggle", name: "Squiggle", path: "M29 72 C64 19 119 32 120 76 C121 107 84 116 78 140 C74 156 87 168 108 164 C141 158 138 113 181 111 C214 109 231 138 225 171 C222 192 209 211 189 224 L165 192 C178 182 188 170 186 157 C185 150 179 146 172 149 C160 155 154 193 119 202 C76 213 36 185 36 145 C36 113 62 98 74 76 C81 62 67 60 58 81 Z" },
] as const;

export type ShapeSticker = (typeof SHAPE_STICKERS)[number];

export function normalizeShapeColor(value: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export function shapeColorInk(value: string): "#000000" | "#FFFFFF" {
  const color = normalizeShapeColor(value) ?? SHAPE_STICKER_DEFAULT_COLOR;
  const [red, green, blue] = color.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
  const linear = [red, green, blue].map((channel) => channel <= 0.04045
    ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.18 ? "#000000" : "#FFFFFF";
}

export function shapeColorPosition(value: string) {
  const color = normalizeShapeColor(value) ?? SHAPE_STICKER_DEFAULT_COLOR;
  const [red, green, blue] = color.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return { hue: (hue + 360) % 360, lightness: lightness * 100,
    saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) };
}

export function shapeColorFromHsl(hue: number, lightness: number): string {
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const chroma = 1 - Math.abs(2 * l - 1);
  const segment = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0, green = 0, blue = 0;
  if (segment < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (segment < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, secondary];
  else if (segment < 4) [red, green, blue] = [0, secondary, chroma];
  else if (segment < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];
  const match = l - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function shapeStickerSvg(shape: ShapeSticker, color: string): string {
  const fill = normalizeShapeColor(color) ?? SHAPE_STICKER_DEFAULT_COLOR;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256"><path d="${shape.path}" fill="${fill}"${"fillRule" in shape ? ` fill-rule="${shape.fillRule}"` : ""}/></svg>`;
}

/** Store a passive PNG, not SVG markup, through the existing sticker media path. */
export async function renderShapeSticker(shape: ShapeSticker, color: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([shapeStickerSvg(shape, color)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not make shape sticker"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not make shape sticker");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
