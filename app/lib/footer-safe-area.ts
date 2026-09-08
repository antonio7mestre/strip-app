type VerticalBounds = { top: number; bottom: number };

/** Safari can still paint page content behind its shrinking browser controls. */
export function getSafeAreaPaintViewport(
  windowHeight: number,
  layoutHeight: number,
  visualViewport: { offsetTop: number; height: number } | null,
  fullPaintHeight = 0,
): VerticalBounds {
  const visualTop = visualViewport?.offsetTop ?? 0;
  return {
    top: Math.min(0, visualTop),
    bottom: Math.max(fullPaintHeight, windowHeight, layoutHeight, visualTop + (visualViewport?.height ?? 0)),
  };
}

/** Enter just ahead of the footer; leave only after it fully clears the screen. */
export function shouldUseFooterSafeAreaColor(
  footer: VerticalBounds,
  viewport: VerticalBounds,
  wasActive: boolean,
  approachLead = 48,
) {
  // Different entry/exit edges prevent a fractional scroll or toolbar resize
  // from repeatedly switching the root canvas at the visibility boundary.
  const entryMargin = Math.max(48, approachLead);
  const margin = wasActive ? Math.max(64, entryMargin + 16) : entryMargin;
  return footer.top <= viewport.bottom + margin && footer.bottom >= viewport.top - margin;
}

/** Own only the canvas color. Never move the page or resize the footer. */
export function installFooterSafeAreaColor({
  enabled,
  sheet,
  topColor,
  bottomColor,
  defaultColor,
  activeClassName = "published-bottom-canvas-active",
}: {
  enabled: boolean;
  sheet: HTMLElement | null;
  topColor: string;
  bottomColor: string;
  defaultColor: string;
  activeClassName?: string;
}) {
  const root = document.documentElement;
  const theme = document.querySelector<HTMLMetaElement>("#strip-theme-color");
  let active: boolean | null = null;
  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    root.classList.toggle(activeClassName, next);
    root.style.setProperty("--bottom-safe-area-color", bottomColor);
    theme?.setAttribute("content", next ? bottomColor : topColor);
  };
  const restore = () => {
    root.classList.remove(activeClassName);
    root.style.setProperty("--bottom-safe-area-color", defaultColor);
    theme?.setAttribute("content", topColor);
  };
  if (!enabled || !sheet) {
    setActive(false);
    return restore;
  }

  // innerHeight and VisualViewport shrink with Safari's controls, even while
  // content is still painted beneath them. Measure the large viewport plus
  // its bottom inset so expanding controls cannot prematurely clear the color.
  const paintProbe = document.createElement("div");
  paintProbe.setAttribute("aria-hidden", "true");
  paintProbe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;" +
    "box-sizing:content-box;padding-bottom:env(safe-area-inset-bottom);" +
    "visibility:hidden;pointer-events:none;contain:strict;overflow:hidden";
  document.body.append(paintProbe);
  const viewport = window.visualViewport;
  let disposed = false;
  let previousTop: number | null = null;
  let previousTime = 0;
  let approachLead = 48;
  const sync = () => {
    if (disposed) return;
    const painted = getSafeAreaPaintViewport(
      window.innerHeight, root.clientHeight, viewport,
      paintProbe.getBoundingClientRect().height,
    );
    const bounds = sheet.getBoundingClientRect();
    const now = performance.now();
    const movement = previousTop === null ? 0 : bounds.top - previousTop;
    const elapsed = now - previousTime;
    // Safari can advance its scrolling layer before delivering the next event.
    // Prepare about three frames ahead during a fast approach, with a hard cap.
    // Keep that lead while approaching so deceleration cannot flash it back off.
    // Reversing away immediately restores the normal, fully-offscreen exit edge.
    if (movement > 0.5 || (elapsed > 120 && active !== true)) {
      approachLead = 48;
    }
    if (movement < -0.5 && elapsed > 0 && elapsed <= 120) {
      approachLead = Math.max(approachLead, Math.min(256, -movement / Math.max(8, elapsed) * 60));
    }
    if (movement !== 0 || previousTop === null) {
      previousTop = bounds.top;
      previousTime = now;
    }
    setActive(shouldUseFooterSafeAreaColor(bounds, painted, active === true, approachLead));
  };

  // Scroll events already arrive at the rendering boundary. Deferring this
  // write to another animation frame lets Safari sample the previous color.
  // Unchanged states cause no style or theme writes.
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("pageshow", sync);
  viewport?.addEventListener("scroll", sync, { passive: true });
  viewport?.addEventListener("resize", sync, { passive: true });
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
  resizeObserver?.observe(sheet);
  resizeObserver?.observe(paintProbe);
  if (sheet.parentElement) resizeObserver?.observe(sheet.parentElement);
  const intersectionObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(sync, {
    threshold: 0,
    rootMargin: "64px 0px",
  });
  intersectionObserver?.observe(sheet);
  sync();

  return () => {
    disposed = true;
    window.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.removeEventListener("pageshow", sync);
    viewport?.removeEventListener("scroll", sync);
    viewport?.removeEventListener("resize", sync);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    paintProbe.remove();
    restore();
  };
}
