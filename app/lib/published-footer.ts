/** Reserve the controls' natural height. The content canvas, not a moving clip,
 * uncovers the fixed layer. No scroll handler, translation or bounce offset. */
export function installPublishedFooterReveal(sheet: HTMLElement) {
  if (!sheet.closest(".is-strip-reader")) return;
  const controls = sheet.querySelector<HTMLElement>(".strip-ending-card-inner");
  if (!controls) return;
  const backing = sheet.closest<HTMLElement>(".published-strip, .editor-canvas");
  let disposed = false;
  const measure = () => {
    if (disposed) return;
    const height = `${controls.getBoundingClientRect().height}px`;
    sheet.style.setProperty("--published-footer-content-height", height);
    // The document backing must already be white throughout the footer, even
    // before WebKit paints the separately scrolling footer surface on a fling.
    backing?.style.setProperty("--published-footer-content-height", height);
  };
  measure();
  sheet.setAttribute("data-fixed-footer-reveal", "");
  const observer = new ResizeObserver(measure);
  observer.observe(controls);
  return () => {
    disposed = true;
    observer.disconnect();
    sheet.removeAttribute("data-fixed-footer-reveal");
    sheet.style.removeProperty("--published-footer-content-height");
    backing?.style.removeProperty("--published-footer-content-height");
  };
}
