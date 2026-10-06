/** Keep one painted title toolbar at its resting position for the whole step.
 * Do not switch its fixed anchor on focus/blur: Safari can discard the covered
 * layer and only paint it again after the keyboard has already disappeared. */
export function installPublishKeyboardDock(dock: HTMLElement | null, input: HTMLInputElement | null) {
  const viewport = window.visualViewport;
  if (!dock || !input || !viewport) return;

  const properties = ["top", "bottom", "height", "padding-bottom"] as const;
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
    restingWidth = window.innerWidth;
    saved = properties.map(name => ({ name, value: dock.style.getPropertyValue(name),
      priority: dock.style.getPropertyPriority(name) }));
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
    restore();
  };
}
