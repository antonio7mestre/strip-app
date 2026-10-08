export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
// A real Instagram link sticker is much larger than a line of footer text.
// All layouts reserve this clear area, with extra room around the sticker itself.
// These are the approved gallery's cover and paper-frame limits. The footer
// fits below the artwork, rather than shrinking approved covers to make room.
export const POSTER_COVER_BOTTOM = 1600;
export const POSTER_CONTENT_BOTTOM = POSTER_COVER_BOTTOM + 28;
export const LINK_STICKER_AREA = { x: 112, y: 1656, width: 856, height: 220 } as const;
export const LINK_STICKER_TARGET = { x: 160, y: 1686, width: 760, height: 160 } as const;
export const SAVED_LINK_GUIDANCE_CENTER_Y = LINK_STICKER_TARGET.y + LINK_STICKER_TARGET.height / 2;
export const SAVED_LINK_GUIDANCE_SCALE = 1.3;
export const SAVED_LINK_PANEL_PADDING = 24;
export const SAVED_LINK_PANEL_COLOR = "#D9D9D9";
export const SAVED_LINK_PANEL_ROUNDNESS = 34 / 106;
export const POSTER_DESIGNS = [
  { id: "masonry-wall", name: "Masonry wall", mode: "masonry", x: 350, y: 710, width: 620, size: 80, gap: 28, front: "label", darkness: .12 },
  { id: "after-hours-grid", name: "After-hours grid", mode: "night-grid", x: 210, y: 540, width: 670, size: 96, gap: 30, front: "naked", darkness: .72 },
  { id: "portrait-atmosphere", name: "Portrait atmosphere", mode: "portrait-hero", x: 80, y: 530, width: 690, size: 80, gap: 32, front: "label", darkness: .5 },
  { id: "photo-diptych", name: "Photo diptych", mode: "diptych", x: 230, y: 555, width: 630, size: 86, gap: 32, front: "paper", darkness: 0 },
  { id: "sidecar-strip", name: "Sidecar Strip", mode: "sidecar", x: 414, y: 570, width: 560, size: 82, gap: 34, front: "label", darkness: 0 },
  { id: "diagonal-cascade", name: "Diagonal cascade", mode: "cascade", x: 240, y: 670, width: 580, size: 82, gap: 30, front: "paper", darkness: .12 },
  { id: "soft-memory", name: "Soft memory", mode: "soft-stack", x: 110, y: 450, width: 850, size: 90, gap: 38, front: "naked", darkness: .48 },
  { id: "stepped-blocks", name: "Stepped blocks", mode: "steps", x: 90, y: 590, width: 710, size: 82, gap: 30, front: "paper", darkness: 0 },
] as const;

/** Gapless masonry. Each column fills the canvas, with staggered horizontal seams. */
export function steppedPosterTiles(heights: number[]) {
  const columns: number[][] = [[], []], totals = [0, 0];
  heights.forEach((height, index) => {
    const column = totals[0] <= totals[1] ? 0 : 1;
    columns[column].push(index); totals[column] += Math.max(150, height);
  });
  const cells: { index: number; x: number; y: number; width: number; height: number }[] = [];
  columns.forEach((indices, column) => {
    let y = 0;
    indices.forEach((index, position) => {
      const bottom = position === indices.length - 1 ? STORY_HEIGHT
        : y + Math.max(150, heights[index]) / totals[column] * STORY_HEIGHT;
      cells.push({ index, x: column * 540, y, width: columns[1].length ? 540 : STORY_WIDTH, height: bottom - y });
      y = bottom;
    });
  });
  return cells.sort((a, b) => a.index - b.index);
}

export type PosterBlock = {
  id?: string; type: string; mediaType?: string; src?: string; content?: string;
  backgroundColor?: string; textColor?: string; fontStyle?: string; fontSize?: number;
  height?: number; cropTop?: number; cropBottom?: number;
  x?: number; y?: number; width?: number; rotation?: number;
};
export type PosterStrip = {
  id: string; title: string; username?: string | null;
  cover: { kind: string; src?: string; color?: string; shape?: string };
  blocks: PosterBlock[];
  profileBackground?: string; profileTextColor?: string; profileFont?: string;
  endingStyle?: { backgroundColor?: string; buttonColor?: string };
};
export type PosterPhoto = { source: CanvasImageSource; width: number; height: number };
export type PosterTile = PosterPhoto & { id: string; type: string; top: number; flowHeight: number; color?: string };
export type PosterAssets = {
  title: string; address: string; palette: string[]; photos: PosterPhoto[];
  cover?: PosterPhoto | null; coverColor?: string; coverRatio?: number;
  theme?: { background: string; ink: string; font: string; weight: number; scale?: number };
  tiles?: PosterTile[]; flow?: PosterPhoto;
};

export function posterColor(value?: string) {
  if (!value) return null;
  const raw = value.replace(/^#/, "");
  return /^[\da-f]{3}$/i.test(raw) ? `#${[...raw].map(c => c + c).join("").toUpperCase()}`
    : /^[\da-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}
export function posterPalette(strip: PosterStrip) {
  const colors = [strip.profileBackground, strip.profileTextColor, strip.cover.color, ...strip.blocks.flatMap(b => [b.backgroundColor, b.textColor]), strip.endingStyle?.backgroundColor, strip.endingStyle?.buttonColor];
  const unique = [...new Set(colors.map(posterColor).filter((c): c is string => !!c))];
  // Actual strip colors first. Black/white remain the brand's neutral ink.
  const chromatic = unique.filter(c => {
    const rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return Math.max(...rgb) - Math.min(...rgb) > 28;
  });
  return [...chromatic, ...unique.filter(c => !chromatic.includes(c))].slice(0, 6);
}
export function posterMedia(strip: PosterStrip) {
  // Order and repetitions belong to the Strip. Only network requests are deduplicated.
  return [...new Set([...(strip.cover.kind === "image" && strip.cover.src ? [strip.cover.src] : []),
    ...strip.blocks.flatMap(block => block.src ? [block.src] : [])])];
}
export function posterInk(color: string) {
  const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? "#000000" : "#FFFFFF";
}

const SANS = '"Arial", "Helvetica Neue", sans-serif';
const LINK_STICKER_FONT = '"Helvetica Neue", Arial, sans-serif';
const LINK_STICKER_FACE_COLOR = "#38362F";
const LINK_STICKER_INSTRUCTION_COLOR = "#2C2A25";

/** Size the saved cue to its contents, with equal padding on all four sides. */
export function savedLinkHintLayout(c: CanvasRenderingContext2D) {
  const lines = ["Paste your link", "sticker here"];
  const fontSize = 24, iconHeight = 48, rowHeight = iconHeight, gap = 16;
  c.save(); c.font = `400 ${fontSize}px ${LINK_STICKER_FONT}`;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  const metrics = lines.map(line => {
    const measure = c.measureText(line);
    return { width: measure.width,
      ascent: Number.isFinite(measure.actualBoundingBoxAscent) ? measure.actualBoundingBoxAscent : fontSize * .8,
      descent: Number.isFinite(measure.actualBoundingBoxDescent) ? measure.actualBoundingBoxDescent : fontSize * .2 };
  });
  c.restore();
  const textGap = 5;
  const textHeight = metrics.reduce((sum, metric) => sum + metric.ascent + metric.descent, textGap);
  // Balance the two-line copy against the badge without making it equally large.
  const textInkHeight = iconHeight * .75;
  const textScale = textInkHeight / Math.max(1, textHeight);
  const textY = (rowHeight - textInkHeight) / 2;
  const linkX = rowHeight + gap + 20 + gap;
  const linkWidth = 244 * iconHeight / 106;
  const textX = linkX + linkWidth + gap;
  const width = textX + Math.max(...metrics.map(metric => metric.width)) * textScale;
  const padding = SAVED_LINK_PANEL_PADDING;
  const scale = Math.min(SAVED_LINK_GUIDANCE_SCALE, (LINK_STICKER_TARGET.width - padding * 2) / width);
  const panelWidth = width * scale + padding * 2, panelHeight = rowHeight * scale + padding * 2;
  return {
    lines, fontSize, iconHeight, rowHeight, textHeight, textInkHeight, textScale, textY,
    linkX, textX, width, scale, padding,
    baselines: [metrics[0].ascent, metrics[0].ascent + metrics[0].descent + textGap + metrics[1].ascent],
    panel: { x: (STORY_WIDTH - panelWidth) / 2, y: SAVED_LINK_GUIDANCE_CENTER_Y - panelHeight / 2,
      width: panelWidth, height: panelHeight, radius: panelHeight * SAVED_LINK_PANEL_ROUNDNESS },
  };
}

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

/** Instagram's sticker menu and Link sticker, redrawn as crisp canvas vectors. */
export function drawLinkStickerHint(c: CanvasRenderingContext2D, ink: string, layout = savedLinkHintLayout(c)) {
  // Keep both icons and the instruction inside a normal-size sticker's footprint,
  // so placing the real sticker here covers the entire hint.
  c.save();
  c.translate(layout.panel.x + layout.padding, layout.panel.y + layout.padding);
  c.scale(layout.scale, layout.scale);
  c.save();
  // Match the reference's charcoal circle, smiling face, and turned-up corner.
  c.scale(layout.iconHeight / 128, layout.iconHeight / 128);
  c.fillStyle = LINK_STICKER_FACE_COLOR;
  c.beginPath(); c.arc(64, 64, 64, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#FFFDF9"; c.lineWidth = 6;
  c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath();
  c.moveTo(54, 35); c.lineTo(75, 35);
  c.bezierCurveTo(87, 35, 94, 43, 94, 55);
  c.lineTo(94, 69); c.lineTo(71, 93); c.lineTo(54, 93);
  c.bezierCurveTo(42, 93, 35, 86, 35, 74); c.lineTo(35, 55);
  c.bezierCurveTo(35, 42, 42, 35, 54, 35); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(94, 69); c.lineTo(83, 69);
  c.bezierCurveTo(75, 69, 71, 74, 71, 82); c.lineTo(71, 93); c.stroke();
  c.beginPath(); c.moveTo(54, 73);
  c.bezierCurveTo(60, 79, 68, 79, 74, 73); c.stroke();
  c.fillStyle = "#FFFDF9";
  for (const x of [54, 74]) {
    c.beginPath(); c.arc(x, 57, 4, 0, Math.PI * 2); c.fill();
  }
  c.restore();

  // Read as a small instruction sequence, not another interactive control.
  c.save(); c.strokeStyle = ink; c.lineWidth = 2;
  c.lineCap = "round"; c.lineJoin = "round";
  const arrowX = layout.rowHeight + 16, arrowY = layout.rowHeight / 2;
  c.beginPath(); c.moveTo(arrowX, arrowY); c.lineTo(arrowX + 20, arrowY);
  c.moveTo(arrowX + 14, arrowY - 6); c.lineTo(arrowX + 20, arrowY); c.lineTo(arrowX + 14, arrowY + 6); c.stroke();
  c.restore();

  c.save(); c.translate(layout.linkX, 0); c.scale(layout.iconHeight / 106, layout.iconHeight / 106);
  // Preserve the rounded white badge and blue diagonal chain from the reference.
  c.fillStyle = "#FFFFFF"; c.beginPath();
  c.moveTo(34, 0); c.lineTo(210, 0);
  c.bezierCurveTo(233, 0, 244, 12, 244, 34); c.lineTo(244, 72);
  c.bezierCurveTo(244, 95, 232, 106, 210, 106); c.lineTo(34, 106);
  c.bezierCurveTo(11, 106, 0, 94, 0, 72); c.lineTo(0, 34);
  c.bezierCurveTo(0, 11, 12, 0, 34, 0); c.closePath(); c.fill();
  c.strokeStyle = "#00A5EF"; c.lineWidth = 5.5;
  c.lineCap = "round"; c.lineJoin = "round";
  c.beginPath(); c.moveTo(55, 38); c.lineTo(60, 33);
  c.bezierCurveTo(67, 27, 76, 30, 80, 35);
  c.bezierCurveTo(86, 41, 84, 47, 79, 53); c.lineTo(73, 59); c.stroke();
  c.beginPath(); c.moveTo(45, 48); c.lineTo(40, 53);
  c.bezierCurveTo(34, 59, 34, 68, 40, 73);
  c.bezierCurveTo(46, 79, 54, 77, 60, 71); c.lineTo(65, 66); c.stroke();
  c.beginPath(); c.moveTo(49, 62); c.lineTo(66, 45); c.stroke();
  c.fillStyle = "#080A0B"; c.font = `400 56px ${LINK_STICKER_FONT}`;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.fillText("Link", 102, 74, 120);
  c.restore();

  // Keep the smaller two-line instruction optically centered on the sticker artwork.
  c.save(); c.translate(layout.textX, layout.textY); c.scale(layout.textScale, layout.textScale);
  c.fillStyle = LINK_STICKER_INSTRUCTION_COLOR; c.font = `400 ${layout.fontSize}px ${LINK_STICKER_FONT}`;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  layout.lines.forEach((line, index) => c.fillText(line, 0, layout.baselines[index]));
  c.restore();
  c.restore();
}

/** Measure the address after setting its actual font, never use a fixed-width badge. */
export function posterLinkBounds(c: CanvasRenderingContext2D, address: string) {
  const width = Math.min(LINK_STICKER_TARGET.width, c.measureText(address).width + 48);
  return { x: (STORY_WIDTH - width) / 2, y: 1690, width, height: 85 };
}

function wrapPosterText(c: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ""; }
    // Keep unbroken usernames and every title character, without an ellipsis.
    for (const letter of word) {
      if (line && c.measureText(line + letter).width > width) { lines.push(line); line = ""; }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Foreground artwork and title never enter the unchanged Instagram sticker area. */
export function posterCoverBounds(assets: PosterAssets, index: number) {
  const design = POSTER_DESIGNS[index] ?? POSTER_DESIGNS[0];
  const cover = assets.cover ?? assets.photos[0];
  const ratio = cover ? cover.height / cover.width : assets.coverRatio ?? 1;
  const height = Math.min(POSTER_COVER_BOTTOM - design.y, design.width * ratio);
  const width = Math.min(design.width, height / ratio);
  // Very thin images retain their entire source without making the title unreadable.
  const boxWidth = width < 180 ? design.width : width;
  return { x: design.x, y: design.y, width: boxWidth, height, imageWidth: width };
}

function drawFitted(c: CanvasRenderingContext2D, photo: PosterPhoto,
  x: number, y: number, width: number, height: number, contain = false) {
  const scale = contain ? Math.min(width / photo.width, height / photo.height)
    : Math.max(width / photo.width, height / photo.height);
  const w = photo.width * scale, h = photo.height * scale;
  c.save(); c.beginPath(); c.rect(x,y,width,height); c.clip();
  c.drawImage(photo.source,0,0,photo.width,photo.height,x+(width-w)/2,y+(height-h)/2,w,h);
  c.restore();
}

/** Preview and PNG export share one composition. Only the link-sticker cue differs. */
export function drawPoster(c: CanvasRenderingContext2D, assets: PosterAssets, index: number, saved = false) {
  const design = POSTER_DESIGNS[index] ?? POSTER_DESIGNS[0];
  const colors = posterBackgrounds(assets.palette);
  const theme = assets.theme ?? { background: colors[0], ink: posterInk(colors[0]), font: SANS, weight: 500 };
  const mat = posterInk(theme.ink);
  const tiles: PosterTile[] = assets.tiles ?? assets.photos.map((photo,i) => ({
    ...photo, id: String(i), type: "image", top: 0, flowHeight: photo.height / photo.width * 390,
  }));
  const fill = (color: string,x=0,y=0,w=1080,h=1920) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  const tile = (i: number,x: number,y: number,w: number,h: number,rotation=0) => {
    const p=tiles[i]; if (!p) return;
    c.save(); c.translate(x+w/2,y+h/2); c.rotate(rotation*Math.PI/180);
    fill(p.color ?? theme.background,-w/2,-h/2,w,h);
    drawFitted(c,p,-w/2,-h/2,w,h,p.type==="text");
    c.restore();
  };
  const stack = (x: number,y: number,w: number,h: number) => {
    if (assets.flow) {
      c.drawImage(assets.flow.source,0,0,assets.flow.width,assets.flow.height,x,y,w,h);
      return;
    }
    const total=tiles.reduce((sum,p)=>sum+p.flowHeight,0); let top=y;
    tiles.forEach((p,i)=>{const height=p.flowHeight/total*h;tile(i,x,top,w,height);top+=height;});
  };
  const grid = (gap=48) => {
    const rows=Math.max(1,Math.ceil(tiles.length/2)),w=(1080-3*gap)/2,h=(1920-(rows+1)*gap)/rows;
    // Tiny cells must still stay finite on exceptionally long Strips.
    const g=Math.min(gap,1920/(rows+1)*.2),cellHeight=(1920-(rows+1)*g)/rows;
    tiles.forEach((_,i)=>tile(i,g+(i%2)*(w+g),g+Math.floor(i/2)*(cellHeight+g),
      i===tiles.length-1 && tiles.length%2 ? 1080-2*g : w,Math.max(1,h>0?h:cellHeight)));
  };
  c.save(); c.setTransform(c.canvas.width/STORY_WIDTH,0,0,c.canvas.height/STORY_HEIGHT,0,0);
  fill(theme.background);
  switch (design.mode) {
    case "masonry": {
      if (tiles.length===7) {
        [[40,40,470,640],[540,40,500,360],[540,430,500,650],[40,710,470,450],
          [40,1190,470,690],[540,1110,500,220],[540,1360,500,520]]
          .forEach(([x,y,w,h],i)=>tile(i,x,y,w,h));
      } else {
        const columns: number[][]=[[],[]],heights=[0,0];
        tiles.forEach((p,i)=>{const column=heights[0]<=heights[1]?0:1;columns[column].push(i);
          heights[column]+=Math.max(150,p.flowHeight);});
        columns.forEach((indices,column)=>{
          const gap=Math.min(30,1800/Math.max(1,indices.length)*.15);
          const available=1840-gap*Math.max(0,indices.length-1); let y=40;
          indices.forEach(i=>{const h=Math.max(150,tiles[i].flowHeight)/heights[column]*available;
            tile(i,column===0?40:540,y,column===0?470:500,h);y+=h+gap;});
        });
      }
      break;
    }
    case "night-grid": grid(); break;
    case "steps":
      steppedPosterTiles(tiles.map(p => p.flowHeight)).forEach(cell =>
        tile(cell.index, cell.x, cell.y, cell.width, cell.height));
      break;
    case "portrait-hero": {
      const photos=tiles.map((p,i)=>({p,i})).filter(({p})=>p.type!=="text");
      const hero=photos[1] ?? photos[0];
      if (hero) drawFitted(c,hero.p,0,0,1080,1920);
      const others=tiles.map((_,i)=>i).filter(i=>i!==hero?.i);
      const slots=[[690,60,330,495],[0,0,450,180],[0,1260,530,240],
        [720,1410,360,510],[0,1500,700,130],[0,1630,700,290]];
      if (others.length<=slots.length) others.forEach((i,j)=>{const [x,y,w,h]=slots[j];tile(i,x,y,w,h);});
      else others.forEach((i,j)=>{const h=1920/Math.ceil(others.length/2);
        tile(i,j%2?750:0,Math.floor(j/2)*h,j%2?330:450,h);});
      break;
    }
    case "diptych": {
      if (tiles.length===7) {
        [[0,0,540,780],[0,780,540,220],[540,0,540,780],[540,780,540,220],
          [0,1000,540,920],[540,1000,540,220],[540,1220,540,700]]
          .forEach(([x,y,w,h],i)=>tile(i,x,y,w,h));
      } else grid(0);
      break;
    }
    case "sidecar": stack(0,0,334,1920);fill(theme.ink,334,0,12,1920); break;
    case "cascade": {
      const slots=[[-65,-30,500,640,-12],[510,130,560,200,9],[550,400,530,680,8],
        [25,740,600,235,-7],[-30,1120,590,750,10],[510,1450,560,180,-6],[550,1690,530,310,6]];
      const bands=Math.max(1,Math.ceil(tiles.length/slots.length));
      tiles.forEach((_,i)=>{const [x,y,w,h,r]=slots[i%slots.length];
        tile(i,x,((Math.floor(i/slots.length)*1920)+y)/bands,w,h/bands,r);});
      break;
    }
    case "soft-stack":
      c.save(); c.filter="blur(28px)";stack(-45,-45,1170,2010);c.restore();break;
  }
  if (design.darkness) fill(`rgba(0,0,0,${design.darkness})`);
  const bounds=posterCoverBounds(assets,index),cover=assets.cover ?? assets.photos[0];
  const title=(assets.title || "").trim();
  // The gallery's nominal title sizes are part of the approved composition.
  // Do not apply a second optical adjustment when transferring that design.
  let size: number=design.size,lines: string[]=[];
  do {
    c.font=`${theme.weight} ${size}px ${theme.font}`;
    lines=wrapPosterText(c,title,bounds.width);
    if (lines.length<=2) break;
    size-=2;
  } while(size>18);
  // Extreme titles keep all text inside their allocated space, never over the cover.
  const lineHeight=size*1.07;
  const titleHeight=lines.length*lineHeight,titleY=bounds.y-design.gap-titleHeight;
  const dark=design.front==="naked";
  const darkPanel=posterInk(theme.ink)==="#FFFFFF" ? theme.ink : "#000000";
  if (design.front==="paper") fill(mat,bounds.x-28,titleY-28,bounds.width+56,bounds.y+bounds.height+28-titleY+28);
  if (design.front==="label" && title) fill(mat,bounds.x-12,titleY-12,bounds.width+24,titleHeight+24);
  if (cover) {
    c.drawImage(cover.source,0,0,cover.width,cover.height,
      bounds.x+(bounds.width-bounds.imageWidth)/2,bounds.y,bounds.imageWidth,bounds.height);
  } else fill(assets.coverColor ?? colors[0],bounds.x,bounds.y,bounds.width,bounds.height);
  c.fillStyle=dark?"#FFFFFF":theme.ink;
  c.textAlign="left"; c.textBaseline="top"; c.font=`${theme.weight} ${size}px ${theme.font}`;
  lines.forEach((line,i)=>c.fillText(line,bounds.x,titleY+i*lineHeight,bounds.width));

  // Never export a fake live link. The saved cue hugs its measured contents.
  if (saved) {
    const layout=savedLinkHintLayout(c),panel=layout.panel;
    c.fillStyle=SAVED_LINK_PANEL_COLOR;c.beginPath();
    c.roundRect(panel.x,panel.y,panel.width,panel.height,panel.radius);c.fill();
    drawLinkStickerHint(c,"#000000",layout);
  } else {
    const address=assets.address || "striiip.com";
    c.font=`${theme.weight} 36px ${theme.font}`;
    const badge=posterLinkBounds(c,address);
    fill(dark?darkPanel:mat,badge.x,badge.y,badge.width,badge.height);
    c.fillStyle=dark?"#FFFFFF":theme.ink;c.textAlign="center";c.textBaseline="top";
    c.fillText(address,540,badge.y+20,badge.width-48);
  }
  c.restore();
}
