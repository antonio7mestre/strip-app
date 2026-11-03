"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";

/** One document-painted fade spans both the page and Safari's glass edges. */
export function ReaderEntryCover() {
  const [finished, setFinished] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    releaseRef.current = installScribbleSurface(surface, () => {}, { suspendTheme: true });
    return () => { releaseRef.current?.(); releaseRef.current = null; };
  }, [finished]);
  if (finished) return null;
  return <div ref={surfaceRef} className="reader-entry-cover" onAnimationEnd={event => {
    if (event.target !== event.currentTarget || event.animationName !== "reader-entry-reveal") return;
    releaseRef.current?.();
    releaseRef.current = null;
    setFinished(true);
  }}>
    <div className="reader-entry-wait" role="status" aria-live="polite">
      <span className="reader-entry-wait-spinner" aria-hidden="true" />
      <span>sry loading</span>
    </div>
  </div>;
}
