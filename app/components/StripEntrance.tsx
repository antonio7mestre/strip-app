"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { entranceLoadPercent, makeEntrancePalette, sampleEntranceMedia, startEntranceCounter } from "@/app/lib/strip-entrance";
import { chooseScribbleColor, installScribbleSurface } from "@/app/lib/scribble-entrance";
import { COVER_MOVE_MS, DIRECT_STICKER_SETTLE_MS, COVER_PROGRESS_CELLS, coverEntranceLayout, coverProgressCells, dropCoverDock, fadeCoverEntrance, fadeInCover, watchCoverImage, stickerAspectRatio, stickerLiftKeyframes, type CoverOrigin, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { startStickerFlight, STICKER_RELEASE, STICKER_LAND, HOME_STICKER_MOTION } from "@/app/lib/sticker-flight";
import { stickerDate, markerDateStrokes, paintStickerDate } from "@/app/lib/sticker-date";

type Cover = { kind: "image"; src: string; alt?: string; aspectRatio?: number }
  | { kind: "color"; color: string; shape?: "portrait" | "square" | "landscape" };
type PaletteBlock = { type: string; backgroundColor?: string; textColor?: string };

export function StripEntrance({ cover, blocks, endingStyle, mediaReady, settledAssets, totalAssets,
  revealing, requestPending = false, origin, dock, publishedAt, onCoverSettled, onExitComplete,
}: {
  cover: Cover; blocks: PaletteBlock[];
  endingStyle: { backgroundColor: string; buttonColor: string };
  mediaReady: boolean; settledAssets: number; totalAssets: number; revealing: boolean;
  requestPending?: boolean; origin?: CoverOrigin; dock?: CoverDockOrigin;
  publishedAt?: number;
  onCoverSettled: () => void; onExitComplete: () => void;
}) {
  const coverRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [initialOrigin] = useState(origin);
  const [initialDock] = useState(dock);
  const [peelSide] = useState(() => origin && origin.left + origin.width / 2 < window.innerWidth / 2 ? -1 : 1);
  const date = stickerDate(publishedAt);
  const dateStrokes = markerDateStrokes(date);
  const [centered, setCentered] = useState(false);
  const [dockDropped, setDockDropped] = useState(!dock);
  const [coverReady, setCoverReady] = useState(cover.kind === "color");
  const [coverVisible, setCoverVisible] = useState(Boolean(origin));
  const [coverFailed, setCoverFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(() => origin ? origin.width / origin.height
    : stickerAspectRatio(cover.kind === "image" ? cover.aspectRatio ?? 1
      : cover.shape === "portrait" ? 4 / 5 : cover.shape === "landscape" ? 3 / 2 : 1));
  const [sampledColors, setSampledColors] = useState<string[]>([]);
  const [paletteSampled, setPaletteSampled] = useState(false);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [ink, setInk] = useState<string | null>(null);
  const mounted = useRef(false);
  const settledCallback = useRef(onCoverSettled);
  const completeCallback = useRef(onExitComplete);
  useLayoutEffect(() => {
    settledCallback.current = onCoverSettled;
    completeCallback.current = onExitComplete;
  }, [onCoverSettled, onExitComplete]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Keep one surface across the home-to-reader handoff, including safe areas.
  useLayoutEffect(() => {
    const host = surfaceRef.current;
    if (!host) return;
    const removeSurface = installScribbleSurface(host);
    const theme = document.getElementById("strip-theme-color");
    const name = theme?.getAttribute("name");
    if (name) theme?.removeAttribute("name");
    document.documentElement.classList.add("cover-entrance-active");
    return () => {
      removeSurface();
      document.documentElement.classList.remove("cover-entrance-active");
      if (name && !theme?.hasAttribute("name")) theme?.setAttribute("name", name);
    };
  }, []);

  useLayoutEffect(() => {
    if (!surfaceRef.current || !dockRef.current || !initialDock) return;
    return dropCoverDock(surfaceRef.current, dockRef.current, initialDock, () => setDockDropped(true));
  }, [initialDock]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sync = () => {
      const viewport = window.visualViewport;
      const layout = coverEntranceLayout(window.innerWidth, viewport?.height ?? window.innerHeight,
        viewport?.offsetTop ?? 0, aspectRatio);
      Object.assign(stage.style, { left: layout.left + "px", top: layout.top + "px",
        width: layout.width + "px", height: layout.height + "px" });
    };
    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [aspectRatio]);

  useLayoutEffect(() => {
    const canvas = snapshotRef.current, image = initialOrigin?.image;
    if (!canvas || !image?.naturalWidth) return;
    canvas.width = Math.min(1024, image.naturalWidth);
    canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [initialOrigin]);

  useLayoutEffect(() => {
    const visual = visualRef.current;
    if (!initialOrigin || !visual) return;
    const target = visual.getBoundingClientRect();
    if (!visual.animate || !target.width || !target.height) { setCentered(true); return; }
    const animation = visual.animate([
      { transform: `translate3d(${initialOrigin.left - target.left}px, ${initialOrigin.top - target.top}px, 0) scale(${initialOrigin.width / target.width}, ${initialOrigin.height / target.height})` },
      { offset: STICKER_RELEASE, transform: `translate3d(${initialOrigin.left - target.left}px, ${initialOrigin.top - target.top}px, 0) scale(${initialOrigin.width / target.width}, ${initialOrigin.height / target.height})`, easing: "cubic-bezier(0.3, 0.1, 0.2, 1)" },
      { offset: STICKER_LAND, transform: "translate3d(0, 0, 0) scale(1, 1)" },
      { transform: "translate3d(0, 0, 0) scale(1, 1)" },
    ], { duration: COVER_MOVE_MS, easing: "linear", fill: "both" });
    const side = peelSide;
    const lift = stickerRef.current?.animate(stickerLiftKeyframes(side, HOME_STICKER_MOTION), {
      duration: COVER_MOVE_MS, easing: "linear", fill: "both",
    });
    // Keep the original cover pinned until the flexible material is painted.
    // The rest of home and its tray still start leaving immediately on click.
    animation.pause(); animation.currentTime = 0;
    if (lift) { lift.pause(); lift.currentTime = 0; }
    const beginMotion = () => {
      // Safari's timeline can still hold the previous frame after compiling
      // the material. Use now so the first peel frame is never skipped.
      const started = performance.now();
      animation.play(); animation.startTime = started;
      if (lift) { lift.play(); lift.startTime = started; }
      return started;
    };
    const stopFlight = canvasRef.current ? startStickerFlight(canvasRef.current, {
      image: initialOrigin.image ?? coverRef.current, color: cover.kind === "color" ? cover.color : "#000000",
      width: target.width, height: target.height, side,
      motionStrength: HOME_STICKER_MOTION,
      onReady: beginMotion, duration: COVER_MOVE_MS,
      paintDate: (context, width, height) => paintStickerDate(context, date, width, height, side),
    }) : undefined;
    if (!canvasRef.current) beginMotion();
    animation.onfinish = () => {
      // Reveal the loading bar on arrival, without another render-frame delay.
      if (mounted.current) flushSync(() => setCentered(true));
      animation.cancel();
      lift?.cancel();
      stopFlight?.();
    };
    return () => { animation.onfinish = null; animation.cancel(); lift?.cancel(); stopFlight?.(); };
    // The flight owns the original home cover through the reader handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrigin]);

  const coverSrc = cover.kind === "image" ? cover.src : null;
  useLayoutEffect(() => {
    const image = coverRef.current;
    if (!image) return;
    return watchCoverImage(image, () => {
      if (!mounted.current) return;
      if (!initialOrigin && image.naturalWidth && image.naturalHeight) setAspectRatio(stickerAspectRatio(image.naturalWidth / image.naturalHeight));
      setSampledColors(sampleEntranceMedia(image));
      setPaletteSampled(true);
      setCoverReady(true);
      settledCallback.current();
    }, () => {
      setCoverFailed(true);
      setPaletteSampled(true);
      setCoverReady(true);
      settledCallback.current();
    });
  }, [coverSrc, initialOrigin]);

  // Retain the reader's existing timeout recovery if a cover request never settles.
  const coverUnavailable = coverFailed || (!initialOrigin && revealing && !coverReady);
  const coverReadyToAppear = coverReady || coverUnavailable;

  useLayoutEffect(() => {
    if (initialOrigin || !coverReadyToAppear || !visualRef.current) return;
    const visual = visualRef.current, canvas = canvasRef.current;
    const settle = () => {
      if (!mounted.current) return;
      visual.style.opacity = "1";
      flushSync(() => { setCentered(true); setCoverVisible(true); });
    };
    if (!canvas || !visual.animate) return fadeInCover(visual, settle);
    // A URL/reload has no home card to peel off. Bring in the very same
    // flexible sticker with only a small corner lifted, then gently press it down.
    const landing = visual.animate([
      { opacity: 0, transform: "translate(8px, -12px) scale(.9)" },
      { offset: .16, opacity: 1 },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ], { duration: DIRECT_STICKER_SETTLE_MS, easing: "ease-out", fill: "both" });
    const lift = stickerRef.current?.animate(stickerLiftKeyframes(peelSide).slice(36)
      .map(frame => ({ ...frame, offset: Math.max(0, Math.min(1, (Number(frame.offset) - .9) / .1)) })),
      { duration: DIRECT_STICKER_SETTLE_MS, easing: "linear", fill: "both" });
    landing.pause(); landing.currentTime = 0;
    if (lift) { lift.pause(); lift.currentTime = 0; }
    const target = visual.getBoundingClientRect();
    // Read untransformed dimensions, since the suspended landing is scaled.
    const size = getComputedStyle(visual);
    const width = parseFloat(size.width) || target.width, height = parseFloat(size.height) || target.height;
    const face = visual.querySelector<HTMLElement>(".strip-entrance-cover-face");
    const stopFlight = startStickerFlight(canvas, {
      image: coverUnavailable ? null : coverRef.current,
      color: face ? getComputedStyle(face).backgroundColor : "#000000",
      width, height, side: peelSide, phaseStart: .9, duration: DIRECT_STICKER_SETTLE_MS,
      onReady: () => {
        const started = performance.now();
        landing.play(); landing.startTime = started;
        if (lift) { lift.play(); lift.startTime = started; }
        return started;
      },
      paintDate: (context, w, h) => paintStickerDate(context, date, w, h, peelSide),
    });
    landing.onfinish = () => { settle(); landing.cancel(); lift?.cancel(); stopFlight(); };
    return () => { landing.onfinish = null; landing.cancel(); lift?.cancel(); stopFlight(); };
  }, [initialOrigin, coverReadyToAppear, coverUnavailable, date, peelSide]);

  const counterRef = useRef<ReturnType<typeof startEntranceCounter> | null>(null);
  useLayoutEffect(() => {
    const counter = startEntranceCounter(setDisplayPercent);
    counterRef.current = counter;
    return () => { counter.dispose(); counterRef.current = null; };
  }, []);
  const loadPercent = requestPending ? 0 : entranceLoadPercent(settledAssets, totalAssets);
  // The tray leaves immediately; start the bar once its poster reaches the center.
  useLayoutEffect(() => { counterRef.current?.setTarget(centered && coverVisible ? loadPercent : 0); }, [loadPercent, centered, coverVisible]);

  useEffect(() => {
    if (ink || requestPending) return;
    const frame = requestAnimationFrame(() => {
      const groups: string[][] = [];
      if (coverRef.current?.complete) groups.push(sampleEntranceMedia(coverRef.current));
      if (mediaReady) {
        const media = document.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
          ".published-strip .image-block img, .published-strip .video-block video");
        [...media].slice(0, 3).forEach(element => groups.push(sampleEntranceMedia(element)));
      }
      const colors = Array.from({ length: 5 }, (_, i) => groups.flatMap(group => group[i] ? [group[i]] : [])).flat();
      if (colors.length) setSampledColors(colors);
      if (colors.length || mediaReady) setPaletteSampled(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [mediaReady, requestPending, ink]);
  const authored = [
    ...(cover.kind === "color" ? [cover.color] : []),
    ...blocks.flatMap(block => block.type === "text"
      ? [block.backgroundColor, block.textColor].filter((color): color is string => Boolean(color)) : []),
    endingStyle.backgroundColor, endingStyle.buttonColor,
  ];
  const palette = makeEntrancePalette(authored, sampledColors);
  const hasPalette = !requestPending && (cover.kind === "color" || blocks.some(block => block.type === "text") || paletteSampled);
  const chosenInk = chooseScribbleColor(palette);
  useEffect(() => {
    if (!hasPalette || ink) return;
    const frame = requestAnimationFrame(() => setInk(chosenInk));
    return () => cancelAnimationFrame(frame);
  }, [hasPalette, ink, chosenInk]);

  useLayoutEffect(() => {
    const host = surfaceRef.current;
    if (!host || !revealing || displayPercent !== 100 || !centered || requestPending || !dockDropped || !coverVisible) return;
    return fadeCoverEntrance(host, () => completeCallback.current());
  }, [revealing, displayPercent, centered, requestPending, dockDropped, coverVisible]);

  const filled = coverProgressCells(displayPercent);
  return (
    <div ref={surfaceRef} className={`published-strip-loading strip-entrance cover-entrance ${initialOrigin ? "is-from-library" : "is-direct-entry"} ${centered ? "is-centered" : ""} ${coverVisible ? "is-cover-visible" : ""}`}
      style={{ "--entrance-a": ink ?? chosenInk } as CSSProperties}
      role="status" aria-label="Loading Strip" data-load-progress={loadPercent}>
      <div className="strip-entrance-backdrop" />
      {initialDock ? <div ref={dockRef} className="composer-dock app-navigation-dock strip-entrance-dock"
        aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: initialDock.markup }} /> : null}
      <div className="strip-entrance-stage" ref={stageRef}>
        <div className="strip-entrance-cover" ref={visualRef}>
          <canvas className="cover-sticker-canvas" ref={canvasRef} aria-hidden="true" />
          <div className="cover-sticker-spinner" ref={stickerRef}>
            <div className="cover-sticker cover-sticker-front cover-sticker-body-front">
              <div className="strip-entrance-cover-face"
                style={cover.kind === "color" ? { backgroundColor: cover.color }
                  : coverUnavailable && !initialOrigin ? { backgroundColor: ink ?? chosenInk } : undefined}>
                {cover.kind === "image" && (!coverUnavailable || initialOrigin) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img ref={coverRef} src={cover.src} alt={cover.alt ?? "Strip cover"} fetchPriority="high" decoding="sync" />
                ) : null}
                {initialOrigin?.image ? <canvas className="cover-sticker-snapshot" ref={snapshotRef} aria-hidden="true" /> : null}
              </div>
            </div>
            <div className="cover-sticker-rear cover-sticker-body-rear" data-peel-side={peelSide < 0 ? "left" : "right"} aria-hidden="true">
              {date ? <svg className="cover-sticker-date" viewBox={`0 -2 ${(dateStrokes.at(-1)?.x ?? 0) + 20} 32`}>
                {dateStrokes.map((stroke, index) => <path key={index} d={stroke.path}
                  transform={`translate(${stroke.x} ${stroke.y}) rotate(${stroke.rotation})`}
                  fill="none" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
              </svg> : null}
            </div>
          </div>
        </div>
        <div className="strip-entrance-progress" role="progressbar" aria-label="Strip loading"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>
          <div className="strip-entrance-squares" aria-hidden="true">
            {Array.from({ length: COVER_PROGRESS_CELLS }, (_, index) => <span key={index}
              className={displayPercent === 0 && index === 0 ? "is-waiting" : index < filled ? "is-filled" : ""} />)}
          </div>
          <span className="strip-entrance-percent" aria-hidden="true"><span className="strip-entrance-percent-value">{displayPercent}</span>%</span>
        </div>
      </div>
    </div>
  );
}
