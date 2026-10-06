/** Preserve the title toolbar's pre-keyboard geometry. A bottom-anchored fixed
 * layer can retain Safari's expanded layout viewport after keyboard dismissal.
 * The editor's shared pan compensation still follows the visual viewport. */
export function installPublishKeyboardDock(dock: HTMLElement | null, input: HTMLInputElement | null) {
  const viewport = window.visualViewport;
  if (!dock || !input || !viewport) return;

  const properties = ["top", "bottom", "height", "padding-bottom"] as const;
  let saved: Array<{ name: string; value: string; priority: string }> | null = null;
  let anchor: { top: number; height: number; paddingBottom: string } | null = null;
  let restingHeight = viewport.height;
  let restingWidth = window.innerWidth;
  let releaseFrame = 0;
  let disposed = false;

  const restoreProperties = () => {
    if (!saved) return;
    for (const { name, value, priority } of saved) {
      if (value) dock.style.setProperty(name, value, priority);
      else dock.style.removeProperty(name);
    }
  };
  const restore = () => {
    window.cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    restoreProperties();
    saved = null;
    anchor = null;
  };
  const pin = () => {
    if (!anchor) return;
    dock.style.setProperty("top", `${anchor.top}px`);
    dock.style.setProperty("bottom", "auto");
    dock.style.setProperty("height", `${anchor.height}px`);
    dock.style.setProperty("padding-bottom", anchor.paddingBottom);
  };

  const capture = () => {
    if (saved || viewport.scale !== 1) return;
    const bounds = dock.getBoundingClientRect();
    if (!bounds.height) return;
    const computed = getComputedStyle(dock);
    restingHeight = viewport.height;
    restingWidth = window.innerWidth;
    saved = properties.map(name => ({ name, value: dock.style.getPropertyValue(name),
      priority: dock.style.getPropertyPriority(name) }));
    // Top anchoring cannot drift with a stale layout-viewport bottom. Keep the
    // browser/safe-area padding captured too, so the buttons never recenter.
    anchor = { top: bounds.top - Math.max(0, viewport.offsetTop), height: bounds.height,
      paddingBottom: computed.paddingBottom };
    pin();
  };

  const canRelease = () => document.activeElement !== input && viewport.scale === 1
    && viewport.height >= restingHeight - 80 && Math.abs(viewport.offsetTop) < 1;
  const sync = () => {
    window.cancelAnimationFrame(releaseFrame);
    releaseFrame = 0;
    // A real width/orientation change needs the new responsive geometry.
    if (saved && window.innerWidth !== restingWidth) restore();
    if (document.activeElement === input) { capture(); return; }
    // Blur is not keyboard dismissal. Wait for the viewport to return, then
    // confirm it on two paint frames rather than on the first resize event.
    if (!saved || !canRelease()) return;
    releaseFrame = window.requestAnimationFrame(() => {
      if (disposed || !canRelease()) return;
      releaseFrame = window.requestAnimationFrame(() => {
        if (disposed || !canRelease() || !anchor) return;
        // Safari can report a recovered visual viewport before its fixed
        // containing block returns. Measure the CSS position before releasing
        // the anchor. If it still drifts, keep the buttons at their known spot.
        restoreProperties();
        const top = dock.getBoundingClientRect().top - Math.max(0, viewport.offsetTop);
        if (Math.abs(top - anchor.top) <= 1) restore();
        else pin();
      });
    });
  };

  sync();
  window.addEventListener("focusin", sync);
  window.addEventListener("focusout", sync);
  window.addEventListener("resize", sync);
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
  return () => {
    disposed = true;
    window.removeEventListener("focusin", sync);
    window.removeEventListener("focusout", sync);
    window.removeEventListener("resize", sync);
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    restore();
  };
}
