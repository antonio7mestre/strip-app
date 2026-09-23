/** A fixed sign-in canvas sized to the visible space above Safari's keyboard. */
export function installAuthFormViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  // The collage's positive scroll anchor lets stickers cross Safari's status
  // bar. Keep that same canvas for the entire form, not just their flight:
  // switching the body to fixed/resetting scroll mid-keyboard repaints it one
  // safe-area inset lower for a frame in WebKit.
  const anchorInset = Number.parseFloat(root.style.getPropertyValue("--auth-flight-inset")) || 0;
  const anchored = anchorInset > 0;
  const theme = document.getElementById("strip-theme-color");
  const themeName = theme?.getAttribute("name");
  // Like the collage, let Safari sample the continuous canvas instead of
  // painting a separate theme-color band above phone, code or username.
  theme?.removeAttribute("name");
  const preventPan = (event: Event) => event.preventDefault();
  if (anchored) {
    root.style.setProperty("--auth-form-anchor-inset", `${anchorInset}px`);
    root.classList.add("auth-form-anchored");
    document.addEventListener("touchmove", preventPan, { passive: false });
    document.addEventListener("wheel", preventPan, { passive: false });
  }
  const sync = () => {
    // Follow the keyboard at normal scale, with a fallback for system magnification.
    const normalScale = !viewport || viewport.scale === 1;
    const height = normalScale && viewport ? viewport.height : window.innerHeight;
    const top = normalScale && viewport ? Math.max(0, viewport.offsetTop) : 0;
    root.style.setProperty("--auth-viewport-height", `${height}px`);
    root.style.setProperty("--auth-viewport-top", `${top}px`);
    root.style.setProperty("--auth-document-top", `${window.scrollY + top}px`);
    // Keep the same mobile geometry while iOS swaps numeric/alphabetic
    // keyboards. Its temporary full-height viewport must not expand the form.
    root.classList.toggle("auth-form-compact", window.innerWidth <= 600 || height < 520);
  };
  root.classList.add("auth-form-active");
  sync();
  viewport?.addEventListener("resize", sync);
  viewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("scroll", sync, { passive: true });
  return () => {
    viewport?.removeEventListener("resize", sync);
    viewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.removeEventListener("scroll", sync);
    root.classList.remove("auth-form-active", "auth-form-compact", "auth-form-anchored");
    root.style.removeProperty("--auth-form-anchor-inset");
    root.style.removeProperty("--auth-viewport-height");
    root.style.removeProperty("--auth-viewport-top");
    root.style.removeProperty("--auth-document-top");
    if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
    if (anchored) {
      document.removeEventListener("touchmove", preventPan);
      document.removeEventListener("wheel", preventPan);
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  };
}
