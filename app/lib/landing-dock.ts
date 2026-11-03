import { COVER_DOCK_DROP_MS } from "./cover-entrance";
import { scribbleSurfaceBounds } from "./scribble-entrance";

/** Match the existing rise's distance, 420ms duration and cubic ease-out, but
 * animate a transform on the live fixed tray. Safari owns its viewport anchor
 * throughout browser-chrome movement and a reader-to-landing scroll reset. */
export function enterLandingDock(dock: HTMLElement, onComplete: () => void) {
  // Measure the final fixed position, not the CSS pre-paint hidden transform.
  // This all happens in one layout effect before the browser can paint.
  dock.style.transform = "none";
  const bounds = dock.getBoundingClientRect();
  const surface = scribbleSurfaceBounds({
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width, screenHeight: window.screen.height,
    landscape: window.innerWidth > window.innerHeight,
    isPhone: /iPhone|iPod/.test(navigator.userAgent),
    safeTop: 0, scrollY: 0,
  });
  const distance = Math.max(0, surface.top + surface.height + 8 - bounds.top);
  let disposed = false;
  const animation = dock.animate([
    { transform: `translate3d(0, ${distance}px, 0)` },
    { transform: "translate3d(0, 0, 0)" },
  ], { duration: COVER_DOCK_DROP_MS, easing: "cubic-bezier(.333333, 1, .666667, 1)", fill: "both" });
  dock.style.removeProperty("transform");
  void animation.finished.then(() => {
    if (disposed) return;
    onComplete();
    animation.cancel();
  }, () => { /* Leaving the landing cancels without touching the next screen. */ });
  return () => { disposed = true; animation.cancel(); };
}
