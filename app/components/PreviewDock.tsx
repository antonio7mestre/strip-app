"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { captureCoverDock, moveCoverDock, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { retainPreviewBottomPaint } from "@/app/lib/preview-layout";
import { fadePreviewDock } from "@/app/lib/preview-dock-fade";

type Motion = {
  preview: boolean;
  phase: "idle" | "measure" | "moving";
  origin?: CoverDockOrigin;
  fromTop?: number;
  fromOpacity?: number;
  pageHeight?: number;
  keepBottomWhite?: boolean;
  dockClassName?: string;
};

/** Swap the fixed toolbar for document paint during motion, including Safari's
 * safe-area extension. The strip's layout, selection and history stay untouched. */
export function PreviewDock({ preview, children, enter = false, scopeClassName = "" }: {
  preview: boolean; children: ReactNode; enter?: boolean; scopeClassName?: string;
}) {
  const [motion, setMotion] = useState<Motion>({ preview, phase: enter && !preview ? "measure" : "idle" });
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const backingRef = useRef<HTMLDivElement>(null);
  const releaseBottomPaintRef = useRef<(() => void) | null>(null);

  if (motion.preview !== preview) {
    setMotion({ ...motion, preview, phase: "measure" });
  }

  useLayoutEffect(() => {
    if (motion.phase === "idle") {
      releaseBottomPaintRef.current?.();
      releaseBottomPaintRef.current = null;
    }
    if (motion.phase !== "measure") return;
    const liveDock = mountRef.current?.querySelector<HTMLElement>(".composer-dock") ?? null;
    const origin = captureCoverDock(liveDock);
    // Keep the moving copy during measurement so a fast Back can reverse in place.
    const fromTop = dockRef.current?.getBoundingClientRect().top;
    const fromOpacity = dockRef.current ? Number(dockRef.current.style.opacity || 1) : undefined;
    const keepBottomWhite = document.documentElement.classList.contains("preview-bottom-handoff-active");
    if (keepBottomWhite && !releaseBottomPaintRef.current) {
      releaseBottomPaintRef.current = retainPreviewBottomPaint();
    }
    setMotion({ preview, phase: origin ? "moving" : "idle", origin, fromTop, fromOpacity,
      pageHeight: document.documentElement.scrollHeight, keepBottomWhite, dockClassName: liveDock?.className });
  }, [motion.phase, preview]);

  useLayoutEffect(() => () => { releaseBottomPaintRef.current?.(); }, []);

  useLayoutEffect(() => {
    if (motion.phase !== "moving" || !motion.origin || !surfaceRef.current || !dockRef.current) return;
    const surface = surfaceRef.current;
    const origin = motion.origin;
    const cleanSurface = installScribbleSurface(surface, () => {
      if (!backingRef.current) return;
      const bounds = surface.getBoundingClientRect();
      Object.assign(backingRef.current.style, {
        left: `${origin.left - bounds.left}px`, top: `${origin.top - bounds.top}px`,
        width: `${origin.width}px`, height: `${Math.max(origin.height, bounds.bottom - origin.top)}px`,
        borderRadius: origin.borderRadius,
      });
    });
    const complete = () => {
        // Replace the returned copy with the live toolbar in the same paint.
        flushSync(() => setMotion({ preview, phase: "idle" }));
      };
    const cancel = motion.keepBottomWhite
      ? fadePreviewDock(surface, dockRef.current, origin, preview, complete, motion.fromOpacity)
      : moveCoverDock(surface, dockRef.current, origin, preview ? "down" : "up", complete, motion.fromTop);
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
        <div ref={surfaceRef} className={`preview-dock-surface ${scopeClassName}`} data-direction={preview ? "down" : "up"}>
          {/* The incoming reader footer already paints gray. A second opaque
              tray here would cover its buttons as the white dock fades away.
              Only the return to edit needs backing under the incoming dock. */}
          {motion.keepBottomWhite && !preview ? <div ref={backingRef} className="preview-dock-backing" /> : null}
          <footer ref={dockRef} className={`${motion.dockClassName ?? "composer-dock main-composer-dock"} preview-motion-dock`}
            dangerouslySetInnerHTML={{ __html: motion.origin.markup }} />
        </div>
      </div>, document.body,
    ) : null}
  </>;
}
