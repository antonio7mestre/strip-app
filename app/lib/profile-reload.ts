// Only presentation geometry is persisted: no photos, titles, or Strip content.
export const PROFILE_RELOAD_KEY = "strip-profile-reload-v1";
export const PROFILE_PATHS = ["/", "/drafts", "/history", "/settings"];
export type ProfileFrame = { x: number; y: number; width: number; height: number; coverId?: string };
export type ProfileLayout = { width: number; height: number; frames: ProfileFrame[] };
type ProfileReload = { owner: string; background: string; pages: Record<string, ProfileLayout> };

export function readProfileReload(): ProfileReload | null {
  try {
    const data = JSON.parse(localStorage.getItem(PROFILE_RELOAD_KEY) || "null");
    if (!data || typeof data.owner !== "string" || !/^#[\da-f]{6}$/i.test(data.background) ||
        !data.pages || typeof data.pages !== "object" || Array.isArray(data.pages)) return null;
    return data;
  } catch { return null; }
}

export function readProfileLayout(path: string, width: number): ProfileLayout | null {
  const layout = readProfileReload()?.pages[path];
  if (!PROFILE_PATHS.includes(path) || !layout || Math.abs(layout.width - width) > 1 ||
      !Number.isFinite(layout.height) || layout.height <= 0 || !Array.isArray(layout.frames) ||
      layout.frames.length > 2000 || !layout.frames.every(frame =>
        frame && [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) &&
        frame.width > 0 && frame.height > 0 && frame.x >= 0 && frame.y >= 0)) return null;
  return layout;
}

export function saveProfileLayout(owner: string, background: string, path: string, layout: ProfileLayout) {
  if (!PROFILE_PATHS.includes(path) || !/^#[\da-f]{6}$/i.test(background)) return;
  try {
    const previous = readProfileReload();
    const pages = previous?.owner === owner ? previous.pages : {};
    localStorage.setItem(PROFILE_RELOAD_KEY, JSON.stringify({ owner, background, pages: { ...pages, [path]: layout } }));
  } catch { /* Private browsing or storage pressure must not block the page. */ }
}

export function saveProfileBackground(owner: string, background: string) {
  if (!owner || !/^#[\da-f]{6}$/i.test(background)) return;
  try {
    const previous = readProfileReload();
    localStorage.setItem(PROFILE_RELOAD_KEY, JSON.stringify({ owner, background,
      pages: previous?.owner === owner ? previous.pages : {} }));
  } catch {}
}

export function clearProfileReload() {
  try { localStorage.removeItem(PROFILE_RELOAD_KEY); } catch {}
}

export function cachedCoverRatio(id: string) {
  const pages = readProfileReload()?.pages;
  if (!pages) return undefined;
  for (const layout of Object.values(pages)) {
    const frame = layout && Array.isArray(layout.frames) ? layout.frames.find(frame => frame?.coverId === id) : null;
    if (frame && Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.width > 0 && frame.height > 0) return frame.width / frame.height;
  }
  return undefined;
}

// Runs in <head>, before either the body or React can paint a default canvas.
export const PROFILE_RELOAD_SCRIPT = `(() => { try {
  if (!["/", "/drafts", "/history", "/settings"].includes(location.pathname)) return;
  const saved = JSON.parse(localStorage.getItem("strip-profile-reload-v1") || "null");
  if (!saved || !/^#[\\da-f]{6}$/i.test(saved.background)) return;
  const root = document.documentElement;
  root.style.setProperty("--profile-reload-background", saved.background);
  root.style.setProperty("--top-safe-area-color", saved.background);
  root.style.backgroundColor = saved.background;
  root.classList.add("profile-reload-pending");
  document.getElementById("strip-theme-color")?.setAttribute("content", saved.background);
} catch {} })();`;
