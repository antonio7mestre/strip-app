"use client";

import { useLayoutEffect } from "react";

/** Desktop notices follow the real pill height, including expanded pickers. */
export function DesktopPresentation() {
  useLayoutEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const root = document.documentElement;
    let dock: HTMLElement | null = null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!media.matches) {
        root.style.removeProperty("--desktop-dock-clearance");
        return;
      }
      const current = Array.from(document.querySelectorAll<HTMLElement>(
        ".composer-dock:not(.preview-motion-dock):not(.strip-entrance-dock):not(.story-share-document-dock):not(.auth-dock-frozen)",
      )).find(element => element.offsetHeight > 0) ?? null;
      if (dock !== current) {
        if (dock) sizes.unobserve(dock);
        dock = current;
        if (dock) sizes.observe(dock);
      }
      // Use layout height, not animated screen coordinates, so notices do not jump.
      const height = dock?.offsetHeight ?? 80;
      root.style.setProperty("--desktop-dock-clearance", `${height + 28 + 16}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const sizes = new ResizeObserver(schedule);
    const content = new MutationObserver(schedule);
    content.observe(document.body, { childList: true, subtree: true });
    media.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      content.disconnect();
      media.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      root.style.removeProperty("--desktop-dock-clearance");
    };
  }, []);
  return <div className="desktop-wordmark"><span>STRIP</span><p>i swear this is better on your phone</p></div>;
}
