/** Keep one painted title toolbar at its resting position for the whole step.
 * Render it in the document's retained canvas, not Safari's fixed-layer tree,
 * which can withhold covered fixed layers until keyboard dismissal completes. */
export function installPublishKeyboardDock(dock: HTMLElement | null, input: HTMLInputElement | null) {
  const viewport = window.visualViewport;
  if (!dock || !input || !viewport) return;
  const canvas = dock.parentElement;
  const canvasHeight = canvas?.style.getPropertyValue("height") ?? "";

  const properties = ["position", "top", "bottom", "height", "padding-bottom", "--publish-document-pan"] as const;
  let saved: Array<{ name: string; value: string; priority: string }> | null = null;
  let anchor: { top: number; height: number; paddingBottom: string; scrollY: number } | null = null;
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
    dock.style.setProperty("position", "absolute");
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
    // The containing canvas must stay full-sized while Safari shrinks the
    // visible viewport. Otherwise its paint clip would hide the covered tools.
    if (canvas) canvas.style.setProperty("height", `${canvas.getBoundingClientRect().height}px`);
    // Capture before any tap starts Safari's chrome/keyboard transition, not
    // on focusin (which can arrive after the fixed viewport has already moved).
    anchor = { top: bounds.top - Math.max(0, viewport.offsetTop), height: bounds.height,
      paddingBottom: computed.paddingBottom, scrollY: window.scrollY };
    pin();
  };

  const syncDocumentPan = () => {
    if (!anchor) return;
    const pan = `${window.scrollY - anchor.scrollY}px`;
    if (dock.style.getPropertyValue("--publish-document-pan") !== pan) {
      dock.style.setProperty("--publish-document-pan", pan);
    }
  };

  const sync = () => {
    // Only a real responsive width change can replace the resting geometry.
    // Keyboard resize, blur, dismissal and refocus leave the layer untouched.
    if (window.innerWidth !== restingWidth) restore();
    capture();
    syncDocumentPan();
  };

  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("scroll", syncDocumentPan);
  viewport.addEventListener("resize", sync);
  return () => {
    window.removeEventListener("resize", sync);
    window.removeEventListener("scroll", syncDocumentPan);
    viewport.removeEventListener("resize", sync);
    restore();
  };
}
