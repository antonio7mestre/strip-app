let scrollOwner: symbol | null = null;
let originalScrollRestoration: ScrollRestoration | null = null;
let scrollReleaseFrame = 0;

/** Commit the destination's opaque canvas and edge colors in one paint.
 * Never retain an outgoing reader picture: its black canvas/video frames can
 * blend over both the blue page and Safari's status area. Only the incoming
 * art and the independently mounted bottom tray animate. */
export function startReaderLandingTransition(commit: () => void) {
  const owner = Symbol();
  scrollOwner = owner;
  cancelAnimationFrame(scrollReleaseFrame);
  originalScrollRestoration ??= history.scrollRestoration;
  history.scrollRestoration = "manual";
  commit();
  const root = document.documentElement;
  const top = Math.max(0, Number.parseFloat(root.style.getPropertyValue("--leading-image-inset")) || 0);
  window.scrollTo({ top, left: 0, behavior: "instant" });
  return () => {
    // Native Back restores its old bottom offset after popstate handlers run.
    // Let the reader's top placement win that commit before releasing history.
    scrollReleaseFrame = requestAnimationFrame(() => {
      if (scrollOwner !== owner) return;
      history.scrollRestoration = originalScrollRestoration ?? "auto";
      originalScrollRestoration = null;
      scrollOwner = null;
    });
  };
}
