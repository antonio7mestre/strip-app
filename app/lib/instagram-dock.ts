/** Instagram resizes its webview while scrolling. Use one resting viewport for
 * editor/home tools, not a new bottom anchor on each scroll/chrome frame.
 * Tool expansion still uses its existing animated height. No scroll listener,
 * scroll lock, safe-area paint, or changes to Safari/landing/reader behavior. */
export function installInstagramDockViewport() {
  const root = document.documentElement;
  if (root.dataset.inAppBrowser !== "instagram") return;
  const property = "--instagram-dock-viewport-height";
  const previous = root.style.getPropertyValue(property);
  let width = window.innerWidth;
  const capture = () => root.style.setProperty(property, `${window.innerHeight}px`);
  const resize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    capture();
  };
  capture();
  window.addEventListener("resize", resize);
  return () => {
    window.removeEventListener("resize", resize);
    if (previous) root.style.setProperty(property, previous);
    else root.style.removeProperty(property);
  };
}
