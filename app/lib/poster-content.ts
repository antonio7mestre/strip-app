import { normalizedFontSize } from "./font-sizing";
import { profileFontInfo, profileFontWeight } from "./profile";
import { normalizeStickerWidth } from "./sticker-sizing";
import { normalizeStickerRotation } from "./sticker-rotation";
import { posterColor, posterInk, type PosterBlock, type PosterPhoto, type PosterTile } from "./share-posters";

export const POSTER_REFERENCE_WIDTH = 390;
// A large Strip gets smaller background tiles, not missing photos or blocks.
export function posterRasterWidth(blocks: PosterBlock[]) {
  const estimatedHeight = blocks.filter(block => block.type !== "sticker")
    .reduce((sum,block) => sum + Math.max(76,block.height ?? 590),0);
  return Math.min(390,Math.max(96,Math.floor(Math.sqrt(6_000_000 * 390 / Math.max(390,estimatedHeight)))));
}

/** Same percentage width, center anchor, signed rotation and natural aspect as the editor. */
export function posterStickerGeometry(block: PosterBlock, photo: Pick<PosterPhoto,"width"|"height">) {
  const width = normalizeStickerWidth(block.width) / 100 * POSTER_REFERENCE_WIDTH;
  return {
    x: (Number.isFinite(block.x) ? block.x! : 50) / 100 * POSTER_REFERENCE_WIDTH,
    y: Number.isFinite(block.y) ? block.y! : 0,
    width, height: width * photo.height / photo.width,
    rotation: normalizeStickerRotation(block.rotation),
  };
}

/** Preserve spaces, explicit blank lines and long unbroken words like pre-wrap in the editor. */
export function posterParagraphLines(context: CanvasRenderingContext2D, content: string, width: number) {
  const lines: string[]=[];
  for (const paragraph of content.split("\n")) {
    let line="";
    for (const part of paragraph.match(/\S+|\s+/g) ?? []) {
      if (context.measureText(line+part).width<=width) { line+=part; continue; }
      if (line && !/^\s+$/.test(part)) { lines.push(line.trimEnd());line=""; }
      if (/^\s+$/.test(part)) { lines.push(line.trimEnd());line="";continue; }
      for (const letter of part) {
        if (line && context.measureText(line+letter).width>width) { lines.push(line);line=""; }
        line+=letter;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function posterTextStyle(block: PosterBlock) {
  const font=profileFontInfo(block.fontStyle ?? "sans");
  const size=Number.isFinite(block.fontSize) ? Math.max(8,block.fontSize!) : 18;
  const background=posterColor(block.backgroundColor) ?? "#3155FF";
  return { background, ink: posterColor(block.textColor) ?? posterInk(background),
    font: font.family, weight: profileFontWeight(font.id) ?? 450,
    size: normalizedFontSize(font.id,size), leading: size*1.22 };
}

export function createPosterTextTile(block: PosterBlock, index: number, top: number, rasterWidth: number): PosterTile {
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const style=posterTextStyle(block);
  // Measure at the shared mobile reference width, independent of the preview device.
  context.font=`${style.weight} ${style.size}px ${style.font}`;
  const lines=posterParagraphLines(context,block.content ?? "",POSTER_REFERENCE_WIDTH-32);
  // Sticker y coordinates refer to the authored Strip, not a fresh browser
  // reflow. Preserve published text-block geometry, as the approved gallery did.
  const measuredHeight=32+Math.max(1,lines.length)*style.leading;
  const flowHeight=Number.isFinite(block.height) && block.height!>0
    ? Math.max(32+style.leading,block.height!) : measuredHeight;
  const scale=rasterWidth/POSTER_REFERENCE_WIDTH;
  canvas.width=rasterWidth;canvas.height=Math.max(1,Math.min(8192,Math.ceil(flowHeight*scale)));
  context.scale(scale,canvas.height/flowHeight);context.fillStyle=style.background;
  context.fillRect(0,0,POSTER_REFERENCE_WIDTH,flowHeight);
  context.font=`${style.weight} ${style.size}px ${style.font}`;
  context.fillStyle=style.ink;context.textBaseline="top";
  lines.forEach((line,i)=>context.fillText(line,16,16+i*style.leading));
  return {id:block.id ?? String(index),type:"text",source:canvas,width:canvas.width,height:canvas.height,
    flowHeight,top,color:style.background};
}

export function createPosterMediaTile(block: PosterBlock, photo: PosterPhoto, index: number,
  top: number, rasterWidth: number): PosterTile {
  const naturalHeight=POSTER_REFERENCE_WIDTH*photo.height/photo.width;
  const cropped=!!(block.cropTop || block.cropBottom);
  // Cropped media uses the same stored source-height contract as resolveBlockHeightCrop.
  const sourceHeight=cropped ? Math.max(48,block.height ?? naturalHeight) : naturalHeight;
  const maxCrop=Math.max(0,sourceHeight-48);
  const cropTop=Math.min(maxCrop,Math.max(0,block.cropTop ?? 0));
  const cropBottom=Math.min(maxCrop-cropTop,Math.max(0,block.cropBottom ?? 0));
  const flowHeight=sourceHeight-cropTop-cropBottom;
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  canvas.width=rasterWidth;canvas.height=Math.max(1,Math.min(8192,Math.ceil(flowHeight*rasterWidth/POSTER_REFERENCE_WIDTH)));
  const sy=cropTop/naturalHeight*photo.height;
  const sh=Math.min(photo.height-sy,flowHeight/naturalHeight*photo.height);
  context.drawImage(photo.source,0,sy,photo.width,sh,0,0,canvas.width,canvas.height);
  return {id:block.id ?? String(index),type:block.type,source:canvas,width:canvas.width,height:canvas.height,flowHeight,top};
}

/** Decorate each intersected tile, including a sticker crossing two block boundaries. */
export function paintPosterSticker(tiles: PosterTile[], block: PosterBlock, photo: PosterPhoto) {
  const shape=posterStickerGeometry(block,photo),angle=shape.rotation*Math.PI/180;
  const radius=(Math.abs(shape.width*Math.sin(angle))+Math.abs(shape.height*Math.cos(angle)))/2;
  for (const tile of tiles) {
    if (shape.y+radius<tile.top || shape.y-radius>tile.top+tile.flowHeight) continue;
    const context=(tile.source as HTMLCanvasElement).getContext("2d");
    if (!context) continue;
    context.save();context.setTransform(tile.width/POSTER_REFERENCE_WIDTH,0,0,tile.height/tile.flowHeight,0,0);
    context.translate(shape.x,shape.y-tile.top);context.rotate(angle);
    // No added outline or shadow. Alpha in cutouts, tape and frame holes remains intact.
    context.drawImage(photo.source,0,0,photo.width,photo.height,-shape.width/2,-shape.height/2,shape.width,shape.height);
    context.restore();
  }
}
