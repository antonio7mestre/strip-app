"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { scheduleStorySharePhase, type StorySharePhase } from "@/app/lib/story-share-presentation";

/** Real document paint reaches Safari's glass, unlike a fixed viewport overlay. */
export function StoryShareBackdrop({ open, children }: { open: boolean; children: ReactNode }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<{ open: boolean; phase: StorySharePhase }>({ open, phase: open ? "presenting" : "closed" });
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
    return cleanup;
  }, [mounted]);

  useLayoutEffect(() => {
    if (motion.phase !== "covered" && motion.phase !== "settled") return;
    // Safari forwards a tap outside its native tray before resolving share().
    // Restore the bottom at that first contact, while the tray still covers it.
    // Do not swallow the event or delay Safari's own dismissal.
    const dismiss = () => setMotion(current => current.phase === "covered" || current.phase === "settled" ? { ...current, phase: "closing" } : current);
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
