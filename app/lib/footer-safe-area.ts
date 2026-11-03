type VerticalBounds = { top: number; bottom: number };

const COLOR_FADE_MS = 260;
const FOOTER_COLOR_LEAD = 48;

export function mixSafeAreaColors(from: string, to: string, progress: number) {
  const parse = (color: string) => /^#[a-f\d]{6}$/i.test(color)
    ? [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16)) : null;
  const a = parse(from), b = parse(to);
  if (!a || !b) return to;
  const t = Math.max(0, Math.min(1, progress));
  const eased = t * t * (3 - 2 * t);
  return "#" + a.map((channel, index) => Math.round(channel + (b[index] - channel) * eased)
    .toString(16).padStart(2, "0")).join("");
}

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

/** The footer is the only trigger, at the same edge in both directions. */
export function shouldUseFooterSafeAreaColor(footer: VerticalBounds, viewport: VerticalBounds) {
  return footer.top <= viewport.bottom + FOOTER_COLOR_LEAD &&
    footer.bottom >= viewport.top - FOOTER_COLOR_LEAD;
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
  const instagramReader = root.getAttribute?.("data-in-app-browser") === "instagram" &&
    (activeClassName === "published-bottom-sheet-canvas-active" || activeClassName === "preview-bottom-canvas-active");
  const footerColor = instagramReader ? "#FFFFFF" : bottomColor;
  const theme = document.querySelector<HTMLMetaElement>("#strip-theme-color");
  let active: boolean | null = null;
  let colorFrame: number | null = null;
  let paintedColor = topColor;
  const cancelColorFade = () => {
    if (colorFrame !== null) window.cancelAnimationFrame(colorFrame);
    colorFrame = null;
    root.style.removeProperty("--reader-safe-area-color");
  };
  const paintColor = (target: string, animate: boolean) => {
    const from = paintedColor;
    cancelColorFade();
    if (!animate || from.toLowerCase() === target.toLowerCase()) {
      paintedColor = target;
      theme?.setAttribute("content", target);
      return;
    }
    const started = performance.now();
    root.style.setProperty("--reader-safe-area-color", from);
    const tick = () => {
      colorFrame = null;
      if (root.hasAttribute?.("data-auth-canvas") || root.classList.contains("preview-bottom-handoff-active")) {
        cancelColorFade();
        return;
      }
      const progress = Math.min(1, (performance.now() - started) / COLOR_FADE_MS);
      paintedColor = progress >= 1 ? target : mixSafeAreaColors(from, target, progress);
      root.style.setProperty("--reader-safe-area-color", paintedColor);
      theme?.setAttribute("content", paintedColor);
      if (progress < 1) colorFrame = window.requestAnimationFrame(tick);
      else root.style.removeProperty("--reader-safe-area-color");
    };
    colorFrame = window.requestAnimationFrame(tick);
  };
  const setActive = (next: boolean, completeNow = false) => {
    if (active === next) {
      if (completeNow && colorFrame !== null) paintColor(next ? footerColor : topColor, false);
      return;
    }
    const animate = active !== null;
    active = next;
    root.classList.toggle(activeClassName, next);
    if (root.classList.contains("preview-bottom-handoff-active")) { cancelColorFade(); return; }
    root.style.setProperty("--bottom-safe-area-color", footerColor);
    paintColor(next ? footerColor : topColor, animate && !completeNow && !instagramReader);
  };
  const restore = () => {
    cancelColorFade();
    root.classList.remove(activeClassName);
    if (root.hasAttribute?.("data-auth-canvas") || root.classList.contains("preview-bottom-handoff-active")) return;
    root.style.setProperty("--bottom-safe-area-color", defaultColor);
    theme?.setAttribute("content", topColor);
  };
  if (!enabled || !sheet) {
    setActive(false);
    return restore;
  }

  // Use the full painted viewport, not the smaller area above Safari's controls.
  // Otherwise revealing those controls can briefly switch a visible footer back
  // to the top color before the next scroll event.
  const paintProbe = document.createElement("div");
  paintProbe.setAttribute("aria-hidden", "true");
  paintProbe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;" +
    "box-sizing:content-box;padding-bottom:env(safe-area-inset-bottom);" +
    "visibility:hidden;pointer-events:none;contain:strict;overflow:hidden";
  document.body.append(paintProbe);
  const viewport = window.visualViewport;
  let disposed = false;
  const sync = () => {
    if (disposed || root.hasAttribute?.("data-auth-canvas")) return;
    const painted = getSafeAreaPaintViewport(
      window.innerHeight, root.clientHeight, viewport, paintProbe.getBoundingClientRect().height,
    );
    const bounds = sheet.getBoundingClientRect();
    const next = shouldUseFooterSafeAreaColor(bounds, painted);
    // Retain Saturday's gentle approach fade only while the footer is offscreen.
    // Once any footer is painted, finish its color in this event. A fast jump or
    // reversal must never leave the first color in a pending frame at the bottom.
    setActive(next, next ? bounds.top <= painted.bottom : window.scrollY <= 0);
  };
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
    rootMargin: FOOTER_COLOR_LEAD + "px 0px",
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
