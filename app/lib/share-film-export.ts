import { filmColor, filmMediaSources, filmPalette, filmSeed, renderShareFilm, SHARE_FILM, type FilmTile, type ShareFilmAssets, type ShareFilmStrip } from "./share-film";

const abortError = () => new DOMException("Video preparation cancelled", "AbortError");
function check(signal: AbortSignal) { if (signal.aborted) throw abortError(); }

/** Native codec promises can stall on Safari. Never strand the share page. */
function encodingStep<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  check(signal);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(undefined, new Error("Video encoder timed out")), 8000);
    const abort = () => finish(undefined, abortError());
    const finish = (value?: T, error?: unknown) => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value as T);
    };
    signal.addEventListener("abort", abort, { once: true });
    work.then(value => finish(value), error => finish(undefined, error));
  });
}

function snapshot(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 760 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context || !width || !height) throw new Error("Media cannot be drawn");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  // Verify origin cleanliness now, not after rendering a whole movie.
  context.getImageData(0, 0, 1, 1);
  return canvas;
}

function loadMedia(src: string, video: boolean, signal: AbortSignal): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    check(signal);
    const media = video ? document.createElement("video") : new Image();
    let done = false;
    const finish = (image?: HTMLCanvasElement, error?: unknown) => {
      if (done) return; done = true;
      window.clearTimeout(timeout); signal.removeEventListener("abort", abort);
      media.onload = null; media.onerror = null;
      if (media instanceof HTMLVideoElement) {
        media.onloadedmetadata = null; media.onloadeddata = null; media.onseeked = null; media.pause(); media.removeAttribute("src"); media.load();
      } else media.src = "";
      if (image) resolve(image); else reject(error || new Error("Media unavailable"));
    };
    const abort = () => finish(undefined, abortError());
    const timeout = window.setTimeout(() => finish(undefined, new Error("Media timed out")), 12000);
    const capture = () => {
      try {
        const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
        const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
        finish(snapshot(media, width, height));
      } catch (error) { finish(undefined, error); }
    };
    media.crossOrigin = "anonymous";
    media.onerror = () => finish();
    signal.addEventListener("abort", abort, { once: true });
    if (media instanceof HTMLVideoElement) {
      media.muted = true; media.playsInline = true; media.preload = "auto";
      media.onloadedmetadata = () => {
        // A representative video frame participates in the same collage as photos.
        // Seek from metadata: iOS may not decode a detached video's first frame
        // until it has been asked for a time, even with preload="auto".
        media.onseeked = capture;
        media.currentTime = Math.min(0.5, media.duration > 0 ? media.duration / 2 : 0.01);
      };
      media.onloadeddata = () => { if (!media.seeking && media.currentTime > 0) capture(); };
    } else { media.decoding = "async"; media.onload = capture; }
    media.src = src;
    if (media instanceof HTMLVideoElement) media.load();
  });
}

function sampledColors(images: HTMLCanvasElement[]) {
  const colors: string[] = [];
  for (const image of images.slice(0, 6)) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 12;
    const c = canvas.getContext("2d", { willReadFrequently: true }); if (!c) continue;
    c.drawImage(image, 0, 0, 12, 12);
    const pixels = c.getImageData(0, 0, 12, 12).data;
    let best = -1, color = "#FFFFFF";
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const max = Math.max(...rgb), min = Math.min(...rgb), light = (max + min) / 2;
      const score = max - min - Math.abs(light - 145) * 0.5;
      if (score > best && pixels[i + 3] > 200) { best = score; color = "#" + rgb.map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase(); }
    }
    colors.push(color);
  }
  return [...new Set(colors)];
}

export async function prepareShareFilm(strip: ShareFilmStrip, signal: AbortSignal): Promise<ShareFilmAssets> {
  check(signal);
  const sources = filmMediaSources(strip), loaded: (HTMLCanvasElement | undefined)[] = new Array(sources.length);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
      while (next < sources.length) {
        const index = next++;
        try { loaded[index] = await loadMedia(sources[index].src, sources[index].video, signal); }
        catch (error) { check(signal); if (error instanceof DOMException && error.name === "AbortError") throw error; }
      }
    }));
  } catch (error) {
    for (const image of loaded) if (image) image.width = image.height = 1;
    throw error;
  }
  check(signal);
  const images = loaded.filter((x): x is HTMLCanvasElement => !!x);
  let palette = filmPalette(strip);
  if (!palette.length || palette.every(c => /^#(?:000000|FFFFFF)$/i.test(c))) palette = [...sampledColors(images), ...palette];
  if (!palette.length) palette = ["#FFFFFF"];
  const tiles: FilmTile[] = images.map(image => ({ image, color: palette[0] }));
  for (const block of strip.blocks) {
    if (block.type === "text") tiles.push({ color: filmColor(block.backgroundColor) || "#3155FF", text: block.content, ink: filmColor(block.textColor) || "#FFFFFF" });
  }
  if (strip.cover.kind === "color") tiles.push({ color: filmColor(strip.cover.color) || palette[0] });
  if (!tiles.length) tiles.push({ color: palette[0], text: strip.title || "STRIP", ink: "#111410" });
  return { tiles, palette, title: strip.title.trim() || "this strip", byline: strip.username ? `${strip.username}.striiip.com` : "striiip.com", seed: filmSeed(strip.id) };
}

export function disposeShareFilm(assets: ShareFilmAssets) {
  for (const tile of assets.tiles) if (tile.image instanceof HTMLCanvasElement) tile.image.width = tile.image.height = 1;
}

/** Offline, timestamped H.264 frames. The preview and export share one renderer. */
export async function exportShareFilm(assets: ShareFilmAssets, signal: AbortSignal, progress: (value: number) => void) {
  check(signal);
  const { Output, BufferTarget, CanvasSource, Mp4OutputFormat, canEncodeVideo } = await import("mediabunny");
  check(signal);
  const canvas = document.createElement("canvas"); canvas.width = SHARE_FILM.width; canvas.height = SHARE_FILM.height;
  const c = canvas.getContext("2d", { alpha: false }); if (!c) throw new Error("Video canvas unavailable");
  const config = { width: canvas.width, height: canvas.height, bitrate: 4_000_000, frameRate: SHARE_FILM.fps };
  let supported = false;
  try { supported = await encodingStep(canEncodeVideo("avc", config), signal); } catch { check(signal); }
  if (!supported) return recordShareFilm(canvas, c, assets, signal, progress);
  check(signal);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: "avc", bitrate: config.bitrate, keyFrameInterval: 2,
    onEncoderConfig: encoder => {
      // Square pixels need no display-size override. Keep native codec
      // configuration minimal across browsers.
      if (encoder.displayWidth === encoder.width && encoder.displayHeight === encoder.height) {
        delete encoder.displayWidth; delete encoder.displayHeight;
      }
    },
  });
  output.addVideoTrack(source, { frameRate: SHARE_FILM.fps });
  const abort = () => { if (output.state !== "finalized" && output.state !== "canceled") void output.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await encodingStep(output.start(), signal);
    const count = Math.ceil(SHARE_FILM.duration * SHARE_FILM.fps);
    for (let frame = 0; frame < count; frame++) {
      check(signal);
      const time = frame / SHARE_FILM.fps;
      renderShareFilm(c, assets, time);
      await encodingStep(source.add(time, Math.min(1 / SHARE_FILM.fps, SHARE_FILM.duration - time)), signal);
      if (frame % 10 === 0) {
        progress(Math.min(99, Math.floor((frame + 1) / count * 100)));
        // Yield to Back, scrolling and the live preview, including fast hardware encoders.
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
      }
    }
    check(signal); await encodingStep(output.finalize(), signal); check(signal);
    const buffer = output.target.buffer;
    if (!buffer?.byteLength) throw new Error("Video export was empty");
    progress(100); return new Blob([buffer], { type: "video/mp4" });
  } catch (error) {
    abort();
    check(signal);
    // Use a separate canvas so an eventually-resolved native call cannot race
    // the realtime fallback. Cancellation is deliberately not another await.
    if (error instanceof Error) {
      const fallback = document.createElement("canvas"); fallback.width = SHARE_FILM.width; fallback.height = SHARE_FILM.height;
      const context = fallback.getContext("2d", { alpha: false }); if (!context) throw error;
      return await recordShareFilm(fallback, context, assets, signal, progress);
    }
    throw error;
  } finally { signal.removeEventListener("abort", abort); canvas.width = canvas.height = 1; }
}

function recordShareFilm(canvas: HTMLCanvasElement, c: Context, assets: ShareFilmAssets, signal: AbortSignal, progress: (value: number) => void): Promise<Blob> {
  check(signal);
  const mime = typeof MediaRecorder === "undefined" ? undefined : ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
  if (!mime || !canvas.captureStream) throw new Error("Video export needs a newer Safari or Chrome.");
  return new Promise((resolve, reject) => {
    renderShareFilm(c, assets, 0);
    const stream = canvas.captureStream(SHARE_FILM.fps);
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 }); }
    catch (error) { stream.getTracks().forEach(t => t.stop()); reject(error); return; }
    const chunks: Blob[] = []; let frame = 0, done = false;
    const finish = (error?: unknown) => {
      if (done) return; done = true; cancelAnimationFrame(frame); clearTimeout(timeout);
      signal.removeEventListener("abort", abort); document.removeEventListener("visibilitychange", hidden);
      recorder.onstop = null; recorder.onerror = null; recorder.ondataavailable = null;
      if (recorder.state !== "inactive") recorder.stop(); stream.getTracks().forEach(t => t.stop());
      canvas.width = canvas.height = 1;
      if (error) reject(error); else {
        const blob = new Blob(chunks, { type: recorder.mimeType || mime });
        if (!blob.size) reject(new Error("Video export was empty")); else { progress(100); resolve(blob); }
      }
    };
    const abort = () => finish(abortError());
    const hidden = () => { if (document.hidden) finish(new Error("Keep this page open while the video is prepared. Tap Retry.")); };
    const timeout = window.setTimeout(() => finish(new Error("Video export timed out. Tap Retry.")), 60000);
    signal.addEventListener("abort", abort, { once: true }); document.addEventListener("visibilitychange", hidden);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => finish(new Error("Couldn’t export this video."));
    recorder.onstop = () => finish();
    const start = performance.now();
    const tick = () => {
      if (done) return;
      const time = Math.min(SHARE_FILM.duration, (performance.now() - start) / 1000);
      renderShareFilm(c, assets, time); progress(Math.min(99, Math.floor(time / SHARE_FILM.duration * 100)));
      if (time >= SHARE_FILM.duration) recorder.stop(); else frame = requestAnimationFrame(tick);
    };
    recorder.start(); frame = requestAnimationFrame(tick);
  });
}
type Context = CanvasRenderingContext2D;
