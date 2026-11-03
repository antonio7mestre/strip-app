/** One live owner for the introduction's canvas and Safari edge extensions.
 * Release ownership, never restore a snapshot of the preceding Strip's color. */
export function retainAuthBrowserTheme(color: string, landing: boolean) {
  const root = document.documentElement;
  const body = document.body;
  const theme = document.getElementById("strip-theme-color");
  const paint = () => {
    root.dataset.authCanvas = "";
    if (landing) root.dataset.authLanding = "";
    else delete root.dataset.authLanding;
    root.classList.remove("profile-reload-pending");
    root.style.removeProperty("--profile-reload-background");
    root.style.removeProperty("--reader-safe-area-color");
    root.style.backgroundColor = color;
    body.style.backgroundColor = color;
    root.style.setProperty("--top-safe-area-color", color);
    root.style.setProperty("--bottom-safe-area-color", landing ? "#ffffff" : color);
    // Safari samples the blue top edge and the stationary white bottom surface,
    // rather than applying one cached theme-color to both browser surfaces.
    theme?.setAttribute("content", color);
    theme?.removeAttribute("name");
  };
  paint();
  window.addEventListener("pageshow", paint);
  return () => {
    window.removeEventListener("pageshow", paint);
    delete root.dataset.authCanvas;
    delete root.dataset.authLanding;
    if (root.dataset.readerCreateEntry === "landing") delete root.dataset.readerCreateEntry;
    body.style.removeProperty("background-color");
    root.style.removeProperty("--bottom-safe-area-color");
    theme?.setAttribute("name", "theme-color");
  };
}
