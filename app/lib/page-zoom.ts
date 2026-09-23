export function shouldLockPageZoom({
  view, authenticationRequired, authStatus, needsUsername,
}: {
  view: string;
  authenticationRequired: boolean;
  authStatus: string;
  needsUsername: boolean;
}) {
  return needsUsername || (authenticationRequired && authStatus !== "signed-in") ||
    ["library", "drafts", "history", "settings", "edit"].includes(view);
}

/** Lock browser magnification, not scrolling, taps, keyboard focus or sticker gestures. */
export function installPageZoomLock() {
  const root = document.documentElement;
  const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const originalViewport = viewportMeta?.getAttribute("content") ?? null;
  const parts = (originalViewport ?? "width=device-width, viewport-fit=cover")
    .split(",").filter((part) => !/^\s*(initial-scale|minimum-scale|maximum-scale|user-scalable)\s*=/.test(part));
  viewportMeta?.setAttribute("content", [...parts,
    "initial-scale=1", "minimum-scale=1", "maximum-scale=1", "user-scalable=no",
  ].join(", "));
  root.classList.add("page-zoom-locked");

  const preventZoom = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  const preventPinch = (event: TouchEvent) => {
    if (event.touches.length > 1) preventZoom(event);
  };
  const preventTrackpadPinch = (event: WheelEvent) => {
    if (event.ctrlKey) preventZoom(event);
  };
  const options = { passive: false, capture: true };
  // Safari ignores viewport zoom limits alone. Cancel its native pinch without
  // stopping propagation, so the editor can still resize/rotate a sticker.
  for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(name, preventZoom, options);
  }
  document.addEventListener("touchstart", preventPinch, options);
  document.addEventListener("touchmove", preventPinch, options);
  document.addEventListener("wheel", preventTrackpadPinch, options);

  return () => {
    root.classList.remove("page-zoom-locked");
    if (originalViewport === null) viewportMeta?.removeAttribute("content");
    else viewportMeta?.setAttribute("content", originalViewport);
    for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
      document.removeEventListener(name, preventZoom, true);
    }
    document.removeEventListener("touchstart", preventPinch, true);
    document.removeEventListener("touchmove", preventPinch, true);
    document.removeEventListener("wheel", preventTrackpadPinch, true);
  };
}
