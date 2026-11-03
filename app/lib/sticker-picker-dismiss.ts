/** Consume an outside gesture before the editor can select, drag, or focus.
 * Keep the tray mounted until click so releasing a touch cannot click through
 * to a newly exposed block. The same close action is used by the tray's X. */
export function installStickerPickerDismiss(
  getSurfaces: () => Array<HTMLElement | null>,
  onClose: () => void,
) {
  const intercept = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Node) || getSurfaces().some(surface => surface?.contains(target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") onClose();
  };
  const events = ["pointerdown", "pointerup", "mousedown", "mouseup", "click"] as const;
  for (const name of events) document.addEventListener(name, intercept, true);
  return () => {
    for (const name of events) document.removeEventListener(name, intercept, true);
  };
}
