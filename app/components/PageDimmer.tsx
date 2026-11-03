"use client";

import { useLayoutEffect, useRef } from "react";

/** Document paint, not a fixed header that Safari extends into its top chrome. */
export function PageDimmer() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const viewport = window.visualViewport;
    const sync = () => {
      // Start inside the visible page. Do not paint above it, change the root
      // color, or dim the tool dock and its existing safe-area extension.
      const top = Math.max(0, window.scrollY + (viewport?.offsetTop ?? 0));
      // The visual viewport ends above the software keyboard. Keep painting
      // through the layout viewport behind it, including Safari's translucent
      // keyboard/accessory chrome, without adding any document scroll height.
      const layoutBottom = window.scrollY + Math.max(window.innerHeight, document.documentElement.clientHeight);
      const visibleBottom = top + (viewport?.height ?? window.innerHeight);
      const bottom = Math.min(document.documentElement.scrollHeight, Math.max(layoutBottom, visibleBottom));
      const height = Math.max(0, bottom - top);
      layer.style.top = `${top}px`;
      layer.style.height = `${height}px`;
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
    };
  }, []);
  return <div ref={ref} className="page-dimmer" aria-hidden="true" />;
}
