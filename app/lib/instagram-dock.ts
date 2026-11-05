/** Keep Instagram trays at one resting screen position across flow steps.
 * Browser chrome, keyboard and scrolling cannot resize this geometry. Only
 * a substantial width change (rotation or split view) establishes a new resting viewport. */
export function installInstagramDockViewport() {
  const root = document.documentElement;
  if (root.dataset.inAppBrowser !== "instagram") return;
  const properties = ["--instagram-dock-viewport-height", "--instagram-dock-safe-bottom"];
  const previous = properties.map(name => root.style.getPropertyValue(name));
  let width = window.innerWidth;
  const capture = () => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom);width:0";
    root.appendChild(probe);
    const safeBottom = probe.getBoundingClientRect().height;
    probe.remove();
    root.style.setProperty(properties[0], `${window.innerHeight}px`);
    root.style.setProperty(properties[1], `${safeBottom}px`);
  };
  const resize = () => {
    if (Math.abs(window.innerWidth - width) < 24) return;
    width = window.innerWidth;
    capture();
  };
  capture();
  window.addEventListener("resize", resize);
  return () => {
    window.removeEventListener("resize", resize);
    properties.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index]);
      else root.style.removeProperty(name);
    });
  };
}
