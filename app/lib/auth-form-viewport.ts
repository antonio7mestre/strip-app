/** A fixed sign-in canvas sized to the visible space above Safari's keyboard. */
export function installAuthFormViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const sync = () => {
    // Leave pinch zoom to the browser. At normal scale, cancel native viewport pan.
    const normalScale = !viewport || viewport.scale === 1;
    const height = normalScale && viewport ? viewport.height : window.innerHeight;
    const top = normalScale && viewport ? Math.max(0, viewport.offsetTop) : 0;
    root.style.setProperty("--auth-viewport-height", `${height}px`);
    root.style.setProperty("--auth-viewport-top", `${top}px`);
    root.classList.toggle("auth-form-compact", height < 520);
  };
  root.classList.add("auth-form-active");
  sync();
  viewport?.addEventListener("resize", sync);
  viewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  return () => {
    viewport?.removeEventListener("resize", sync);
    viewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    root.classList.remove("auth-form-active", "auth-form-compact");
    root.style.removeProperty("--auth-viewport-height");
    root.style.removeProperty("--auth-viewport-top");
  };
}
