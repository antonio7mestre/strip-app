"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { scheduleStorySharePhase, type StorySharePhase } from "@/app/lib/story-share-presentation";

type ShareMotion = { open: boolean; phase: StorySharePhase };

/** Real document paint reaches Safari's glass, unlike a fixed viewport overlay. */
export function StoryShareBackdrop({ open, children }: { open: boolean; children: ReactNode }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<ShareMotion>({ open, phase: open ? "presenting" : "closed" });
  if (motion.open !== open) {
    setMotion({ open, phase: open ? "presenting" : motion.phase === "closed" ? "closed" : "closing" });
  }
  const mounted = motion.phase !== "closed";

  useLayoutEffect(() => scheduleStorySharePhase(motion.phase, phase => {
    setMotion(current => ({ ...current, phase }));
  }), [motion.phase]);

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    const surface = surfaceRef.current;
    if (!boundary || !surface) return;
    boundary.style.height = document.documentElement.scrollHeight + "px";
    const cleanup = installScribbleSurface(surface);
    surface.style.setProperty("--story-share-content-top", `${window.scrollY - parseFloat(surface.style.top)}px`);
    // Dim only the page above the existing bar. Leave its white safe-area
    // extension alone, without a replacement, hide, or drop animation.
    const measureDock = () => {
      const dock = document.querySelector<HTMLElement>(".share-mode .share-dock");
      if (dock) surface.style.setProperty("--story-share-dock-top", `${dock.getBoundingClientRect().top - surface.getBoundingClientRect().top}px`);
    };
    measureDock();
    window.addEventListener("resize", measureDock);
    return () => { cleanup(); window.removeEventListener("resize", measureDock); };
  }, [mounted]);

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
      {children}
    </div>
  </div>;
}
