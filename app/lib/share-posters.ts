export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const POSTER_DESIGNS = [
  { id: "loud", name: "i stripped" },
  { id: "contact", name: "Contact sheet" },
  { id: "sideways", name: "Side note" },
  { id: "billboard", name: "Off center" },
  { id: "booth", name: "Little receipt" },
  { id: "split", name: "Two of us" },
  { id: "scrapbook", name: "Loose ends" },
  { id: "type", name: "A little note" },
  { id: "bleed", name: "In the frame" },
  { id: "scan", name: "Color study" },
] as const;

export type PosterStrip = {
  id: string; title: string; username?: string | null;
  cover: { kind: string; src?: string; color?: string };
  blocks: { type: string; mediaType?: string; src?: string; content?: string; backgroundColor?: string; textColor?: string }[];
  endingStyle?: { backgroundColor?: string; buttonColor?: string };
};
export type PosterPhoto = { source: CanvasImageSource; width: number; height: number };
export type PosterAssets = { title: string; address: string; palette: string[]; photos: PosterPhoto[]; words: string[] };

export function posterColor(value?: string) {
  if (!value) return null;
  const raw = value.replace(/^#/, "");
  return /^[\da-f]{3}$/i.test(raw) ? `#${[...raw].map(c => c + c).join("").toUpperCase()}`
    : /^[\da-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}
export function posterPalette(strip: PosterStrip) {
  const colors = [strip.cover.color, ...strip.blocks.flatMap(b => [b.backgroundColor, b.textColor]), strip.endingStyle?.backgroundColor, strip.endingStyle?.buttonColor];
  const unique = [...new Set(colors.map(posterColor).filter((c): c is string => !!c))];
  // Actual strip colors first. Black/white remain the brand's neutral ink.
  const chromatic = unique.filter(c => {
    const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return Math.max(...rgb) - Math.min(...rgb) > 28;
  });
  return [...chromatic, ...unique.filter(c => !chromatic.includes(c))].slice(0, 6);
}
export function posterMedia(strip: PosterStrip) {
  const sources = [...(strip.cover.kind === "image" && strip.cover.src ? [strip.cover.src] : []), ...strip.blocks.filter(b => b.type === "image" || (b.type === "sticker" && b.mediaType !== "video")).flatMap(b => b.src ? [b.src] : [])];
  const all = [...new Set(sources)].filter(s => !/\.(mp4|mov|webm)(?:\?|$)/i.test(s));
  if (all.length <= 8) return all;
  return Array.from({ length: 8 }, (_, i) => all[Math.round(i * (all.length - 1) / 7)]);
}
export function posterInk(color: string) {
  const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? "#000000" : "#FFFFFF";
}
export function posterSwipeProgress(start: number, current: number, index: number) {
  let progress = (start - current) / 150;
  if ((index === 0 && progress < 0) || (index === POSTER_DESIGNS.length - 1 && progress > 0)) progress *= .2;
  return Math.max(-.95, Math.min(.95, progress));
}
export function posterSwipeTarget(index: number, progress: number) {
  return Math.max(0, Math.min(POSTER_DESIGNS.length - 1, index + (Math.abs(progress) >= .24 ? Math.sign(progress) : 0)));
}

const SANS = '"Arial", "Helvetica Neue", sans-serif';
const MONO = '"Courier New", monospace';

/** Fit the entire image, including its rotated corners, inside its allotted space. */
export function fitPosterPhoto(width: number, height: number, boxWidth: number, boxHeight: number, rotation = 0) {
  const angle = rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle)), sine = Math.abs(Math.sin(angle));
  const scale = Math.min(boxWidth / (width * cosine + height * sine), boxHeight / (width * sine + height * cosine));
  return { width: width * scale, height: height * scale };
}

/** Every layout uses the same full-image renderer for preview and 1080×1920 export. */
export function drawPoster(c: CanvasRenderingContext2D, assets: PosterAssets, index: number) {
  const { photos, title, address, words } = assets;
  const palette = assets.palette.length ? assets.palette : ["#3155FF"];
  const accent = palette[0], ink = posterInk(accent);
  const second = palette.find(color => color !== accent) || (ink === "#000000" ? "#FFFFFF" : "#000000");
  const count = Math.max(1, photos.length);
  const fill = (color: string, x = 0, y = 0, w = STORY_WIDTH, h = STORY_HEIGHT) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  const text = (value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", mono = false, maxWidth = 900) => {
    c.fillStyle = color; c.textAlign = align; c.textBaseline = "top";
    c.font = `${mono ? 400 : 500} ${size}px ${mono ? MONO : SANS}`;
    c.fillText(value, x, y, maxWidth);
  };
  const caption = (value: string, x: number, y: number, width: number, color: string, size = 38, maxLines = 3) => {
    c.font = `500 ${size}px ${SANS}`;
    const output: string[] = []; let line = "";
    for (const word of value.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > width) { output.push(line); line = word; } else line = next;
    }
    if (line) output.push(line);
    output.slice(0, maxLines).forEach((value, i) => {
      const truncated = i === maxLines - 1 && output.length > maxLines ? `${value}…` : value;
      text(truncated, x, y + i * size * 1.2, size, color, "left", false, width);
    });
  };
  const photo = (i: number, x: number, y: number, w: number, h: number, rotation = 0) => {
    const p = photos.length ? photos[i % photos.length] : null;
    const dimensions = fitPosterPhoto(p?.width || 4, p?.height || 3, w, h, rotation);
    const bounds = { x: x + (w - dimensions.width) / 2, y: y + (h - dimensions.height) / 2, ...dimensions };
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rotation * Math.PI / 180);
    if (p) {
      // Full source rectangle, always. No crop, stretching, masks, or images over images.
      c.drawImage(p.source, 0, 0, p.width, p.height, -dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
    } else {
      const color = palette[i % palette.length];
      fill(color, -dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
      caption(words[i % words.length] || title, -dimensions.width * .4, -dimensions.height * .32, dimensions.width * .8, posterInk(color), Math.min(44, dimensions.width / 12), 4);
    }
    c.restore();
    return bounds;
  };
  const heading = (color = ink, x = 88, y = 280, align: CanvasTextAlign = "left") => text("i stripped", x, y, 48, color, align);
  const footer = (color = ink, y = 1740) => text(address, 540, y, 24, color, "center", true, 880);

  c.save(); c.setTransform(c.canvas.width / STORY_WIDTH, 0, 0, c.canvas.height / STORY_HEIGHT, 0, 0);
  fill(accent);
  switch (index) {
    case 0: { // A full cover, a small line, and generous space. Nothing else.
      const image = photo(0, 100, 465, 880, 1030);
      heading(ink, 540, image.y - 100, "center");
      footer();
      break;
    }
    case 1: { // Actual aspect ratios float in a quiet contact sheet.
      fill("#000000"); heading("#FFFFFF");
      const n = Math.min(count, 6), columns = n === 1 ? 1 : 2, rows = Math.ceil(n / columns);
      const gap = 40, cellWidth = (904 - gap * (columns - 1)) / columns, cellHeight = (1100 - gap * (rows - 1)) / rows;
      for (let i = 0; i < n; i++) {
        const x = 88 + (i % columns) * (cellWidth + gap), y = 480 + Math.floor(i / columns) * (cellHeight + gap);
        const image = photo(i, x, y, cellWidth, cellHeight - 40);
        text(String(i + 1).padStart(2, "0"), x, image.y + image.height + 14, 20, "#FFFFFF", "left", true);
      }
      footer("#FFFFFF"); break;
    }
    case 2: { // A tiny rotated note sits beside, never across, the image.
      photo(0, 220, 365, 768, 1200);
      c.save(); c.translate(105, 1220); c.rotate(-Math.PI / 2);
      text("i stripped", 0, 0, 44, ink); c.restore();
      footer(); break;
    }
    case 3: { // Asymmetric placement, without cutting off the photo or its corners.
      heading();
      photo(0, 244, 470, 748, 1080);
      fill(second, 88, 1486, 64, 64);
      footer(); break;
    }
    case 4: { // A paper receipt. Each slot fits its complete photo.
      const paperInk = posterInk(second);
      fill(second, 150, 220, 780, 1430); heading(paperInk, 212, 280);
      const n = Math.min(count, 3), height = (1040 - (n - 1) * 32) / n;
      for (let i = 0; i < n; i++) photo(i, 212, 420 + i * (height + 32), 656, height);
      text(String(n).padStart(2, "0") + " good moments", 212, 1555, 24, paperInk, "left", true, 656);
      footer(); break;
    }
    case 5: { // A diptych, sized to the photos rather than filling the page.
      heading(ink, 540, 330, "center");
      const n = Math.min(count, 2), w = n === 1 ? 860 : 410;
      for (let i = 0; i < n; i++) photo(i, 110 + i * 450, 545, w, 920);
      footer(); break;
    }
    case 6: { // Loose placement with fully contained rotations and no overlap.
      fill(second); const color = posterInk(second); heading(color);
      const n = Math.min(count, 3), slotHeight = (1120 - (n - 1) * 44) / n;
      for (let i = 0; i < n; i++) photo(i, i % 2 ? 230 : 88, 465 + i * (slotHeight + 44), 760, slotHeight, i % 2 ? 5 : -5);
      footer(color); break;
    }
    case 7: { // A complete image and a short note from this actual strip.
      heading(); photo(0, 100, 445, 880, 935);
      caption(words[0] || title, 100, 1480, 880, ink, 38, 3);
      footer(ink, 1770); break;
    }
    case 8: { // A flat color mat, not a full-bleed image crop.
      fill(second, 54, 160, 972, 1620);
      const color = posterInk(second); heading(color, 130, 270);
      photo(0, 130, 420, 820, 1170);
      footer(color, 1680); break;
    }
    default: { // One intact cover and a small swatch strip made of its authored colors.
      heading(ink, 540, 310, "center");
      const image = photo(0, 145, 490, 790, 960);
      const swatches = palette.slice(0, 4), w = 224 / swatches.length;
      for (let i = 0; i < swatches.length; i++) fill(swatches[i], 428 + i * w, image.y + image.height + 54, w, 20);
      footer();
    }
  }
  c.restore();
}
