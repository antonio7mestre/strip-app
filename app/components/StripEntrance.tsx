"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { entranceLoadPercent, makeEntrancePalette, sampleEntranceMedia, startEntranceCounter } from "@/app/lib/strip-entrance";
import { chooseScribbleColor, installScribbleSurface } from "@/app/lib/scribble-entrance";
import { COVER_MOVE_MS, COVER_PROGRESS_CELLS, coverEntranceLayout, coverProgressCells, fadeCoverEntrance, type CoverOrigin } from "@/app/lib/cover-entrance";

type Cover = { kind: "image"; src: string; alt?: string; aspectRatio?: number }
  | { kind: "color"; color: string; shape?: "portrait" | "square" | "landscape" };
type PaletteBlock = { type: string; backgroundColor?: string; textColor?: string };

export function StripEntrance({ cover, blocks, endingStyle, mediaReady, settledAssets, totalAssets,
  revealing, requestPending = false, origin, onCoverSettled, onExitComplete,
}: {
  cover: Cover; blocks: PaletteBlock[];
  endingStyle: { backgroundColor: string; buttonColor: string };
  mediaReady: boolean; settledAssets: number; totalAssets: number; revealing: boolean;
  requestPending?: boolean; origin?: CoverOrigin;
  onCoverSettled: () => void; onExitComplete: () => void;
}) {
  const coverRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const [initialOrigin] = useState(origin);
  const [centered, setCentered] = useState(!origin);
  const [aspectRatio, setAspectRatio] = useState(() => origin ? origin.width / origin.height
    : cover.kind === "image" ? cover.aspectRatio ?? 1
      : cover.shape === "portrait" ? 3 / 4 : cover.shape === "landscape" ? 4 / 3 : 1);
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
    const visual = visualRef.current;
    if (!initialOrigin || !visual) return;
    const target = visual.getBoundingClientRect();
    if (!visual.animate || !target.width || !target.height) { setCentered(true); return; }
    const animation = visual.animate([
      { transform: `translate3d(${initialOrigin.left - target.left}px, ${initialOrigin.top - target.top}px, 0) scale(${initialOrigin.width / target.width}, ${initialOrigin.height / target.height})` },
      { transform: "translate3d(0, 0, 0) scale(1, 1)" },
    ], { duration: COVER_MOVE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" });
    animation.onfinish = () => { if (mounted.current) setCentered(true); animation.cancel(); };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [initialOrigin]);

  const counterRef = useRef<ReturnType<typeof startEntranceCounter> | null>(null);
  useLayoutEffect(() => {
    const counter = startEntranceCounter(setDisplayPercent);
    counterRef.current = counter;
    return () => { counter.dispose(); counterRef.current = null; };
  }, []);
  const loadPercent = requestPending ? 0 : entranceLoadPercent(settledAssets, totalAssets);
  useLayoutEffect(() => { counterRef.current?.setTarget(loadPercent); }, [loadPercent]);

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
    if (!host || !revealing || displayPercent !== 100 || !centered || requestPending) return;
    return fadeCoverEntrance(host, () => completeCallback.current());
  }, [revealing, displayPercent, centered, requestPending]);

  const filled = coverProgressCells(displayPercent);
  return (
    <div ref={surfaceRef} className={`published-strip-loading strip-entrance cover-entrance ${initialOrigin ? "is-from-library" : ""} ${centered ? "is-centered" : ""}`}
      style={{ "--entrance-a": ink ?? chosenInk } as CSSProperties}
      role="status" aria-label="Loading Strip" data-load-progress={loadPercent}>
      <div className="strip-entrance-backdrop" />
      <div className="strip-entrance-stage" ref={stageRef}>
        <div className="strip-entrance-cover" ref={visualRef}
          style={cover.kind === "color" ? { backgroundColor: cover.color } : undefined}>
          {cover.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={coverRef} src={cover.src} alt={cover.alt ?? "Strip cover"} fetchPriority="high" decoding="sync"
              onLoad={event => {
                const image = event.currentTarget;
                void image.decode().catch(() => {}).then(() => {
                  if (!mounted.current) return;
                  if (!initialOrigin && image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight);
                  setSampledColors(sampleEntranceMedia(image));
                  setPaletteSampled(true);
                  settledCallback.current();
                });
              }} onError={() => { setPaletteSampled(true); settledCallback.current(); }} />
          ) : null}
        </div>
        <div className="strip-entrance-progress" role="progressbar" aria-label="Strip loading"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>
          <div className="strip-entrance-squares" aria-hidden="true">
            {Array.from({ length: COVER_PROGRESS_CELLS }, (_, index) => <span key={index} className={index < filled ? "is-filled" : ""} />)}
          </div>
          <span className="strip-entrance-percent" aria-hidden="true"><span className="strip-entrance-percent-value">{displayPercent}</span>%</span>
        </div>
      </div>
    </div>
  );
}
