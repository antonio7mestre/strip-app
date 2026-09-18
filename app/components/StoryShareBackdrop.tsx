"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { captureCoverDock, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { scheduleStorySharePhase, type StorySharePhase } from "@/app/lib/story-share-presentation";

type ShareMotion = { open: boolean; phase: StorySharePhase; dock?: CoverDockOrigin & { scrollY: number } };

/** Real document paint reaches Safari's glass, unlike a fixed viewport overlay. */
export function StoryShareBackdrop({ open, children }: { open: boolean; children: ReactNode }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<ShareMotion>({ open, phase: open ? "presenting" : "closed" });
  if (motion.open !== open) {
    setMotion({ open, phase: open ? "presenting" : motion.phase === "closed" ? "closed" : "closing", dock: open ? undefined : motion.dock });
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
    // Preserve the toolbar's exact painted position, including its white safe
    // area. A stationary document copy can be dimmed and painted over, unlike
    // Safari's separately composited fixed toolbar. Swap before the next paint.
    const origin = captureCoverDock(document.querySelector<HTMLElement>(".share-mode .share-dock"));
    if (origin) setMotion(current => ({ ...current, dock: { ...origin, scrollY: window.scrollY } }));
    const cleanup = installScribbleSurface(surface);
    surface.style.setProperty("--story-share-content-top", `${window.scrollY - parseFloat(surface.style.top)}px`);
    return cleanup;
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
    {motion.dock ? <footer className="composer-dock publish-flow-dock story-share-dock-copy" aria-hidden="true" inert
      style={{ top: motion.dock.top + motion.dock.scrollY, left: motion.dock.left,
        width: motion.dock.width, height: motion.dock.height, padding: motion.dock.padding,
        borderRadius: motion.dock.borderRadius, boxShadow: motion.dock.boxShadow,
        ...({ cornerShape: motion.dock.cornerShape } as CSSProperties) }}
      dangerouslySetInnerHTML={{ __html: motion.dock.markup }} /> : null}
    <div ref={surfaceRef} className="story-share-backdrop" role="status" aria-live="polite">
      <div className="story-share-save-beacon" aria-hidden="true" />
      {children}
    </div>
  </div>;
}
