export const READER_CREATE_PARAM = "from-strip";

/** Public arrival presentation only. Private tools still use verified account routing. */
export function readerCreateEntry(search: string) {
  const value = new URLSearchParams(search).get(READER_CREATE_PARAM);
  return value === "landing" || value === "editor" ? value : null;
}

export function readerCreateUrl(origin: string, id: string, signedIn: boolean) {
  const url = new URL(signedIn ? `/edit/${encodeURIComponent(id)}` : "/start", origin);
  url.searchParams.set(READER_CREATE_PARAM, signedIn ? "editor" : "landing");
  return url;
}

/** Paint the destination before hydration, not the last draft's stale color. */
export const READER_CREATE_PAINT_SCRIPT = `(() => {
  try {
    const entry = /^\\/start\\/?$/.test(location.pathname) ? "landing" : new URLSearchParams(location.search).get("from-strip");
    if ((!/^\\/start\\/?$/.test(location.pathname) && !/^\\/edit\\/[a-zA-Z0-9_-]{8,128}\\/?$/.test(location.pathname)) ||
        (entry !== "landing" && entry !== "editor")) return;
    const root = document.documentElement;
    const color = entry === "landing" ? "#304dff" : "#000000";
    root.dataset.readerCreateEntry = entry;
    if (entry === "landing") {
      root.dataset.authLanding = "";
      document.getElementById("strip-theme-color")?.removeAttribute("name");
    }
    root.style.backgroundColor = color;
    root.style.setProperty("--top-safe-area-color", color);
    root.style.setProperty("--bottom-safe-area-color", entry === "landing" ? "#ffffff" : color);
    document.getElementById("strip-theme-color")?.setAttribute("content", color);
  } catch {}
})();`;
