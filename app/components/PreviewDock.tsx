"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { captureCoverDock, moveCoverDock, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";

type Motion = {
  preview: boolean;
  phase: "idle" | "measure" | "moving";
  origin?: CoverDockOrigin;
  fromTop?: number;
  pageHeight?: number;
};

/** Swap the fixed toolbar for document paint during motion, including Safari's
 * safe-area extension. The strip's layout, selection and history stay untouched. */
export function PreviewDock({ preview, children }: { preview: boolean; children: ReactNode }) {
  const [motion, setMotion] = useState<Motion>({ preview, phase: "idle" });
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);

  if (motion.preview !== preview) {
    setMotion({ ...motion, preview, phase: "measure" });
  }

  useLayoutEffect(() => {
    if (motion.phase !== "measure") return;
    const liveDock = mountRef.current?.querySelector<HTMLElement>(".main-composer-dock") ?? null;
    const origin = captureCoverDock(liveDock);
    // Keep the moving copy during measurement so a fast Back can reverse in place.
    const fromTop = dockRef.current?.getBoundingClientRect().top;
    setMotion({ preview, phase: origin ? "moving" : "idle", origin, fromTop,
      pageHeight: document.documentElement.scrollHeight });
  }, [motion.phase, preview]);

  useLayoutEffect(() => {
    if (motion.phase !== "moving" || !motion.origin || !surfaceRef.current || !dockRef.current) return;
    const cleanSurface = installScribbleSurface(surfaceRef.current);
    const cancel = moveCoverDock(surfaceRef.current, dockRef.current, motion.origin,
      preview ? "down" : "up", () => {
        // Replace the returned copy with the live toolbar in the same paint.
        flushSync(() => setMotion({ preview, phase: "idle" }));
      }, motion.fromTop);
    return () => { cancel(); cleanSurface(); };
  }, [motion, preview]);

  return <>
    {motion.phase === "measure" || (motion.phase === "idle" && !preview) ? (
      <div ref={mountRef} className="preview-dock-mount" data-measuring={motion.phase === "measure" || undefined}>
        {children}
      </div>
    ) : null}
    {motion.origin && motion.phase !== "idle" ? createPortal(
      <div className="preview-dock-boundary" style={{ height: motion.pageHeight }} aria-hidden="true" inert>
        <div ref={surfaceRef} className="preview-dock-surface" data-direction={preview ? "down" : "up"}>
          <footer ref={dockRef} className="composer-dock main-composer-dock preview-motion-dock"
            dangerouslySetInnerHTML={{ __html: motion.origin.markup }} />
        </div>
      </div>, document.body,
    ) : null}
  </>;
}
