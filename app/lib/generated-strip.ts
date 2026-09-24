import { STICKER_PACK } from "./sticker-pack";

export const MAX_GENERATION_PHOTOS = 12;
export const MAX_GENERATION_BODY_BYTES = 6 * 1024 * 1024;
export type GenerationPhoto = { src: string; preview: string; width: number; height: number; alt: string };
export type GenerationOverlay = {
  kind: "photo" | "sticker";
  placement: "inside" | "join";
  photoIndex: number | null;
  stickerId: string | null;
  x: number;
  y: number;
  width: number;
  rotation: number;
};
export type GenerationSection = {
  kind: "photo" | "space";
  photoIndex: number | null;
  color: string;
  heightRatio: number;
  overlays: GenerationOverlay[];
};
export type GenerationPlan = { sections: GenerationSection[] };
export type GeneratedBlock =
  | { id: string; type: "image"; src: string; alt: string; height: number }
  | { id: string; type: "text"; content: string; backgroundColor: string; textColor: string; fontStyle: "sans"; fontSize: number; layoutHeight: number; layoutWidth: number }
  | { id: string; type: "sticker"; src: string; alt: string; mediaType: "image"; x: number; y: number; width: number; rotation: number; anchorBlockId: string; anchorY: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const finiteBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isPhotoIndex = (value: unknown, count: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;

// Structured output is still untrusted input. Never let it supply URLs, HTML,
// actual text, arbitrary sticker assets, or unchecked canvas coordinates.
export function validateGenerationPlan(value: unknown, photoCount: number): GenerationPlan {
  if (!isRecord(value) || !Array.isArray(value.sections) || value.sections.length < 2 || value.sections.length > photoCount + 6) {
    throw new Error("Invalid generated layout.");
  }
  const photosUsed = new Set<number>();
  const usePhoto = (index: number) => {
    if (photoCount > 1 && photosUsed.has(index)) throw new Error("Repeated photo.");
    photosUsed.add(index);
  };
  const stickersUsed = new Set<string>();
  let photoBlocks = 0;
  let photoStickers = 0;
  let spaces = 0;
  const sections: GenerationSection[] = value.sections.map((section) => {
    if (!isRecord(section) || !["photo", "space"].includes(String(section.kind)) ||
      typeof section.color !== "string" || !/^#[0-9a-f]{6}$/i.test(section.color) ||
      !finiteBetween(section.heightRatio, .4, 1.8) || !Array.isArray(section.overlays) || section.overlays.length > 6) {
      throw new Error("Invalid generated section.");
    }
    const kind = section.kind as "photo" | "space";
    const photoIndex = section.photoIndex;
    if (kind === "photo") {
      if (!isPhotoIndex(photoIndex, photoCount)) throw new Error("Missing photo.");
      usePhoto(photoIndex);
      photoBlocks++;
    } else {
      if (photoIndex !== null) throw new Error("Invalid blank space.");
      spaces++;
    }
    const overlays: GenerationOverlay[] = section.overlays.map((overlay) => {
      if (!isRecord(overlay) || (overlay.placement !== undefined && !["inside", "join"].includes(String(overlay.placement))) ||
        !finiteBetween(overlay.x, 8, 92) || !finiteBetween(overlay.y, 0, 1) ||
        !finiteBetween(overlay.width, 12, 76) || !finiteBetween(overlay.rotation, -14, 14)) {
        throw new Error("Invalid sticker placement.");
      }
      if (overlay.kind === "photo") {
        if (!isPhotoIndex(overlay.photoIndex, photoCount) || overlay.stickerId !== null) {
          throw new Error("Invalid photo sticker.");
        }
        usePhoto(overlay.photoIndex);
        photoStickers++;
      } else if (overlay.kind === "sticker") {
        if (overlay.photoIndex !== null || typeof overlay.stickerId !== "string" ||
          !STICKER_PACK.some((sticker) => sticker.id === overlay.stickerId) || stickersUsed.has(overlay.stickerId)) {
          throw new Error("Invalid pack sticker.");
        }
        stickersUsed.add(overlay.stickerId);
      } else throw new Error("Invalid overlay.");
      return {
        kind: overlay.kind,
        placement: overlay.placement === "join" || (overlay.placement === undefined && overlay.kind === "sticker") ? "join" : "inside",
        photoIndex: overlay.photoIndex as number | null,
        stickerId: overlay.stickerId as string | null,
        x: overlay.x, y: overlay.y, width: overlay.width,
        rotation: overlay.kind === "photo" ? 0 : overlay.rotation,
      };
    });
    // Photos are the foundation of a collage. Pack stickers always sit on top.
    overlays.sort((a, b) => Number(a.kind === "sticker") - Number(b.kind === "sticker"));
    return { kind, photoIndex: photoIndex as number | null, color: section.color, heightRatio: section.heightRatio, overlays };
  });
  if (photosUsed.size !== photoCount || !photoBlocks || !spaces || !photoStickers ||
    stickersUsed.size < Math.max(3, Math.min(18, Math.ceil(photoCount * 1.5))) || stickersUsed.size > 18) {
    throw new Error("Incomplete generated layout.");
  }
  return { sections };
}

export function generationPlanSchema(photoCount: number) {
  const photoIndex = { type: ["integer", "null"], minimum: 0, maximum: photoCount - 1 };
  const overlay = {
    type: "object", additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["photo", "sticker"] }, photoIndex,
      placement: { type: "string", enum: ["inside", "join"], description: "For a photo overlay: join crosses a real block seam; inside a photo section is a fully contained photo-on-photo layer; inside a space section is an inset on colored paper. Mix these treatments." },
      stickerId: { type: ["string", "null"], enum: [null, ...STICKER_PACK.map((s) => s.id)] },
      x: { type: "number", minimum: 8, maximum: 92 },
      y: { type: "number", minimum: 0, maximum: 1 },
      width: { type: "number", minimum: 12, maximum: 76 },
      rotation: { type: "number", minimum: -14, maximum: 14 },
    }, required: ["kind", "placement", "photoIndex", "stickerId", "x", "y", "width", "rotation"],
  };
  return {
    type: "object", additionalProperties: false, required: ["sections"],
    properties: { sections: {
      type: "array", minItems: 2, maxItems: photoCount + 6,
      items: { type: "object", additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["photo", "space"] }, photoIndex,
          color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$", description: "A vivid, saturated hue tied to a visible detail in this or a neighboring photo. Strong midtones, not beige or washed-out pastels." },
          heightRatio: { type: "number", minimum: .4, maximum: 1.8 },
          overlays: { type: "array", maxItems: 6, items: overlay },
        }, required: ["kind", "photoIndex", "color", "heightRatio", "overlays"],
      },
    } },
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function colorChannels(hex: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

// Only generated backgrounds get this treatment, never photos or saved/manual
// colors. Keep the image-inspired hue; remove the muddy/pastel default.
export function boldGenerationColor(color: string, palette: string[] = []): string {
  let channels = colorChannels(color);
  const chroma = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb);
  if (chroma(channels) < .035) {
    // A neutral space can borrow a hue already chosen from these photos. If
    // the entire plan is monochrome, stay monochrome instead of inventing one.
    const accent = palette.map(colorChannels).filter((rgb) => chroma(rgb) >= .12)
      .sort((a, b) => chroma(b) - chroma(a))[0];
    if (!accent) return Math.max(...channels) < .5 ? "#181818" : "#F5F5F5";
    channels = accent;
  }
  const [r, g, b] = channels;
  const max = Math.max(...channels), min = Math.min(...channels), delta = max - min;
  const lightness = (max + min) / 2;
  const originalSaturation = delta / (1 - Math.abs(2 * lightness - 1));
  // Allow half an RGB step at the limits so reprocessing a rounded hex value
  // does not slowly drift by one channel each time.
  if (originalSaturation >= .775 && lightness >= .438 && lightness <= .642) {
    return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue + 6) % 6;
  const saturation = Math.max(.78, originalSaturation);
  const light = clamp(lightness, .44, .64);
  const c = (1 - Math.abs(2 * light - 1)) * saturation;
  const x = c * (1 - Math.abs(hue % 2 - 1)), m = light - c / 2;
  const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] :
    hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function generatedTextColor(background: string) {
  const [r, g, b] = colorChannels(background).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = r * .2126 + g * .7152 + b * .0722;
  const whiteContrast = 1.05 / (luminance + .05);
  const darkContrast = (luminance + .05) / (5 / 255 / 12.92 + .05);
  return whiteContrast > darkContrast ? "#FFFFFF" : "#050505";
}

export function buildGeneratedStrip(
  plan: GenerationPlan, photos: GenerationPhoto[], canvasWidth: number,
  stickerRatios: Record<string, number> = {}, makeId = () => crypto.randomUUID(),
): GeneratedBlock[] {
  const validated = validateGenerationPlan(plan, photos.length);
  const width = Math.max(1, canvasWidth);
  const blocks: Exclude<GeneratedBlock, { type: "sticker" }>[] = [];
  const overlays: Extract<GeneratedBlock, { type: "sticker" }>[] = [];
  const sections: { id: string; top: number; height: number }[] = [];
  let top = 0;
  for (const section of validated.sections) {
    const id = makeId();
    const photo = section.photoIndex === null ? null : photos[section.photoIndex];
    let height = photo ? width * photo.height / photo.width : Math.max(160, width * section.heightRatio);
    if (!photo) {
      // The persisted editor supports a minimum sticker width of 8%. For very
      // tall photos, grow the blank space instead of shrinking past that limit.
      for (const overlay of section.overlays) {
        if (overlay.kind !== "photo" || overlay.placement === "join") continue;
        const image = photos[overlay.photoIndex!];
        height = Math.max(height, width * .08 * image.height / image.width + 88);
      }
    }
    if (photo) blocks.push({ id, type: "image", src: photo.src, alt: photo.alt, height });
    else {
      const backgroundColor = boldGenerationColor(section.color, validated.sections.map((item) => item.color));
      blocks.push({ id, type: "text", content: "", backgroundColor,
        textColor: generatedTextColor(backgroundColor), fontStyle: "sans", fontSize: 18,
        layoutHeight: height, layoutWidth: width });
    }
    sections.push({ id, top, height });
    top += height;
  }
  type Occupied = { x: number; y: number; halfWidth: number; halfHeight: number };
  type Candidate = { x: number; y: number; anchorIndex: number; anchorY: number; seam?: number };
  const occupied: Occupied[] = [];
  const insetPhotos: (Occupied & { sectionIndex: number })[] = [];
  const seamCounts = new Map<number, number>();
  const seamSides = new Map<number, "left" | "right">();
  const paired = new Set<GenerationOverlay>();
  const gutter = width * .02;
  const intersects = (a: Occupied, b: Occupied, gap = gutter) =>
    Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth + gap &&
    Math.abs(a.y - b.y) < a.halfHeight + b.halfHeight + gap;
  const photoFramesIn = (index: number) => insetPhotos.filter((photo) => photo.sectionIndex === index);
  // Place photos first so decorations can avoid the middle of a seam photo.
  const placements = validated.sections.flatMap((section, index) => section.overlays.map((overlay) => ({ section, index, overlay })))
    .sort((a, b) => {
      const rank = (overlay: GenerationOverlay) => overlay.kind === "photo" ? 0 : overlay.placement === "join" ? 1 : 2;
      return rank(a.overlay) - rank(b.overlay);
    });
  for (const { section, index, overlay } of placements) {
    if (paired.has(overlay)) continue;
    const { id, top: sectionTop, height } = sections[index];
      const overlayPhoto = overlay.kind === "photo" ? photos[overlay.photoIndex!] : null;
      const sticker = overlay.kind === "sticker" ? STICKER_PACK.find((s) => s.id === overlay.stickerId)! : null;
      const ratio = overlayPhoto ? overlayPhoto.width / overlayPhoto.height : stickerRatios[sticker!.id] ?? 1;
      const angle = Math.abs(overlay.rotation) * Math.PI / 180;
      if (sticker) {
        if (section.kind === "photo" && overlay.placement === "inside") {
          // Interior decorations on a full photo are an atomic layered pair.
          // Pair the model's nearest choices; never leave one orphaned.
          paired.add(overlay);
          const distance = (other: GenerationOverlay) => Math.hypot((other.x - overlay.x) / 100 * width, (other.y - overlay.y) * height);
          const partner = section.overlays.filter((other) => other.kind === "sticker" && other.placement === "inside" && !paired.has(other))
            .sort((a, b) => distance(a) - distance(b))[0];
          if (!partner || distance(partner) > width * .5) continue;
          paired.add(partner);
          const members = [overlay, partner].map((member) => {
            const asset = STICKER_PACK.find((item) => item.id === member.stickerId)!;
            const aspect = stickerRatios[asset.id] ?? 1;
            const radians = Math.abs(member.rotation) * Math.PI / 180;
            const itemWidth = clamp(member.width, 26, 38);
            return { member, asset, itemWidth,
              halfWidth: width * itemWidth / 100 * (Math.cos(radians) + Math.sin(radians) / aspect) / 2,
              halfHeight: width * itemWidth / 100 * (Math.sin(radians) + Math.cos(radians) / aspect) / 2 };
          });
          const dx = (members[0].halfWidth + members[1].halfWidth) * .68 * (partner.x >= overlay.x ? 1 : -1);
          const dy = (members[0].halfHeight + members[1].halfHeight) * .32 * (partner.y >= overlay.y ? 1 : -1);
          const relative = members.map((member, i) => ({ ...member, x: (i ? .5 : -.5) * dx, y: (i ? .5 : -.5) * dy }));
          const left = Math.min(...relative.map((item) => item.x - item.halfWidth));
          const right = Math.max(...relative.map((item) => item.x + item.halfWidth));
          const upper = Math.min(...relative.map((item) => item.y - item.halfHeight));
          const lower = Math.max(...relative.map((item) => item.y + item.halfHeight));
          if (right - left > width - gutter * 2 || lower - upper > height - gutter * 2) continue;
          const desiredX = (overlay.x + partner.x) / 200 * width;
          const desiredY = sectionTop + (overlay.y + partner.y) / 2 * height;
          const centerX = clamp(desiredX, gutter - left, width - gutter - right);
          const centerY = clamp(desiredY, sectionTop + gutter - upper, sectionTop + height - gutter - lower);
          // Do not move a model-chosen quiet area across the main subject.
          if (Math.abs(centerX - desiredX) > width * .15 || Math.abs(centerY - desiredY) > height * .15) continue;
          const boxes = relative.map((item) => ({ ...item, x: centerX + item.x, y: centerY + item.y }));
          if (boxes.some((box) => occupied.some((item) => intersects(box, item)))) continue;
          for (const box of boxes) {
            occupied.push(box);
            overlays.push({ id: makeId(), type: "sticker", src: box.asset.src, alt: box.asset.name, mediaType: "image",
              x: box.x / width * 100, y: box.y, width: box.itemWidth, rotation: box.member.rotation,
              anchorBlockId: id, anchorY: (box.y - sectionTop) / height });
          }
          continue;
        }
        const heightFactor = Math.sin(angle) + Math.cos(angle) / ratio;
        const widthFactor = Math.cos(angle) + Math.sin(angle) / ratio;
        const itemWidth = Math.min(clamp(overlay.width, 26, 38), 94 / widthFactor);
        const halfWidth = width * itemWidth / 100 * widthFactor / 2;
        const halfHeight = width * itemWidth / 100 * heightFactor / 2;
        const lo = halfWidth + gutter;
        const hi = width - halfWidth - gutter;
        const desiredX = clamp(width * overlay.x / 100, lo, hi);
        const desiredY = sectionTop + height * overlay.y;
        const candidates: Candidate[] = [];
        let preferredSeamEdge: number | undefined;
        const addInside = (anchorIndex: number, x: number, localY: number) => {
          const anchor = sections[anchorIndex];
          // Keep the normal writing line clear, including after a resize.
          const paddingTop = validated.sections[anchorIndex].kind === "space" ? Math.max(76, width * .195) : gutter;
          if (anchor.height - paddingTop - gutter < halfHeight * 2) return;
          const fittedY = clamp(localY, paddingTop + halfHeight, anchor.height - gutter - halfHeight);
          candidates.push({ x: clamp(x, lo, hi), y: anchor.top + fittedY, anchorIndex, anchorY: fittedY / anchor.height });
        };
        if (overlay.placement === "join") {
          const seam = clamp(overlay.y < .5 ? index - 1 : index, 0, sections.length - 2);
          const seamY = sections[seam].top + sections[seam].height;
          if ((seamCounts.get(seam) ?? 0) < 2) {
            const side = seamSides.get(seam) ?? (desiredX < width * .5 ? "left" : "right");
            const sameSide = (x: number) => side === "left" ? x < width * .5 : x > width * .5;
            // Start near the outside edge to leave room for a same-side
            // companion. Never fall back to a mirrored opposite-side sticker.
            preferredSeamEdge = side === "left" ? lo : hi;
            const xs = [preferredSeamEdge, desiredX, ...occupied.flatMap((item) => [
              item.x - item.halfWidth - halfWidth - gutter, item.x + item.halfWidth + halfWidth + gutter,
            ])];
            for (const x of xs) {
              const fittedX = clamp(x, lo, hi);
              if (sameSide(fittedX)) candidates.push({ x: fittedX, y: seamY, anchorIndex: seam, anchorY: 1, seam });
            }
          }
        }
        // On colored paper, every decoration touches an inset photo edge.
        // The same rule applies when a crowded seam falls back into a space.
        for (let neighbor = Math.max(0, index - 1); neighbor <= Math.min(index + 1, sections.length - 1); neighbor++) {
          if (validated.sections[neighbor].kind !== "space") continue;
          for (const photo of photoFramesIn(neighbor)) {
            const overlapX = Math.min(halfWidth * .5, photo.halfWidth * .2);
            const overlapY = Math.min(halfHeight * .5, photo.halfHeight * .2);
            const photoLeft = photo.x - photo.halfWidth, photoRight = photo.x + photo.halfWidth;
            const photoTop = photo.y - photo.halfHeight, photoBottom = photo.y + photo.halfHeight;
            for (const fraction of [.12, .5, .88]) {
              const x = photoLeft + photo.halfWidth * 2 * fraction;
              const y = photoTop + photo.halfHeight * 2 * fraction;
              addInside(neighbor, x, photoTop - halfHeight + overlapY - sections[neighbor].top);
              addInside(neighbor, x, photoBottom + halfHeight - overlapY - sections[neighbor].top);
              addInside(neighbor, photoLeft - halfWidth + overlapX, y - sections[neighbor].top);
              addInside(neighbor, photoRight + halfWidth - overlapX, y - sections[neighbor].top);
            }
          }
        }
        const fits = (candidate: Candidate) => candidate.y - halfHeight >= 0 && candidate.y + halfHeight <= top &&
          (candidate.seam !== undefined || photoFramesIn(candidate.anchorIndex).some((photo) =>
            intersects({ ...candidate, halfWidth, halfHeight }, photo, -width * .01))) &&
          !occupied.some((item) => intersects({ ...candidate, halfWidth, halfHeight }, item));
        const score = (candidate: Candidate) => Math.abs(candidate.x - (candidate.seam !== undefined ? preferredSeamEdge! : desiredX)) + Math.abs(candidate.y - desiredY) +
          (overlay.placement === "join" && candidate.seam === undefined ? width * .45 : 0);
        const chosen = candidates.filter(fits).sort((a, b) => score(a) - score(b))[0];
        // Omit decoration that cannot fit cleanly instead of piling it up.
        // Selected photos are never omitted by this spacing pass.
        if (!chosen) continue;
        occupied.push({ x: chosen.x, y: chosen.y, halfWidth, halfHeight });
        if (chosen.seam !== undefined) {
          seamCounts.set(chosen.seam, (seamCounts.get(chosen.seam) ?? 0) + 1);
          seamSides.set(chosen.seam, chosen.x < width * .5 ? "left" : "right");
        }
        overlays.push({ id: makeId(), type: "sticker", src: sticker.src, alt: sticker.name, mediaType: "image",
          x: chosen.x / width * 100, y: chosen.y, width: itemWidth, rotation: overlay.rotation,
          anchorBlockId: sections[chosen.anchorIndex].id, anchorY: chosen.anchorY });
        continue;
      }
      if (overlay.placement === "join") {
        // Joins can hold related inset photos as well as catalog stickers. The
        // anchor remains exactly on the join as adjacent blocks resize.
        const seam = clamp(overlay.y < .5 ? index - 1 : index, 0, sections.length - 2);
        const seamY = sections[seam].top + sections[seam].height;
        const heightFactor = Math.sin(angle) + Math.cos(angle) / ratio;
        const widthFactor = Math.cos(angle) + Math.sin(angle) / ratio;
        const itemWidth = Math.min(overlay.width, 54, 94 / widthFactor,
          Math.min(seamY, top - seamY) * 2 / heightFactor / width * 100);
        const halfWidth = itemWidth * widthFactor / 2;
        const lo = halfWidth + 2;
        const hi = 98 - halfWidth;
        const preferred = clamp(overlay.x, lo, hi);
        const frame = { sectionIndex: index, x: preferred / 100 * width, y: seamY, halfWidth: halfWidth / 100 * width,
          halfHeight: width * itemWidth / 100 * heightFactor / 2 };
        // A seam photo belongs visually to both blocks, even when the model
        // attached its instruction to the photo block rather than the paper.
        insetPhotos.push({ ...frame, sectionIndex: seam }, { ...frame, sectionIndex: seam + 1 });
        occupied.push({ ...frame, halfWidth: frame.halfWidth * .7, halfHeight: frame.halfHeight * .7 });
        overlays.push({ id: makeId(), type: "sticker", src: overlayPhoto!.src, alt: overlayPhoto!.alt,
          mediaType: "image", x: preferred, y: seamY, width: itemWidth, rotation: overlay.rotation,
          anchorBlockId: sections[seam].id, anchorY: 1 });
        continue;
      }
      // Photo stickers stay straight and fully visible, with room to write.
      const topPadding = section.kind === "space" ? 76 : 8;
      const availableHeight = Math.max(40, height - topPadding - 12);
      const heightFactor = Math.sin(angle) + Math.cos(angle) / ratio;
      const widthFactor = Math.cos(angle) + Math.sin(angle) / ratio;
      const itemWidth = Math.min(overlay.width, section.kind === "photo" ? 48 : 76,
        availableHeight / heightFactor / width * 100, 94 / widthFactor);
      const halfHeight = width * itemWidth / 100 * heightFactor / 2;
      const halfWidth = itemWidth * widthFactor / 2;
      const localY = clamp(height * overlay.y, topPadding + halfHeight, height - 12 - halfHeight);
      const x = clamp(overlay.x, halfWidth + 2, 98 - halfWidth);
      const frame = { sectionIndex: index, x: x / 100 * width, y: sectionTop + localY, halfWidth: halfWidth / 100 * width, halfHeight };
      insetPhotos.push(frame);
      occupied.push({ ...frame, halfWidth: frame.halfWidth * .7, halfHeight: frame.halfHeight * .7 });
      overlays.push({ id: makeId(), type: "sticker", src: overlayPhoto!.src,
        alt: overlayPhoto!.alt, mediaType: "image",
        x, y: sectionTop + localY,
        width: itemWidth, rotation: overlay.rotation, anchorBlockId: id, anchorY: localY / height });
  }
  return [...blocks, ...overlays];
}
