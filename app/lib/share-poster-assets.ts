import { STORY_WIDTH, STORY_HEIGHT, posterColor, posterInk, posterPalette, type PosterAssets, type PosterPhoto, type PosterStrip, type PosterTile } from "./share-posters";
import { blurPosterPixels } from "./poster-blur";
import { profileFontInfo, profileFontWeight } from "./profile";
import { fontVisualScale } from "./font-sizing";
import { createPosterMediaTile, createPosterTextTile, paintPosterSticker, posterRasterWidth } from "./poster-content";

const cancelled = () => new DOMException("Cancelled", "AbortError");
function free(photo: PosterPhoto | null | undefined) {
  if (photo?.source instanceof HTMLCanvasElement) { photo.source.width=0;photo.source.height=0; }
}

/** Only a bounded, decoded image or first video frame survives the media request. */
function readMedia(src: string, video: boolean, signal: AbortSignal, limit = 900): Promise<PosterPhoto | null> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(null);return; }
    const media=video ? document.createElement("video") : new Image();
    media.crossOrigin="anonymous";
    if (media instanceof HTMLVideoElement) { media.preload="auto";media.muted=true;media.playsInline=true; }
    else media.decoding="async";
    let settled=false;
    const finish=(photo: PosterPhoto | null) => {
      if (settled) { free(photo);return; } settled=true;
      clearTimeout(timeout);signal.removeEventListener("abort",cancel);
      media.removeEventListener(video?"loadeddata":"load",loaded);media.removeEventListener("error",cancel);
      if (media instanceof HTMLVideoElement) { media.pause();media.removeAttribute("src");media.load(); }
      else media.src="";
      resolve(photo);
    };
    const cancel=()=>finish(null);
    const loaded=()=>{
      const width=media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const height=media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      if (!width || !height) { finish(null);return; }
      const canvas=document.createElement("canvas"),scale=Math.min(1,limit/Math.max(width,height));
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      const context=canvas.getContext("2d");
      if (!context) { free({source:canvas,width:canvas.width,height:canvas.height});finish(null);return; }
      try {
        context.drawImage(media,0,0,canvas.width,canvas.height);
        // Detect a tainted remote source before preparing a poster that cannot save.
        context.getImageData(0,0,1,1);
        finish({source:canvas,width:canvas.width,height:canvas.height});
      } catch { free({source:canvas,width:canvas.width,height:canvas.height});finish(null); }
    };
    const timeout=setTimeout(cancel,10000);
    signal.addEventListener("abort",cancel,{once:true});
    media.addEventListener(video?"loadeddata":"load",loaded,{once:true});
    media.addEventListener("error",cancel,{once:true});
    media.src=src;
  });
}

export async function preparePosterAssets(strip: PosterStrip, signal: AbortSignal): Promise<PosterAssets> {
  const font=profileFontInfo(strip.profileFont),tiles: PosterTile[]=[];
  const background=posterColor(strip.profileBackground) ?? posterPalette(strip)[0] ?? "#3155FF";
  const ink=posterColor(strip.profileTextColor) ?? posterInk(background);
  const assets: PosterAssets={
    title:(strip.title || "").trim(),address:strip.username ? `${strip.username}.striiip.com` : "striiip.com",
    palette:posterPalette(strip),photos:[],tiles,cover:null,
    coverColor:posterColor(strip.cover.color) ?? background,
    coverRatio:strip.cover.shape==="portrait" ? 4/3 : strip.cover.shape==="landscape" ? 3/4 : 1,
    theme:{background,ink,font:font.family,weight:profileFontWeight(font.id) ?? 500,scale:fontVisualScale(font.id,"title")},
  };
  let active: PosterPhoto | null=null;
  try {
    // Wait for exactly the profile and block fonts used here, not the entire catalog.
    const fontIds=new Set([font.id,...strip.blocks.filter(b=>b.type==="text").map(b=>profileFontInfo(b.fontStyle).id)]);
    if (document.fonts) await Promise.all([...fontIds].map(id=>{
      const face=profileFontInfo(id);
      return document.fonts.load(`${profileFontWeight(id) ?? 450} 24px ${face.family}`);
    }));
    if (signal.aborted) throw cancelled();
    if (strip.cover.kind==="image" && strip.cover.src) {
      assets.cover=await readMedia(strip.cover.src,false,signal,1600);
      if (!assets.cover) throw signal.aborted ? cancelled() : new Error("Cover unavailable");
      assets.photos=[assets.cover];
    }
    const rasterWidth=posterRasterWidth(strip.blocks);let top=0;
    // Decode sequentially. A long Strip must not hold all full-size originals in memory.
    for (const [index,block] of strip.blocks.entries()) {
      if (signal.aborted) throw cancelled();
      if (block.type==="sticker") continue;
      let tile: PosterTile;
      if (block.type==="text") tile=createPosterTextTile(block,index,top,rasterWidth);
      else {
        if (!block.src) throw new Error("Media source missing");
        active=await readMedia(block.src,block.type==="video",signal);
        if (!active) throw signal.aborted ? cancelled() : new Error("Photo unavailable");
        tile=createPosterMediaTile(block,active,index,top,rasterWidth);free(active);active=null;
      }
      tiles.push(tile);top+=tile.flowHeight;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    // Keep authored order, fractional widths, rotation, and alpha. Not a photo pile.
    for (const block of strip.blocks) {
      if (block.type!=="sticker" || !block.src) continue;
      if (signal.aborted) throw cancelled();
      active=await readMedia(block.src,block.mediaType==="video",signal);
      if (!active) throw signal.aborted ? cancelled() : new Error("Sticker unavailable");
      paintPosterSticker(tiles,block,active);free(active);active=null;
    }
    if (signal.aborted) throw cancelled();
    const flow=document.createElement("canvas");flow.width=rasterWidth;
    flow.height=Math.max(1,Math.min(8192,Math.ceil(top*rasterWidth/390)));
    const context=flow.getContext("2d");
    if (!context) { flow.width=0;flow.height=0;throw new Error("Canvas unavailable"); }
    context.fillStyle=background;context.fillRect(0,0,flow.width,flow.height);
    if (top) for (const tile of tiles) {
      context.drawImage(tile.source,0,0,tile.width,tile.height,0,tile.top/top*flow.height,
        flow.width,tile.flowHeight/top*flow.height+1);
    }
    assets.flow={source:flow,width:flow.width,height:flow.height};
    // Preserve the approved overscan and 28px softness, independently of Safari's
    // canvas filter implementation. Preview and PNG reuse this exact same raster.
    const soft=document.createElement("canvas");
    soft.width=STORY_WIDTH/4;soft.height=STORY_HEIGHT/4;
    assets.softBackground={source:soft,width:soft.width,height:soft.height};
    const softContext=soft.getContext("2d");
    if (!softContext) throw new Error("Canvas unavailable");
    softContext.fillStyle=background;softContext.fillRect(0,0,soft.width,soft.height);
    softContext.drawImage(flow,0,0,flow.width,flow.height,-45/4,-45/4,1170/4,2010/4);
    const pixels=softContext.getImageData(0,0,soft.width,soft.height);
    blurPosterPixels(pixels.data,soft.width,soft.height,28/4);
    softContext.putImageData(pixels,0,0);
    return assets;
  } catch (error) { free(active);disposePosterAssets(assets);throw error; }
}

export function disposePosterAssets(assets: PosterAssets) {
  const sources=new Set([assets.cover,assets.flow,assets.softBackground,...assets.photos,...(assets.tiles ?? [])].filter(Boolean));
  for (const photo of sources) free(photo);
}
