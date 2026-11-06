"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
import { intersectsReaderViewport } from "@/app/lib/reader-viewport";

/** Re-measure after every decode before allowing reveal. This also discovers
 * additional first-screen blocks when a legacy image has no saved dimensions. */
export function useReaderViewport(key: string, assetKey: string, canvas: RefObject<HTMLElement | null>,
  status: Record<string, "loaded" | "error">, locked: boolean, layoutReady = true, waitForAllFonts = true) {
  const [measurement, setMeasurement] = useState<{ key: string; assetKey: string; ids: string[]; status: typeof status; fontsReady: boolean; complete: boolean }>(
    { key: "", assetKey: "", ids: [], status: {}, fontsReady: false, complete: false });
  // Freeze only after a post-decode geometry measurement. Background downloads
  // must never close the gate again or detach images already being downloaded.
  const complete = measurement.key === key && measurement.assetKey === assetKey && measurement.complete;
  useLayoutEffect(() => {
    if (!key || !canvas.current || locked || complete) return;
    const root = canvas.current, assets = new Set(assetKey.split("|"));
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bounds = { top, bottom: top + (viewport?.height ?? window.innerHeight), width: window.innerWidth };
      const ids = Array.from(root.querySelectorAll<HTMLElement>(":scope > .strip-block[data-block-id]"))
        .filter(node => {
          if (!assets.has(node.dataset.blockId!)) return false;
          const rect = node.getBoundingClientRect();
          // Uploaded stickers may not have intrinsic dimensions yet.
          const bottom = rect.height > 0 ? rect.bottom : rect.top + Math.max(1, rect.width);
          return intersectsReaderViewport({ top: rect.top, bottom, left: rect.left, right: rect.right }, bounds);
        })
        .map(node => node.dataset.blockId!);
      const fontsReady = layoutReady && (!waitForAllFonts || document.fonts.status !== "loading");
      const complete = fontsReady && ids.every(id => status[id] !== undefined);
      setMeasurement(current => current.key === key && current.assetKey === assetKey && current.status === status && current.fontsReady === fontsReady &&
        current.ids.join("|") === ids.join("|") ? current : { key, assetKey, ids, status, fontsReady, complete });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    root.querySelectorAll<HTMLElement>(":scope > .strip-block").forEach(node => resize.observe(node));
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    document.fonts.addEventListener("loadingdone", measure);
    document.fonts.addEventListener("loadingerror", measure);
    measure();
    return () => {
      disposed = true; resize.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      document.fonts.removeEventListener("loadingdone", measure);
      document.fonts.removeEventListener("loadingerror", measure);
    };
  }, [key, assetKey, canvas, status, locked, complete, layoutReady, waitForAllFonts]);
  return { ids: measurement.key === key ? measurement.ids : [],
    measured: locked || complete || Boolean(key && measurement.key === key && measurement.status === status && measurement.fontsReady) };
}
