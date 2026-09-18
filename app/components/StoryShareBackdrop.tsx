"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";

/** Real document paint reaches Safari's glass, unlike a fixed viewport overlay. */
export function StoryShareBackdrop({ children }: { children: ReactNode }) {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    const surface = surfaceRef.current;
    if (!boundary || !surface) return;
    boundary.style.height = document.documentElement.scrollHeight + "px";
    const cleanup = installScribbleSurface(surface);
    surface.style.setProperty("--story-share-content-top", `${window.scrollY - parseFloat(surface.style.top)}px`);
    return cleanup;
  }, []);

  return <div ref={boundaryRef} className="story-share-boundary">
    <div ref={surfaceRef} className="story-share-backdrop" role="status" aria-live="polite">
      <div className="story-share-save-beacon" aria-hidden="true" />
      {children}
    </div>
  </div>;
}
