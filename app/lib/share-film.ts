/** A deterministic, frame-addressable recreation of the supplied 33.57s edit.
 * Every image, text card and accent comes from the current Strip, never a demo.
 * Coordinates use a 720 x 1280 story canvas; time is in seconds.
 */
export const SHARE_FILM = { width: 720, height: 1280, fps: 30, duration: 33.57 } as const;
export const SHARE_FILM_CUTS = [0, 1.35, 5.3, 6.45, 9.7, 10.4, 13.4, 14.1, 16.8, 20.4, 22.8, 24.9, 28.85, 30.2, 33.57] as const;

export type ShareFilmStrip = {
  id: string; title: string; username: string | null;
  cover: { kind: "image"; src: string } | { kind: "color"; color: string };
  blocks: readonly {
    type: string; src?: string; content?: string; backgroundColor?: string;
    textColor?: string; mediaType?: string;
  }[];
  endingStyle?: { backgroundColor: string; buttonColor: string };
};
export type FilmTile = { image?: CanvasImageSource; color: string; text?: string; ink?: string };
export type ShareFilmAssets = { tiles: FilmTile[]; palette: string[]; title: string; byline: string; seed: number };
type Context = CanvasRenderingContext2D;
const W = SHARE_FILM.width, H = SHARE_FILM.height, CX = W / 2, CY = H / 2;
const TAU = Math.PI * 2;
const PAPER = "#E5E5E2", DARK = "#111410";
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const ease = (p: number) => { const n = clamp(p); return n * n * (3 - 2 * n); };
const out = (p: number) => 1 - Math.pow(1 - clamp(p), 3);
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export function filmColor(value: string | undefined): string | null {
  if (!value) return null;
  const hex = value.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map(x => x + x).join("") : hex;
  return /^[0-9a-f]{6}$/i.test(full) ? "#" + full.toUpperCase() : null;
}
export function filmSeed(id: string) {
  return [...id].reduce((value, c) => Math.imul(value ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
}
function random(seed: number, index: number) {
  let n = (seed + Math.imul(index + 1, 374761393)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function filmPalette(strip: ShareFilmStrip) {
  const colors = [strip.cover.kind === "color" ? strip.cover.color : undefined,
    ...strip.blocks.flatMap(b => [b.backgroundColor, b.textColor]),
    strip.endingStyle?.backgroundColor, strip.endingStyle?.buttonColor,
  ].map(filmColor).filter((c): c is string => !!c);
  const unique = [...new Set(colors)];
  // The most chromatic of the actual Strip colors leads the motion graphics.
  const chroma = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...rgb) - Math.min(...rgb);
  };
  return unique.sort((a, b) => chroma(b) - chroma(a)).slice(0, 6);
}
export function filmMediaSources(strip: ShareFilmStrip) {
  const media = strip.blocks.filter(b => b.src).map(b => ({ src: b.src!, video: b.type === "video" || b.mediaType === "video" }));
  const cover = strip.cover;
  if (cover.kind === "image" && !media.some(m => m.src === cover.src)) media.push({ src: cover.src, video: false });
  const unique = media.filter((m, i) => media.findIndex(x => x.src === m.src) === i);
  // Bound decoded memory on phones, sampling the whole Strip rather than just its beginning.
  return unique.length <= 18 ? unique : Array.from({ length: 18 }, (_, i) => unique[Math.round(i * (unique.length - 1) / 17)]);
}
function rect(c: Context, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function line(c: Context, x: number, y: number, x2: number, y2: number, color: string, width = 1) {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
}
function text(c: Context, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", weight = 400, maxWidth = 650) {
  c.fillStyle = color; c.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  c.textAlign = align; c.textBaseline = "middle";
  const fit = Math.min(1, maxWidth / Math.max(1, c.measureText(value).width));
  c.save(); c.translate(x, y); c.scale(fit, fit); c.fillText(value, 0, 0); c.restore();
}
function tile(c: Context, a: ShareFilmAssets, index: number, x: number, y: number, w: number, h = w, alpha = 1) {
  if (w <= 0 || h <= 0 || alpha <= 0) return;
  const item = a.tiles[((index % a.tiles.length) + a.tiles.length) % a.tiles.length];
  c.save(); c.globalAlpha *= alpha;
  rect(c, x, y, w, h, item.color);
  if (item.image) {
    const image = item.image as HTMLCanvasElement;
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale, sh = h / scale;
    c.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
  } else if (item.text && w > 55) {
    c.beginPath(); c.rect(x + 5, y, w - 10, h); c.clip();
    const words = item.text.replace(/\s+/g, " ").slice(0, 72).split(" ");
    const lines = [words.slice(0, 4).join(" "), words.slice(4, 8).join(" ")].filter(Boolean);
    lines.forEach((value, i) => text(c, value, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * w * 0.12, w * 0.1, item.ink || PAPER, "center", 500, w * 0.86));
  }
  c.restore();
}
function diamond(c: Context, x: number, y: number, size: number, color: string, width = 9) {
  const r = size / 2, k = r * 0.22;
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = "miter"; c.beginPath();
  c.moveTo(x - k, y - r); c.lineTo(x + k, y - r); c.lineTo(x + r, y - k); c.lineTo(x + r, y + k);
  c.lineTo(x + k, y + r); c.lineTo(x - k, y + r); c.lineTo(x - r, y + k); c.lineTo(x - r, y - k); c.closePath(); c.stroke();
}
function handles(c: Context, x: number, y: number, w: number, h: number, color = PAPER, size = 10) {
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) rect(c, px - size / 2, py - size / 2, size, size, color);
}
function heart(c: Context, x: number, y: number, size: number, color: string) {
  c.save(); c.translate(x, y); c.scale(size / 40, size / 40); c.beginPath();
  c.moveTo(0, 16); c.bezierCurveTo(-37, -5, -13, -28, 0, -10); c.bezierCurveTo(13, -28, 37, -5, 0, 16);
  c.lineWidth = 3; c.strokeStyle = color; c.stroke(); c.restore();
}
function mark(c: Context, x: number, y: number, size: number, color: string) {
  // A strip of three staggered blocks, not the reference film's logo.
  for (let i = 0; i < 3; i++) rect(c, x - size / 2 + i * size * 0.3, y - size / 2 + i * size * 0.14, size * 0.2, size * (1 - i * 0.14), color);
}
function ring(c: Context, a: ShareFilmAssets, t: number) {
  const zoom = 1 + ease(span(t, 0.45, 1.35)) * 1.45;
  const fade = 1 - ease(span(t, 1, 1.5));
  const cards = Array.from({ length: 38 }, (_, i) => {
    const angle = i / 38 * TAU + t * 0.68;
    return { i, angle, z: Math.sin(angle) };
  }).sort((x, y) => x.z - y.z);
  for (const { i, angle, z } of cards) {
    const size = (100 + random(a.seed, i) * 70 + (z + 1) * 27) * zoom;
    const x = CX + Math.cos(angle) * 268 * zoom;
    const y = CY + Math.sin(angle) * 323 * zoom;
    if (i % 9 === 0) { c.globalAlpha = fade; c.strokeStyle = PAPER; c.strokeRect(x - size / 2, y - size / 2, size, size); c.globalAlpha = 1; }
    else if (i % 6 === 0) { c.globalAlpha = fade; rect(c, x - size / 2, y - size / 2, size, size, a.palette[i % a.palette.length]); c.globalAlpha = 1; }
    else tile(c, a, i, x - size / 2, y - size / 2, size, size * (0.8 + random(a.seed, i + 80) * 0.4), fade);
  }
  c.save(); c.translate(CX, CY); c.rotate(Math.PI / 4 + t * 0.1); rect(c, -18, -18, 36, 36, PAPER); c.restore();
}
function spokes(c: Context, a: ShareFilmAssets, t: number) {
  const appear = out(span(t, 1.15, 1.8));
  const radius = mix(330, 233, appear) * (1 + span(t, 4.65, 5.3) * 0.4);
  for (let i = 0; i < 14; i++) {
    const angle = i / 14 * TAU + (t - 1.6) * 0.48;
    const x = CX + Math.cos(angle) * radius, y = CY + Math.sin(angle) * radius;
    const size = 17 + 64 * Math.pow((Math.sin(angle) + 1) / 2, 2);
    line(c, CX + Math.cos(angle) * 32, CY + Math.sin(angle) * 32, x, y, i % 5 === 0 ? a.palette[0] : "#454743");
    if (i % 6 === 0) { rect(c, x - size / 2, y - size / 2, size, size, "#444741"); heart(c, x, y, size * 0.68, a.palette[0]); }
    else if (i % 4 === 0) { c.strokeStyle = PAPER; c.strokeRect(x - size / 2, y - size / 2, size, size); }
    else if (i % 3 === 0) rect(c, x - size / 2, y - size / 2, size, size, a.palette[i % a.palette.length]);
    else tile(c, a, i, x - size / 2, y - size / 2, size);
  }
  rect(c, CX - 8, CY - 8, 16, 16, "#454743");
  if (t > 4.85) {
    const r = 7 + Math.pow(span(t, 4.85, 5.3), 3) * 770;
    c.save(); c.beginPath(); c.arc(CX, CY, r, 0, TAU); c.clip(); tile(c, a, 0, 0, 0, W, H); c.restore();
  }
}
function filmstrip(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 6.45, 9.7), height = mix(575, 335, out(p * 1.8));
  const y = CY - height / 2;
  const panel = mix(720, 175, ease(span(t, 7.5, 8.8)));
  const travel = (t - 6.45) * 270;
  for (let i = -2; i < 10; i++) {
    const x = i * (panel + 8) - travel % (panel + 8);
    tile(c, a, i + Math.floor(travel / (panel + 8)) + 2, x, y, panel, height);
    if (t > 8.3) {
      rect(c, x, CY - 21, panel, 42, i % 2 ? "#8C8D89" : "#454743");
      diamond(c, x + panel * 0.24, CY, 27, i % 2 ? PAPER : a.palette[0], 5);
    }
  }
  if (t > 6.9 && t < 8.4) {
    const x = mix(100, 700, span(t, 6.9, 8.4));
    line(c, x, 155, x, H, a.palette[0], 3); rect(c, x - 6, 150, 12, 12, a.palette[0]);
  }
  if (t > 9.15) {
    const w = out(span(t, 9.15, 9.7)) * W;
    rect(c, CX - w / 2, y - 5, w, height + 10, DARK); diamond(c, CX, CY, 40, a.palette[0], 7);
  }
}
function graphicTimeline(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 10.4, 13.4);
  const count = Math.floor(1 + ease(p) * 11), rowH = mix(480, 136, ease(p));
  const scroll = span(t, 12.35, 13.4) * 680;
  for (let i = 0; i < count; i++) {
    const w = 260 + random(a.seed, i) * 450;
    const x = (random(a.seed, i + 20) - 0.5) * 320 + 130 * Math.sin(t * 2 + i);
    const y = CY - rowH / 2 + i * (rowH + 8) - scroll;
    const color = i % 2 ? PAPER : a.palette[i % a.palette.length];
    rect(c, x, y, w, rowH, i % 3 ? "#757670" : "#999B95");
    c.save(); c.beginPath(); c.rect(x, y, w, rowH); c.clip();
    const size = rowH * 0.8;
    for (let j = -1; j < 5; j++) diamond(c, x + (j + 0.5) * rowH - ((t * 95) % rowH), y + rowH / 2, size, color, Math.max(7, rowH * 0.09));
    c.restore(); handles(c, x, y, w, rowH, PAPER, Math.max(7, 18 * (1 - p)));
  }
}
function kineticType(c: Context, a: ShareFilmAssets, t: number) {
  if (t < 14.1) {
    const headline = a.title.length > 24 ? a.title.slice(0, 23).trimEnd() + "…" : a.title;
    const offset = (t - 13.4) * 220;
    for (let i = -1; i < 17; i++) text(c, headline, 4, i * 108 - offset, 104, PAPER, "left", 400, 705);
    rect(c, 55, CY - 54, 640, 106, "#7D7F78");
    text(c, headline, 65, CY, 104, DARK, "left", 400, 610);
    text(c, "→", 0, CY, 78, a.palette[0], "left"); return;
  }
  const phrases = ["a little", "world", "to step", "into"];
  const index = Math.min(3, Math.floor((t - 14.1) / 0.65));
  const p = span(t, 14.1 + index * 0.65, 14.1 + index * 0.65 + 0.65);
  const y = CY + mix(68, 0, out(p * 3));
  if (index) text(c, phrases[index - 1], CX - 25, y - 90, 91, "#656960");
  text(c, phrases[index], CX + 20, y, 103, p < 0.35 ? a.palette[0] : PAPER);
  if (index === 3) {
    const size = mix(0, 92, out(span(t, 16.3, 16.65)));
    rect(c, 0, 0, W, H, DARK); mark(c, CX, CY, size, a.palette[0]);
  }
}
function paperGeometry(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 16.8, 20.4), rotation = (t - 16.8) * 0.48;
  const invert = t > 19.25;
  rect(c, 0, 0, W, H, invert ? DARK : "#D3D4D0");
  // Registration folds and a fine grid evoke the reference's printed sheets.
  for (let i = 0; i < 12; i++) line(c, i * 64, 0, i * 64, H, invert ? "#292C27" : "#BFC1BB", 0.6);
  for (let i = 0; i < 22; i++) line(c, 0, i * 64, W, i * 64, invert ? "#20231F" : "#C5C7C0", 0.6);
  c.save(); c.translate(CX, CY); c.rotate(rotation);
  const outer = mix(570, 930, ease(p));
  diamond(c, 0, 0, outer, invert ? "#ACAEA7" : "#686C63", 23);
  for (let i = 0; i < 4; i++) {
    c.save(); c.rotate(i * Math.PI / 2); rect(c, -25, -outer / 2 - 8, 50, 50, i % 2 ? PAPER : a.palette[0]); c.restore();
  }
  c.restore();
  for (let i = 3; i >= 0; i--) {
    const size = (i + 1) * 118 * (1 - p * 0.12);
    c.save(); c.translate(CX, CY); c.rotate(rotation * (i % 2 ? -0.65 : 0.3));
    rect(c, -size / 2, -size / 2, size, size, i % 2 ? PAPER : DARK);
    if (i === 1) { c.strokeStyle = a.palette[0]; c.lineWidth = 8; c.strokeRect(-size / 2 + 14, -size / 2 + 14, size - 28, size - 28); }
    if (i === 3) handles(c, -size / 2, -size / 2, size, size, DARK, 45);
    c.restore();
  }
  c.save(); c.translate(CX, CY); c.rotate(rotation * 0.8); tile(c, a, 3, -44, -44, 88); c.restore();
}
type Point = { x: number; y: number; z: number };
function cube(c: Context, a: ShareFilmAssets, x: number, y: number, size: number, angle: number, index: number) {
  const corners = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const vertices: Point[] = corners.map(([px, py, pz]) => {
    const rx = px * Math.cos(angle) + pz * Math.sin(angle), rz = -px * Math.sin(angle) + pz * Math.cos(angle);
    const ry = py * Math.cos(angle * 0.7) - rz * Math.sin(angle * 0.7), z = py * Math.sin(angle * 0.7) + rz * Math.cos(angle * 0.7);
    const perspective = 4 / (4 - z);
    return { x: x + rx * size * perspective / 2, y: y + ry * size * perspective / 2, z };
  });
  const faces = [[0,1,2,3],[4,5,6,7],[0,4,7,3],[1,5,6,2],[0,1,5,4],[3,2,6,7]];
  faces.sort((p, q) => p.reduce((s, i) => s + vertices[i].z, 0) - q.reduce((s, i) => s + vertices[i].z, 0));
  for (let f = 0; f < faces.length; f++) {
    const points = faces[f].map(i => vertices[i]);
    c.save(); c.beginPath(); points.forEach((v, i) => i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)); c.closePath(); c.clip();
    const [v0, v1, , v3] = points;
    c.transform((v1.x - v0.x) / 200, (v1.y - v0.y) / 200, (v3.x - v0.x) / 200, (v3.y - v0.y) / 200, v0.x, v0.y);
    tile(c, a, index + f, -1, -1, 202);
    rect(c, -1, -1, 202, 202, `rgba(0,0,0,${0.14 + f * 0.055})`); c.restore();
  }
  for (const v of vertices.filter((_, i) => i % 3 === 0)) { c.fillStyle = a.palette[0]; c.beginPath(); c.arc(v.x, v.y, 4, 0, TAU); c.fill(); }
}
function dimensional(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 20.4, 22.8), theta = (t - 20.4) * 1.25;
  c.strokeStyle = "#565B50"; c.lineWidth = 1; c.beginPath(); c.ellipse(CX, CY, 295, 242, theta * 0.25, 0, TAU); c.stroke();
  for (let i = 0; i < 6; i++) { const angle = i / 6 * TAU + theta * 0.25; line(c, CX, CY, CX + Math.cos(angle) * 1100, CY + Math.sin(angle) * 1100, "#4F534A", 0.7); }
  const distance = mix(80, 190, out(p));
  cube(c, a, CX - Math.cos(theta) * distance, CY - Math.sin(theta) * distance, 195, theta, 0);
  cube(c, a, CX + Math.cos(theta) * distance, CY + Math.sin(theta) * distance, 195, theta + 1.4, 3);
}
function portals(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 22.8, 24.9);
  for (let i = 0; i < 7; i++) {
    const zoom = 1 + ((p * 1.6) % 0.45);
    const width = 700 * Math.pow(0.7, i) * zoom;
    const height = width * 1.52;
    const y = CY - height / 2 + Math.sin(p * Math.PI + i * 0.5) * (1 - p) * 95;
    tile(c, a, i + Math.floor(p * 4), CX - width / 2, y, width, height);
    const inset = Math.max(12, width * 0.12);
    rect(c, CX - width / 2 + inset, y + inset, width - inset * 2, height - inset * 2, i % 3 === 0 ? a.palette[i % a.palette.length] : DARK);
    if (i === 3) handles(c, CX - width / 2, y, width, height, PAPER, 9);
  }
}
function closingMosaic(c: Context, a: ShareFilmAssets, t: number) {
  const p = span(t, 24.9, 28.85), shrink = 1 - ease(span(t, 28, 28.85));
  const spread = ease(span(t, 24.9, 26.7));
  const items = Array.from({ length: 58 }, (_, i) => {
    const angle = i * 0.26 + t * 0.57;
    const radius = (110 + i * 6) * spread;
    const waveX = Math.sin(i * 0.38 + t) * 230;
    return { i, x: mix(waveX, Math.cos(angle) * radius, spread) * shrink,
      y: mix((i - 29) * 97 + p * 1800, Math.sin(angle) * radius * 1.48, spread) * shrink,
      size: (26 + random(a.seed, i + 160) * 112) * shrink };
  });
  for (const { i, x, y, size } of items) {
    if (i % 13 === 0) { rect(c, CX + x - size / 2, CY + y - size / 2, size, size, a.palette[i % a.palette.length]); heart(c, CX + x, CY + y, size * 0.7, DARK); }
    else tile(c, a, i, CX + x - size / 2, CY + y - size / 2, size);
  }
}

export function renderShareFilm(c: Context, a: ShareFilmAssets, seconds: number) {
  const t = Math.max(0, Math.min(SHARE_FILM.duration, seconds));
  c.save(); c.scale(c.canvas.width / W, c.canvas.height / H);
  rect(c, 0, 0, W, H, t < 5.3 ? "#1D201C" : DARK);
  if (t < 1.5) ring(c, a, t);
  if (t >= 1.35 && t < 5.3) spokes(c, a, t);
  else if (t >= 5.3 && t < 6.45) {
    const index = t < 5.9 ? 0 : 1, scale = 1 + span(t, index ? 5.9 : 5.3, index ? 6.45 : 5.9) * 0.18;
    tile(c, a, index, CX - W * scale / 2, CY - H * scale / 2, W * scale, H * scale);
  } else if (t >= 6.45 && t < 9.7) filmstrip(c, a, t);
  else if (t >= 9.7 && t < 10.4) diamond(c, CX, CY, mix(40, 165, out(span(t, 9.7, 10.4))), a.palette[0], 19);
  else if (t >= 10.4 && t < 13.4) graphicTimeline(c, a, t);
  else if (t >= 13.4 && t < 16.8) kineticType(c, a, t);
  else if (t >= 16.8 && t < 20.4) paperGeometry(c, a, t);
  else if (t >= 20.4 && t < 22.8) dimensional(c, a, t);
  else if (t >= 22.8 && t < 24.9) portals(c, a, t);
  else if (t >= 24.9 && t < 28.85) closingMosaic(c, a, t);
  else if (t >= 28.85) {
    const reveal = out(span(t, 30.2, 30.7));
    mark(c, CX - reveal * 104, CY, 66, a.palette[0]);
    c.save(); c.beginPath(); c.rect(CX - 48, CY - 60, 250 * reveal, 120); c.clip();
    text(c, "STRIP", CX - 40, CY, 66, PAPER, "left", 700); c.restore();
    if (t > 31.1) { c.globalAlpha = ease(span(t, 31.1, 31.6)); text(c, a.byline, CX, CY + 82, 22, "#AFB3A9", "center", 400, 600); }
  }
  c.restore();
}
