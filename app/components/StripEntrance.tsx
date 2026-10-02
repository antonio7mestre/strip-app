"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { entranceLoadPercent, startEntranceCounter } from "@/app/lib/strip-entrance";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { DEFAULT_PROFILE, PROFILE_FONTS, profileInk, type ProfileFont } from "@/app/lib/profile";
import { COVER_MOVE_MS, coverEntranceLayout, fitCoverTitle, dropCoverDock, fadeCoverEntrance, fadeInCover, watchCoverImage, type CoverOrigin, type CoverDockOrigin } from "@/app/lib/cover-entrance";

type Cover = { kind: "image"; src: string; alt?: string; aspectRatio?: number }
  | { kind: "color"; color: string; shape?: "portrait" | "square" | "landscape" };
export function StripEntrance({ cover, title = "Untitled", settledAssets, totalAssets,
  revealing, requestPending = false, origin, dock, backgroundColor = "#000000", inkColor, profileFont, onCoverSettled, onExitComplete,
}: {
  cover: Cover; title?: string; settledAssets: number; totalAssets: number; revealing: boolean;
  requestPending?: boolean; origin?: CoverOrigin; dock?: CoverDockOrigin; backgroundColor?: string;
  inkColor?: string;
  profileFont?: ProfileFont;
  onCoverSettled: () => void; onExitComplete: () => void;
}) {
  const coverRef = useRef<HTMLImageElement>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [initialOrigin] = useState(origin);
  const [initialDock] = useState(dock);
  const [initialBackground] = useState(backgroundColor);
  const [ink] = useState(() => inkColor && /^#[\da-f]{6}$/i.test(inkColor) ? inkColor : profileInk(initialBackground));
  const [font] = useState(() => (PROFILE_FONTS.find(({ id }) => id === profileFont)
    ?? PROFILE_FONTS.find(({ id }) => id === DEFAULT_PROFILE.font)!).family);
  const [centered, setCentered] = useState(!origin);
  const [dockDropped, setDockDropped] = useState(!dock);
  const [coverReady, setCoverReady] = useState(cover.kind === "color" || Boolean(origin?.snapshot));
  const [coverVisible, setCoverVisible] = useState(Boolean(origin));
  const [coverFailed, setCoverFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(() => origin ? origin.width / origin.height
    : cover.kind === "image" ? cover.aspectRatio ?? 1
      : cover.shape === "portrait" ? 4 / 5 : cover.shape === "landscape" ? 3 / 2 : 1);
  const [displayPercent, setDisplayPercent] = useState(0);
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
    const root = document.documentElement;
    const previousBackground = root.style.getPropertyValue("--cover-entrance-background");
    const previousPriority = root.style.getPropertyPriority("--cover-entrance-background");
    root.style.setProperty("--cover-entrance-background", initialBackground);
    root.classList.add("cover-entrance-active");
    return () => {
      removeSurface();
      root.classList.remove("cover-entrance-active");
      if (previousBackground) root.style.setProperty("--cover-entrance-background", previousBackground, previousPriority);
      else root.style.removeProperty("--cover-entrance-background");
      if (name && !theme?.hasAttribute("name")) theme?.setAttribute("name", name);
    };
  }, [initialBackground]);

  // Install the clicked cover's existing pixels before the browser can paint.
  // Keep this same canvas through the reader handoff, with no second image load.
  useLayoutEffect(() => {
    const snapshot = initialOrigin?.snapshot;
    if (!snapshot || !snapshotRef.current) return;
    snapshotRef.current.appendChild(snapshot);
    settledCallback.current();
    return () => { snapshot.remove(); };
  }, [initialOrigin]);

  useLayoutEffect(() => {
    if (!surfaceRef.current || !dockRef.current || !initialDock) return;
    return dropCoverDock(surfaceRef.current, dockRef.current, initialDock, () => setDockDropped(true));
  }, [initialDock]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let active = true, fittedWidth = -1;
    const sync = () => {
      if (!active) return;
      const viewport = window.visualViewport;
      const layout = coverEntranceLayout(window.innerWidth, viewport?.height ?? window.innerHeight,
        viewport?.offsetTop ?? 0, aspectRatio);
      Object.assign(stage.style, { left: layout.left + "px", top: layout.top + "px",
        width: layout.width + "px", height: layout.height + "px" });
      surfaceRef.current?.style.setProperty("--entrance-cover-width", layout.width + "px");
      surfaceRef.current?.style.setProperty("--entrance-cover-top", layout.top + "px");
      surfaceRef.current?.style.setProperty("--entrance-cover-bottom", (layout.top + layout.height) + "px");
      surfaceRef.current?.style.setProperty("--entrance-viewport-top", (viewport?.offsetTop ?? 0) + "px");
      surfaceRef.current?.style.setProperty("--entrance-viewport-bottom",
        ((viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) + "px");
      if (titleRef.current && fittedWidth !== layout.width) {
        fitCoverTitle(titleRef.current);
        fittedWidth = layout.width;
      }
    };
    const fontsReady = () => { fittedWidth = -1; sync(); };
    sync();
    void document.fonts?.ready.then(fontsReady);
    document.fonts?.addEventListener("loadingdone", fontsReady);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      active = false;
      document.fonts?.removeEventListener("loadingdone", fontsReady);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [aspectRatio, title, font]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!initialOrigin || !stage) return;
    const target = stage.getBoundingClientRect();
    if (!stage.animate || !target.width || !target.height) { setCentered(true); return; }
    const animation = stage.animate([
      { transform: `translate3d(${initialOrigin.left - target.left}px, ${initialOrigin.top - target.top}px, 0) scale(${initialOrigin.width / target.width}, ${initialOrigin.height / target.height})` },
      { transform: "translate3d(0, 0, 0) scale(1, 1)" },
    ], { duration: COVER_MOVE_MS, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "both" });
    animation.onfinish = () => {
      // Count real progress once the cover reaches its resting position.
      if (mounted.current) flushSync(() => setCentered(true));
      animation.cancel();
    };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [initialOrigin]);

  const coverSrc = cover.kind === "image" ? cover.src : null;
  useLayoutEffect(() => {
    const image = coverRef.current;
    if (!image) return;
    return watchCoverImage(image, () => {
      if (!mounted.current) return;
      if (!initialOrigin && image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight);
      setCoverReady(true);
      settledCallback.current();
    }, () => {
      setCoverFailed(true);
      setCoverReady(true);
      settledCallback.current();
    });
  }, [coverSrc, initialOrigin]);

  // Retain the reader's existing timeout recovery if a cover request never settles.
  const coverUnavailable = coverFailed || (!initialOrigin && revealing && !coverReady);
  const coverReadyToAppear = coverReady || coverUnavailable;

  useLayoutEffect(() => {
    if (initialOrigin || !coverReadyToAppear || !visualRef.current || !titleRef.current || !progressRef.current) return;
    return fadeInCover(visualRef.current, () => setCoverVisible(true), [titleRef.current, progressRef.current]);
  }, [initialOrigin, coverReadyToAppear]);

  const counterRef = useRef<ReturnType<typeof startEntranceCounter> | null>(null);
  useLayoutEffect(() => {
    const counter = startEntranceCounter(setDisplayPercent);
    counterRef.current = counter;
    return () => { counter.dispose(); counterRef.current = null; };
  }, []);
  const loadPercent = requestPending ? 0 : entranceLoadPercent(settledAssets, totalAssets);
  // Blink immediately; count real progress once its poster reaches the center.
  useLayoutEffect(() => { counterRef.current?.setTarget(centered && coverVisible ? loadPercent : 0); }, [loadPercent, centered, coverVisible]);

  useLayoutEffect(() => {
    const host = surfaceRef.current;
    if (!host || !revealing || displayPercent !== 100 || !centered || requestPending || !dockDropped || !coverVisible) return;
    return fadeCoverEntrance(host, () => completeCallback.current());
  }, [revealing, displayPercent, centered, requestPending, dockDropped, coverVisible]);

  return (
    <div ref={surfaceRef} className={`published-strip-loading strip-entrance cover-entrance ${initialOrigin ? "is-from-library" : ""} ${centered ? "is-centered" : ""} ${coverVisible ? "is-cover-visible" : ""}`}
      style={{ "--entrance-a": ink, "--entrance-background": initialBackground, "--entrance-font": font } as CSSProperties}
      role="status" aria-label="Loading Strip" data-load-progress={loadPercent}>
      <div className="strip-entrance-backdrop" />
      {initialDock ? <div ref={dockRef} className="composer-dock app-navigation-dock strip-entrance-dock"
        aria-hidden="true" inert dangerouslySetInnerHTML={{ __html: initialDock.markup }} /> : null}
      <h1 ref={titleRef} className="strip-entrance-title">{title.trim() || "Untitled"}</h1>
      <div className="strip-entrance-stage" ref={stageRef}>
        <div className="strip-entrance-cover" ref={visualRef}
          style={{ boxShadow: initialOrigin?.boxShadow,
            ...(cover.kind === "color" ? { backgroundColor: cover.color }
              : coverUnavailable && !initialOrigin ? { backgroundColor: ink } : {}) }}>
          {initialOrigin?.snapshot ? <div ref={snapshotRef} className="strip-entrance-snapshot"
            role="img" aria-label={cover.kind === "image" ? cover.alt ?? "Strip cover" : "Strip cover"} />
          : cover.kind === "image" && (!coverUnavailable || initialOrigin) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img ref={coverRef} src={cover.src} alt={cover.alt ?? "Strip cover"} fetchPriority="high" decoding="sync" />
          ) : null}
        </div>
      </div>
      <div ref={progressRef} className="strip-entrance-progress" role="progressbar" aria-label="Strip loading"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>
        <span className="strip-entrance-percent" data-value={displayPercent} data-waiting={displayPercent === 0} aria-hidden="true">
          <span className="strip-entrance-percent-value">{displayPercent}</span>
        </span>
      </div>
    </div>
  );
}
