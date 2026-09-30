export const SHAPE_STICKER_DEFAULT_COLOR = "#3155FF";

export const SHAPE_STICKER_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "White", value: "#FFFFFF" },
  { name: "Acid", value: "#8ACE00" },
  { name: "Hot pink", value: "#FF4FA3" },
  { name: "Chrome", value: "#D9D9D9" },
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
  { id: "circle", name: "Circle", path: "M128 20 A108 108 0 1 1 128 236 A108 108 0 1 1 128 20 Z" },
  { id: "oval", name: "Oval", path: "M128 49 A110 79 0 1 1 128 207 A110 79 0 1 1 128 49 Z" },
  { id: "square", name: "Square", path: "M24 24 H232 V232 H24 Z" },
  { id: "soft-square", name: "Soft square", path: "M76 22 H180 Q234 22 234 76 V180 Q234 234 180 234 H76 Q22 234 22 180 V76 Q22 22 76 22 Z" },
  { id: "triangle", name: "Triangle", path: "M128 20 L240 222 H16 Z" },
  { id: "hexagon", name: "Hexagon", path: "M74 30 H182 L238 128 L182 226 H74 L18 128 Z" },
  { id: "octagon", name: "Octagon", path: "M83 20 H173 L236 83 V173 L173 236 H83 L20 173 V83 Z" },
  { id: "semicircle", name: "Half circle", path: "M18 188 A110 110 0 0 1 238 188 Z" },
  { id: "arch", name: "Arch", path: "M40 234 V108 A88 88 0 0 1 216 108 V234 Z" },
  { id: "ring", name: "Ring", path: "M128 18 A110 110 0 1 1 128 238 A110 110 0 1 1 128 18 Z M128 56 A72 72 0 1 1 128 200 A72 72 0 1 1 128 56 Z", fillRule: "evenodd" },
  { id: "oval-ring", name: "Oval ring", path: "M128 38 A110 90 0 1 1 128 218 A110 90 0 1 1 128 38 Z M128 68 A76 60 0 1 1 128 188 A76 60 0 1 1 128 68 Z", fillRule: "evenodd" },
  { id: "wavy-frame", name: "Wavy frame", path: "M28 28 C60 10 84 42 112 26 C146 8 174 40 208 24 C231 13 244 40 231 65 C217 95 247 114 231 144 C214 172 245 199 228 224 C210 247 181 216 154 232 C127 247 101 216 73 232 C43 249 14 230 26 202 C41 170 10 150 25 119 C42 87 10 63 28 28 Z M62 60 H194 V196 H62 Z", fillRule: "evenodd" },
  { id: "plus", name: "Plus", path: "M98 24 H158 V98 H232 V158 H158 V232 H98 V158 H24 V98 H98 Z" },
  { id: "cross", name: "Cross", path: "M57 20 L128 91 L199 20 L236 57 L165 128 L236 199 L199 236 L128 165 L57 236 L20 199 L91 128 L20 57 Z" },
  { id: "asterisk", name: "Asterisk", path: "M109 18 H147 L147 95 L214 57 L233 90 L166 128 L233 166 L214 199 L147 161 V238 H109 V161 L42 199 L23 166 L90 128 L23 90 L42 57 L109 95 Z" },
  { id: "six-point-star", name: "Six-point star", path: "M128 16 L160 73 H224 L192 128 L224 183 H160 L128 240 L96 183 H32 L64 128 L32 73 H96 Z" },
  { id: "eight-point-star", name: "Eight-point star", path: "M128 16 L150 76 L207 49 L180 106 L240 128 L180 150 L207 207 L150 180 L128 240 L106 180 L49 207 L76 150 L16 128 L76 106 L49 49 L106 76 Z" },
  { id: "sun", name: "Sun", path: "M128 66 A62 62 0 1 1 128 190 A62 62 0 1 1 128 66 Z M128 14 L144 51 H112 Z M128 242 L112 205 H144 Z M14 128 L51 112 V144 Z M242 128 L205 144 V112 Z M47 47 L85 62 L62 85 Z M209 47 L194 85 L171 62 Z M47 209 L62 171 L85 194 Z M209 209 L171 194 L194 171 Z" },
  { id: "scalloped-seal", name: "Scalloped seal", path: "M128 29 C143 10 166 17 172 39 C196 28 216 45 211 68 C236 71 246 95 229 113 C249 128 242 153 221 161 C231 184 214 205 191 202 C187 227 163 238 145 222 C130 244 105 240 96 218 C73 230 51 216 52 192 C26 191 14 168 29 148 C8 134 12 108 34 98 C23 76 37 52 61 53 C62 28 85 15 105 30 C112 20 122 20 128 29 Z" },
  { id: "clover", name: "Clover", path: "M128 78 C77 0 5 58 58 110 C-2 148 51 230 110 184 C108 205 101 222 88 237 H121 C133 219 140 201 143 183 C205 228 257 146 198 110 C249 58 178 0 128 78 Z" },
  { id: "butterfly", name: "Butterfly", path: "M123 110 C91 48 35 17 23 53 C9 95 39 126 68 137 C28 151 28 204 59 218 C91 233 113 193 128 159 C143 193 165 233 197 218 C228 204 228 151 188 137 C217 126 247 95 233 53 C221 17 165 48 133 110 L134 87 Q128 72 122 87 Z" },
  { id: "leaf", name: "Leaf", path: "M221 20 C122 21 39 49 31 121 C25 163 48 192 76 204 L46 234 L65 242 L95 212 C181 220 234 139 221 20 Z" },
  { id: "flame", name: "Flame", path: "M138 15 C155 64 111 86 124 115 C147 109 164 87 168 68 C227 123 234 186 192 220 C166 242 94 248 62 215 C19 170 49 121 77 92 C77 124 92 138 102 142 C75 88 132 65 138 15 Z" },
  { id: "blob", name: "Blob", path: "M127 24 C161 8 187 39 191 66 C195 94 238 97 239 133 C240 167 203 171 190 198 C175 234 143 250 115 226 C90 205 51 233 30 204 C7 173 34 148 32 118 C30 84 12 62 40 43 C66 26 88 45 127 24 Z" },
  { id: "splash", name: "Paint splash", path: "M121 83 C108 65 113 13 132 17 C152 20 132 67 144 83 C159 97 195 33 211 51 C226 69 170 102 178 117 C185 130 236 105 241 126 C246 148 191 140 181 153 C170 168 226 193 210 212 C194 230 161 177 148 183 C133 190 161 237 139 241 C117 245 121 194 105 183 C91 174 69 222 51 209 C33 195 79 163 73 147 C67 132 16 151 15 130 C14 109 66 123 79 110 C92 96 34 63 49 47 C65 30 101 95 121 83 Z" },
  { id: "wave", name: "Wave", path: "M16 83 C55 34 91 39 128 83 C165 127 201 132 240 83 V173 C201 222 165 217 128 173 C91 129 55 124 16 173 Z" },
  { id: "arrow-right", name: "Right arrow", path: "M18 100 H137 V45 L239 128 L137 211 V156 H18 Z" },
  { id: "bent-arrow", name: "Curved arrow", path: "M22 224 C18 118 61 67 159 67 V22 L238 98 L159 174 V123 C94 121 69 157 72 224 Z" },
  { id: "chevron", name: "Chevron", path: "M37 28 H112 L222 128 L112 228 H37 L147 128 Z" },
  { id: "ribbon-banner", name: "Ribbon banner", path: "M18 58 L77 68 L128 56 L179 68 L238 58 L212 128 L238 198 L179 188 L128 200 L77 188 L18 198 L44 128 Z" },
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
