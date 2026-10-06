export type EmptyStateKind = "profile" | "editor";
type Bounds = { left: number; top: number; width: number; height: number };

/** Aim at the real control, not an assumed phone size or browser toolbar height. */
export function emptyStateGuidePosition(origin: Bounds, target: Bounds, kind: EmptyStateKind) {
  // The homepage's raster arrow points down/right; the editor mirrors it left.
  const tip = kind === "profile" ? { x: 142, y: 104 } : { x: 42, y: 104 };
  const x = target.left + target.width / 2 - (kind === "profile" ? 22 : 0);
  const y = kind === "profile" ? target.top + target.height / 2 - 22 : target.top - 8;
  return { left: x - origin.left - tip.x, top: y - origin.top - tip.y };
}

/** Presentation only. Never change canvas height, scroll position, or tool behavior. */
export function installEmptyStateGuide(origin: HTMLElement, arrow: HTMLElement, kind: EmptyStateKind) {
  const page = origin.closest(".app-shell");
  const selector = kind === "profile" ? ".library-add-button" : '.main-composer-dock [aria-label="Add photo or video"]';
  const target = page?.querySelector<HTMLElement>(selector);
  if (!target) return;
  const sync = () => {
    const bounds = target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      arrow.removeAttribute("data-positioned");
      return;
    }
    const position = emptyStateGuidePosition(origin.getBoundingClientRect(), bounds, kind);
    arrow.style.left = `${position.left}px`;
    arrow.style.top = `${position.top}px`;
    origin.style.setProperty("--empty-guide-left", `${position.left}px`);
    origin.style.setProperty("--empty-guide-top", `${position.top}px`);
    arrow.setAttribute("data-positioned", "true");
  };
  sync();
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
  resize?.observe(origin);
  resize?.observe(target);
  window.addEventListener("resize", sync);
  window.addEventListener("scroll", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  page?.addEventListener("transitionend", sync);
  return () => {
    resize?.disconnect();
    window.removeEventListener("resize", sync);
    window.removeEventListener("scroll", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    page?.removeEventListener("transitionend", sync);
    origin.style.removeProperty("--empty-guide-left");
    origin.style.removeProperty("--empty-guide-top");
  };
}
