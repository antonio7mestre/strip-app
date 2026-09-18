export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const POSTER_DESIGNS = [
  { id: "loud", name: "Cover story" },
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
export type PosterAssets = { title: string; address: string; palette: string[]; photos: PosterPhoto[] };

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

/** Authored colors become surfaces, with warm paper replacing black backgrounds. */
export function posterBackgrounds(colors: string[]) {
  const safe = colors.map(posterColor).filter((c): c is string => !!c).map(color => {
    const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    return Math.max(...channels) < 32 ? "#F0EDE6" : color;
  });
  const unique = [...new Set(safe)];
  const accent = unique[0] || "#F0EDE6";
  const second = unique[1] || (accent === "#F0EDE6" ? "#D5D0C6" : "#F0EDE6");
  return [accent, second, unique[2] || accent];
}

/** Fit the entire image, including its rotated corners, inside its allotted space. */
export function fitPosterPhoto(width: number, height: number, boxWidth: number, boxHeight: number, rotation = 0) {
  const angle = rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle)), sine = Math.abs(Math.sin(angle));
  const scale = Math.min(boxWidth / (width * cosine + height * sine), boxHeight / (width * sine + height * cosine));
  return { width: width * scale, height: height * scale };
}

/** Every layout uses the same full-image renderer for preview and 1080×1920 export. */
export function drawPoster(c: CanvasRenderingContext2D, assets: PosterAssets, index: number, saved = false) {
  const { photos } = assets;
  const title = (assets.title || "").trim();
  const palette = posterBackgrounds(assets.palette);
  const [accent, second, third] = palette, ink = posterInk(accent);
  const count = Math.max(1, photos.length);
  const fill = (color: string, x = 0, y = 0, w = STORY_WIDTH, h = STORY_HEIGHT) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  const drawTitle = (x: number, y: number, width: number, height: number, color = ink, align: CanvasTextAlign = "left") => {
    if (!title) return;
    let size = 48, lines: string[] = [];
    for (; size >= 18; size -= 2) {
      c.font = `500 ${size}px ${SANS}`;
      lines = []; let line = "";
      for (const word of title.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (c.measureText(next).width <= width) { line = next; continue; }
        if (line) { lines.push(line); line = ""; }
        // A long unbroken title must fit too, without cropping or ellipses.
        for (const letter of word) {
          if (line && c.measureText(line + letter).width > width) { lines.push(line); line = ""; }
          line += letter;
        }
      }
      if (line) lines.push(line);
      if (lines.length * size * 1.2 <= height) break;
    }
    c.fillStyle = color; c.textAlign = align; c.textBaseline = "top";
    const left = align === "center" ? x + width / 2 : x;
    const top = y + (height - lines.length * size * 1.2) / 2;
    lines.forEach((line, i) => c.fillText(line, left, top + i * size * 1.2, width));
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
      // Image-free strips become color compositions, never invented text.
      fill(palette[i % palette.length], -dimensions.width / 2, -dimensions.height / 2, dimensions.width, dimensions.height);
      fill(palette[(i + 1) % palette.length], -dimensions.width / 2, dimensions.height * .2, dimensions.width, dimensions.height * .3);
    }
    c.restore();
    return bounds;
  };

  c.save(); c.setTransform(c.canvas.width / STORY_WIDTH, 0, 0, c.canvas.height / STORY_HEIGHT, 0, 0);
  fill(accent);
  switch (index) {
    case 0: { // Full cover above a low color plinth.
      fill(second, 0, 1610, 1080, 310);
      const image = photo(0, 100, title ? 465 : 385, 880, title ? 1030 : 1170);
      drawTitle(100, image.y - 172, 880, 140, ink, "center");
      break;
    }
    case 1: { // A contact sheet with an authored-color edge instead of black.
      fill(second); fill(accent, 0, 0, 32, 1920); fill(accent, 88, 1650, 904, 28);
      drawTitle(88, 240, 904, 140, posterInk(second));
      const n = Math.min(count, 6), columns = n === 1 ? 1 : 2, rows = Math.ceil(n / columns);
      const gap = 40, cellWidth = (904 - gap * (columns - 1)) / columns;
      const start = title ? 480 : 340, cellHeight = ((title ? 1100 : 1240) - gap * (rows - 1)) / rows;
      for (let i = 0; i < n; i++) photo(i, 88 + (i % columns) * (cellWidth + gap), start + Math.floor(i / columns) * (cellHeight + gap), cellWidth, cellHeight);
      break;
    }
    case 2: { // A colored spine and a complete image beside it.
      fill(second, 0, 0, 180, 1920);
      photo(0, 220, 365, 768, 1200);
      c.save(); c.translate(70, 1510); c.rotate(-Math.PI / 2);
      drawTitle(0, 0, 1100, 70, posterInk(second), "center"); c.restore();
      break;
    }
    case 3: { // An off-center color plate, with the title in the upper margin.
      const top = title ? 470 : 350, height = title ? 1080 : 1200;
      fill(second, 184, top - 60, 896, height + 120);
      drawTitle(88, 245, 904, 140);
      photo(0, 244, top, 748, height);
      fill(third, 88, 1640, 128, 32);
      break;
    }
    case 4: { // A long paper insert. No receipt copy or numbering.
      fill(second, 150, 220, 780, 1430);
      drawTitle(212, 258, 656, 132, posterInk(second));
      const n = Math.min(count, 3), start = title ? 430 : 300;
      const height = ((title ? 1100 : 1230) - (n - 1) * 32) / n;
      for (let i = 0; i < n; i++) photo(i, 212, start + i * (height + 32), 656, height);
      break;
    }
    case 5: { // A diptych across a second-color band.
      fill(second, 0, 470, 1080, 1060);
      drawTitle(110, 290, 860, 140, ink, "center");
      const n = Math.min(count, 2), w = n === 1 ? 860 : 410;
      for (let i = 0; i < n; i++) photo(i, 110 + i * 450, title ? 545 : 440, w, title ? 920 : 1120);
      break;
    }
    case 6: { // Loose placement, with color tabs behind the fully visible photos.
      fill(second); fill(accent, 0, title ? 398 : 270, 310, 50); fill(accent, 710, 1640, 370, 50);
      drawTitle(88, 245, 904, 140, posterInk(second));
      const n = Math.min(count, 3), start = title ? 465 : 340;
      const slotHeight = ((title ? 1120 : 1245) - (n - 1) * 44) / n;
      for (let i = 0; i < n; i++) photo(i, i % 2 ? 230 : 88, start + i * (slotHeight + 44), 760, slotHeight, i % 2 ? 5 : -5);
      break;
    }
    case 7: { // An image above a solid caption band, or a wordless color base.
      fill(second, 0, 1460, 1080, 460);
      photo(0, 100, title ? 350 : 310, 880, title ? 1040 : 1140);
      drawTitle(100, 1510, 880, 170, posterInk(second));
      break;
    }
    case 8: { // A flat two-color mat, never a full-bleed crop.
      fill(second, 54, 160, 972, 1620);
      drawTitle(130, 235, 820, 138, posterInk(second));
      photo(0, 130, title ? 420 : 290, 820, title ? 1170 : 1330);
      fill(third, 130, 1680, 820, 22);
      break;
    }
    default: { // Colored rails and a small swatch row surround the intact cover.
      fill(second, 0, 0, 62, 1920); fill(second, 1018, 0, 62, 1920);
      drawTitle(145, 270, 790, 140, ink, "center");
      const image = photo(0, 145, title ? 490 : 410, 790, title ? 960 : 1100);
      for (let i = 0; i < palette.length; i++) fill(palette[i], 360 + i * 120, image.y + image.height + 54, 120, 24);
    }
  }
  // Previews keep the real address; the saved story leaves a place for a link sticker.
  c.fillStyle = posterInk([0, 1, 6, 7, 8].includes(index) ? second : accent);
  c.font = '400 24px "Courier New", monospace';
  c.textAlign = "center"; c.textBaseline = "top";
  c.fillText(saved ? "Paste your link here" : assets.address || "striiip.com", 540, 1740, 880);
  c.restore();
}
