"use client";

import { createContext, useContext, useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode, type RefObject } from "react";
import { getReaderPreviewSrc, getReaderUpgradeSrc } from "@/app/lib/reader-image";
import { createReaderMediaQueue } from "@/app/lib/reader-media-queue";
import { readerMediaPriority, readerVideoProximity } from "@/app/lib/reader-viewport";
import { readerImageBacking } from "@/app/lib/reader-image-paint";

type Queue = ReturnType<typeof createReaderMediaQueue>;
const ReaderMediaContext = createContext<{ upgrades: Queue; frames: Queue; revealed: boolean; restored: boolean; required: string[]; originals: boolean } | null>(null);

export function ReaderMediaProvider({ revealed, required, children, restored = false, originals = false, onUpgradesComplete }: { revealed: boolean; required: string[]; children: ReactNode; restored?: boolean; originals?: boolean; onUpgradesComplete?: () => void }) {
  const idleCallback = useRef(onUpgradesComplete);
  const revealedRef = useRef(revealed);
  const queueRef = useRef<{ upgrades: Queue; frames: Queue } | null>(null);
  useEffect(() => { idleCallback.current = onUpgradesComplete; }, [onUpgradesComplete]);
  const [queues] = useState(() => {
    const idle = () => {
      if (revealedRef.current && queueRef.current?.upgrades.idle && queueRef.current.frames.idle) idleCallback.current?.();
    };
    return { upgrades: createReaderMediaQueue(2, false, idle), frames: createReaderMediaQueue(2, true, idle) };
  });
  useEffect(() => { queueRef.current = queues; revealedRef.current = revealed; queues.upgrades.setEnabled(revealed); }, [queues, revealed]);
  // Child registrations own cancellation, including React's effect replay.
  return <ReaderMediaContext.Provider value={{ ...queues, revealed, restored, required, originals }}>{children}</ReaderMediaContext.Provider>;
}

/** One stable image element: replace decoded preview pixels only after a full
 * image has decoded offscreen. Blob URLs avoid a second network request. */
export function ReaderImage({ src = "", srcSet, sizes, onLoad, onError, onSettled, style, blockId = "", ...props }:
  Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string; blockId?: string; onSettled?: (loaded: boolean) => void }) {
  const scope = useContext(ReaderMediaContext);
  const reader = scope?.restored ? null : scope;
  const element = useRef<HTMLImageElement>(null);
  const [wasRequired, setWasRequired] = useState(false);
  const [wasAttached, setWasAttached] = useState(false);
  const required = wasRequired || Boolean(reader?.required.includes(blockId));
  useEffect(() => { if (required) setWasRequired(true); }, [required]);
  const attached = wasAttached || !reader || required || reader.revealed;
  useEffect(() => { if (attached) setWasAttached(true); }, [attached]);
  const preview = reader && !required ? getReaderPreviewSrc(src) : src;
  const progressive = preview !== src;
  const [fallback, setFallback] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [ratio, setRatio] = useState<string>();
  const [backing, setBacking] = useState<string>();
  const retainedImages = useRef<HTMLImageElement[]>([]);
  const retainedUrls = useRef<string[]>([]);
  useEffect(() => () => {
    retainedUrls.current.forEach(url => URL.revokeObjectURL(url));
    retainedUrls.current = [];
    retainedImages.current = [];
  }, [src]);
  useEffect(() => {
    if (!reader || !progressive || fallback) return;
    let blobUrl: string | undefined, alive = true;
    const cancel = reader.upgrades.add(() => element.current ? readerMediaPriority(element.current.getBoundingClientRect(), window.innerHeight) : Infinity, async signal => {
      const image = element.current;
      if (!image || signal.aborted) return;
      // The editor always ends on the authored original. Only the loading
      // schedule is shared; saved media and export quality are untouched.
      const source = reader.originals ? src : getReaderUpgradeSrc(src, image.getBoundingClientRect().width, window.devicePixelRatio);
      const deadline = new AbortController();
      const abort = () => deadline.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, 15000);
      try {
        // Register before reveal so small, late-page previews cannot jump the
        // top of the queue or start unrelated landing-page prefetching early.
        await Promise.race([image.decode(), new Promise<never>((_, reject) => {
          deadline.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        })]);
        if (deadline.signal.aborted || !alive) return;
        const response = await fetch(source, { signal: deadline.signal, priority: "low" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (deadline.signal.aborted || !alive) return;
        blobUrl = URL.createObjectURL(blob);
        retainedUrls.current.push(blobUrl);
        const decoded = new Image();
        decoded.src = blobUrl;
        await decoded.decode();
        if (alive && !signal.aborted) {
          retainedImages.current.push(decoded);
          setFull(blobUrl);
        }
      } finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
    });
    // Queue eligibility can change without replacing this image. A displayed
    // blob belongs to the mounted image, not to an individual queue attempt.
    return () => { alive = false; cancel(); };
  }, [reader?.upgrades, reader?.originals, progressive, fallback, src]);
  return <img {...props} ref={element} src={attached ? full ?? (fallback ? src : preview) : undefined}
    srcSet={attached && !full && (!progressive || fallback) ? srcSet : undefined} sizes={attached && !full && (!progressive || fallback) ? sizes : undefined}
    fetchPriority={required ? "high" : "low"}
    loading="eager" decoding="sync"
    data-reader-quality={!attached ? "pending" : progressive && !full && !fallback ? "preview" : "full"}
    style={{ ...style, ...(ratio && progressive ? { aspectRatio: ratio } : {}),
      ...(backing ? { backgroundImage: `url("${backing}")`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" } : {}) }}
    onLoad={event => {
      const image = event.currentTarget;
      if (!ratio && image.naturalWidth && image.naturalHeight) setRatio(`${image.naturalWidth} / ${image.naturalHeight}`);
      if (!backing && !reader?.originals && image.closest(".image-block")) setBacking(readerImageBacking(image));
      void image.decode().then(() => onSettled?.(true), () => onSettled?.(false));
      onLoad?.(event);
    }}
    onError={event => {
      if (full && backing) { setFull(null); return; }
      if (progressive && !fallback && !full) { setFallback(true); return; }
      onError?.(event);
      onSettled?.(false);
    }} />;
}

/** First-frame preparation is limited to two decoders. Muted preparation stops
 * after a decoded frame; continuous playback only starts near the viewport. */
export function useReaderVideo(videoRef: RefObject<HTMLVideoElement | null>, src: string, blockId: string) {
  const scope = useContext(ReaderMediaContext);
  const reader = scope?.restored ? null : scope;
  const [attached, setAttached] = useState(false);
  const [frameSettled, setFrameSettled] = useState(false);
  const [near, setNear] = useState(false);
  const [warming, setWarming] = useState(false);
  const eligible = Boolean(reader && (reader.revealed || reader.required.includes(blockId)));
  useEffect(() => {
    const video = videoRef.current;
    if (!reader || !video || !eligible) return;
    return reader.frames.add(() => readerMediaPriority(video.getBoundingClientRect(), window.innerHeight), signal => new Promise<void>(resolve => {
      if (signal.aborted) { resolve(); return; }
      const done = () => {
        // Errors/timeouts also end the preparation attempt. A late frame must
        // not leave an offscreen video playing after its queue slot is released.
        if (!signal.aborted) setFrameSettled(true);
        clearTimeout(timeout);
        video.removeEventListener("loadeddata", done); video.removeEventListener("error", done);
        signal.removeEventListener("abort", done); resolve();
      };
      const timeout = window.setTimeout(done, 8000);
      video.addEventListener("loadeddata", done); video.addEventListener("error", done);
      signal.addEventListener("abort", done, { once: true });
      setAttached(true);
      if (video.readyState >= 2) done();
    }));
  }, [reader?.frames, eligible, src, videoRef]);
  // Prime upcoming playback two screens ahead. A fast scroll can bypass a
  // stalled distant decoder instead of waiting for its eight-second fallback.
  useEffect(() => {
    if (reader?.revealed && warming) setAttached(true);
  }, [reader?.revealed, warming]);
  useEffect(() => {
    const video = videoRef.current;
    if (!reader || !video) return;
    // Root overflow clipping can truncate IntersectionObserver's rootMargin.
    // Measure the real page geometry so the look-ahead works on both Safari and
    // Chromium, including a fast jump past still-loading blocks.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const proximity = readerVideoProximity(video.getBoundingClientRect(), window.visualViewport?.height ?? window.innerHeight);
      setNear(proximity.near); setWarming(proximity.warming);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(video);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [Boolean(reader), reader?.revealed, src, videoRef]);
  const playing = Boolean(reader?.revealed && near && attached);
  useEffect(() => {
    const video = videoRef.current;
    if (!reader || !video) return;
    // Safari can ignore preload for a hidden video. A bounded, muted play
    // request decodes its first frame without seeking; loadeddata then pauses
    // it unless the revealed viewport is actually showing it.
    if (playing || (attached && !frameSettled && video.muted)) void video.play().catch(() => {});
    else video.pause();
  }, [Boolean(reader), playing, attached, frameSettled, src, videoRef]);
  return {
    active: Boolean(reader), attached, playing,
    // Let the bounded decoder queue request a real first frame. Seeking at
    // loadedmetadata can leave iOS in a permanent seeking state: pixels play
    // once, but the media clock never advances and native looping cannot run.
    preload: (attached && !frameSettled) || (reader?.revealed && (warming || playing)) ? "auto" as const : "metadata" as const,
  };
}
