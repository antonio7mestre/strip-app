"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { captureCoverDock, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { scheduleStorySharePhase, type StorySharePhase } from "@/app/lib/story-share-presentation";

type ShareMotion = { open: boolean; phase: StorySharePhase };

/** Real document paint reaches Safari's glass, unlike a fixed viewport overlay. */
export function StoryShareBackdrop({ open, children }: { open: boolean; children: ReactNode }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dockPaintRef = useRef<{ dock: HTMLElement; origin: CoverDockOrigin; live: HTMLElement; display: string } | null>(null);
  const [motion, setMotion] = useState<ShareMotion>({ open, phase: open ? "presenting" : "closed" });
  if (motion.open !== open) {
    setMotion({ open, phase: open ? "presenting" : motion.phase === "closed" ? "closed" : "closing" });
  }
  const mounted = motion.phase !== "closed";
  const paintDock = mounted && open;

  useLayoutEffect(() => scheduleStorySharePhase(motion.phase, phase => {
    setMotion(current => ({ ...current, phase }));
  }), [motion.phase]);

  useLayoutEffect(() => {
    if (!paintDock) return;
    const live = document.querySelector<HTMLElement>(".share-mode .share-dock");
    const surface = surfaceRef.current;
    const origin = captureCoverDock(live);
    if (!live || !origin || !surface) return;
    const display = live.style.display;
    // The fixed white extension asks Safari for an opaque native inset fill.
    // Replace only its renderer while covered. Preserve the exact geometry and
    // restore the original interactive controls as soon as sharing closes.
    const dock = document.createElement("footer");
    dock.className = "composer-dock share-dock publish-flow-dock story-share-document-dock";
    dock.setAttribute("aria-hidden", "true");
    dock.inert = true;
    dock.innerHTML = origin.markup;
    surface.appendChild(dock);
    dockPaintRef.current = { dock, origin, live, display };
    live.style.display = "none";
    return () => { live.style.display = display; dock.remove(); dockPaintRef.current = null; };
  }, [paintDock]);

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    const surface = surfaceRef.current;
    if (!boundary || !surface) return;
    const pageHeight = document.documentElement.scrollHeight;
    boundary.style.height = pageHeight + "px";
    const measurePaint = () => {
      const bounds = surface.getBoundingClientRect();
      // The copied extension is real document paint, including the glass below
      // the visual viewport. Do not clip it at the old page's shorter height.
      boundary.style.height = Math.max(pageHeight, window.scrollY + Math.ceil(bounds.bottom)) + "px";
      const paint = dockPaintRef.current;
      if (!paint) return;
      const { origin, dock } = paint;
      Object.assign(dock.style, {
        left: origin.left - bounds.left + "px",
        top: origin.top - bounds.top + "px",
        width: origin.width + "px", height: origin.height + "px",
        padding: origin.padding, borderRadius: origin.borderRadius,
        boxShadow: origin.boxShadow,
      });
      if (origin.cornerShape) dock.style.setProperty("corner-shape", origin.cornerShape);
      surface.style.setProperty("--story-share-dock-top", origin.top - bounds.top + "px");
    };
    const cleanup = installScribbleSurface(surface, measurePaint);
    surface.style.setProperty("--story-share-content-top", `${window.scrollY - parseFloat(surface.style.top)}px`);
    // Dim only the page above the bar. Its stationary white document paint
    // stays opaque, without a hide or drop animation.
    const measureDock = () => {
      const paint = dockPaintRef.current;
      if (paint) {
        // Re-measure the original controls synchronously, with no visible frame
        // between temporarily restoring and removing the fixed renderer.
        paint.live.style.display = paint.display;
        paint.origin = captureCoverDock(paint.live) ?? paint.origin;
        paint.live.style.display = "none";
        measurePaint();
        return;
      }
      const dock = document.querySelector<HTMLElement>(".share-mode .share-dock");
      if (dock?.offsetHeight) surface.style.setProperty("--story-share-dock-top", `${dock.getBoundingClientRect().top - surface.getBoundingClientRect().top}px`);
    };
    measureDock();
    window.addEventListener("resize", measureDock);
    return () => { cleanup(); window.removeEventListener("resize", measureDock); };
  }, [mounted, paintDock]);

  useLayoutEffect(() => {
    if (motion.phase !== "covered") return;
    // Safari forwards a tap outside its native tray before resolving share().
    // Fade the overlay from that first contact, while the tray still covers it.
    // Do not swallow the event or delay Safari's own dismissal.
    const dismiss = () => setMotion(current => current.phase === "covered" ? { ...current, phase: "closing" } : current);
    window.addEventListener("pointerdown", dismiss, { capture: true, passive: true });
    window.addEventListener("touchstart", dismiss, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("touchstart", dismiss, true);
    };
  }, [motion.phase]);

  if (!mounted) return null;
  return <div ref={boundaryRef} className="story-share-boundary" data-phase={motion.phase}>
    <div ref={surfaceRef} className="story-share-backdrop" role="status" aria-live="polite">
      <div className="story-share-save-beacon" aria-hidden="true" />
      <div className="story-share-dimmer">{children}</div>
    </div>
  </div>;
}
