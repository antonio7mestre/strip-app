/** Keep tray dimensions stable, but anchor their container to the visible
 * screen edge. WKWebView can change visualViewport.offsetTop on direction
 * changes even when innerHeight is unchanged. Freezing both values leaves
 * the pill floating above the bottom after the first swipe. */
export function installInstagramDockViewport() {
  const root = document.documentElement;
  if (root.dataset.inAppBrowser !== "instagram") return;
  const properties = ["--instagram-dock-viewport-height", "--instagram-dock-safe-bottom", "--instagram-dock-viewport-bottom"];
  const previous = properties.map(name => root.style.getPropertyValue(name));
  const viewport = window.visualViewport;
  let width = window.innerWidth;
  let restingHeight = window.innerHeight;
  let lastBottom = -1;
  const capture = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom);width:0";
    root.appendChild(probe);
    const safeBottom = probe.getBoundingClientRect().height;
    probe.remove();
    restingHeight = window.innerHeight;
    root.style.setProperty(properties[0], `${restingHeight}px`);
    root.style.setProperty(properties[1], `${safeBottom}px`);
  };
  const anchor = () => {
    const height = viewport?.height ?? window.innerHeight;
    // Keep the existing keyboard behavior: the main pill remains behind it.
    // A keyboard-sized contraction or native pinch is not browser chrome.
    if (Math.abs((viewport?.scale ?? 1) - 1) > 0.01 || height < restingHeight - 120) return;
    const bottom = height + (viewport?.offsetTop ?? 0);
    if (bottom <= 0 || bottom === lastBottom) return;
    lastBottom = bottom;
    root.style.setProperty(properties[2], `${bottom}px`);
  };
  const resize = () => {
    if (Math.abs(window.innerWidth - width) >= 24) {
      width = window.innerWidth;
      capture();
    }
    anchor();
  };
  capture();
  anchor();
  window.addEventListener("resize", resize);
  window.addEventListener("pageshow", resize);
  viewport?.addEventListener("resize", anchor);
  viewport?.addEventListener("scroll", anchor, { passive: true });
  return () => {
    window.removeEventListener("resize", resize);
    window.removeEventListener("pageshow", resize);
    viewport?.removeEventListener("resize", anchor);
    viewport?.removeEventListener("scroll", anchor);
    properties.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index]);
      else root.style.removeProperty(name);
    });
  };
}
