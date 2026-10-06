/** Keep the title form and tools in one non-scrolling document for this step.
 * The high input avoids Safari's focus pan. Tools retain one captured top
 * position, without waiting for the late keyboard/viewport dismissal event. */
export function installPublishKeyboardDock(dock: HTMLElement | null, input: HTMLInputElement | null) {
  const viewport = window.visualViewport;
  if (!dock || !input || !viewport) return;
  const canvas = dock.parentElement;
  const canvasHeight = canvas?.style.getPropertyValue("height") ?? "";
  const root = document.documentElement;
  root.classList.add("publish-title-active");

  const properties = ["position", "top", "bottom", "height", "padding-bottom"] as const;
  let saved: Array<{ name: string; value: string; priority: string }> | null = null;
  let anchor: { top: number; height: number; paddingBottom: string } | null = null;
  let restingWidth = window.innerWidth;

  const restoreProperties = () => {
    if (!saved) return;
    for (const { name, value, priority } of saved) {
      if (value) dock.style.setProperty(name, value, priority);
      else dock.style.removeProperty(name);
    }
  };
  const restore = () => {
    restoreProperties();
    if (canvas) {
      if (canvasHeight) canvas.style.setProperty("height", canvasHeight);
      else canvas.style.removeProperty("height");
    }
    saved = null;
    anchor = null;
  };
  const pin = () => {
    if (!anchor) return;
    dock.style.setProperty("position", "fixed");
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
    restingWidth = window.innerWidth;
    saved = properties.map(name => ({ name, value: dock.style.getPropertyValue(name),
      priority: dock.style.getPropertyPriority(name) }));
    // Keep the document full-sized while Safari's visible viewport shrinks.
    if (canvas) canvas.style.setProperty("height", `${canvas.getBoundingClientRect().height}px`);
    // Capture before any tap starts Safari's chrome/keyboard transition, not
    // on focusin (which can arrive after the fixed viewport has already moved).
    anchor = { top: bounds.top - Math.max(0, viewport.offsetTop), height: bounds.height,
      paddingBottom: computed.paddingBottom };
    pin();
  };

  const sync = () => {
    // Only a real responsive width change can replace the resting geometry.
    // Keyboard resize, blur, dismissal and refocus leave the layer untouched.
    if (window.innerWidth !== restingWidth) restore();
    capture();
  };

  sync();
  window.addEventListener("resize", sync);
  viewport.addEventListener("resize", sync);
  return () => {
    window.removeEventListener("resize", sync);
    viewport.removeEventListener("resize", sync);
    root.classList.remove("publish-title-active");
    restore();
  };
}
