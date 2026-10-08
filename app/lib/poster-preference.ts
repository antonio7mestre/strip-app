import { POSTER_DESIGNS } from "./share-posters";

export const POSTER_PREFERENCE_KEY = "strip-story-poster-design";
export function posterDesignOrder(preferred: string | null) {
  const indices = POSTER_DESIGNS.map((_, index) => index);
  const first = POSTER_DESIGNS.findIndex(design => design.id === preferred);
  return first < 0 ? indices : [first, ...indices.filter(index => index !== first)];
}

export function readPosterPreference() {
  if (typeof window === "undefined") return null;
  try {
    const cookie = document.cookie.split(";").map(value => value.trim())
      .find(value => value.startsWith(`${POSTER_PREFERENCE_KEY}=`));
    if (cookie) return decodeURIComponent(cookie.slice(POSTER_PREFERENCE_KEY.length + 1));
    return window.localStorage.getItem(POSTER_PREFERENCE_KEY);
  } catch { return null; }
}

/** Record completed saves/shares, never browsing or cancelled native sheets. */
export function rememberPosterDesign(id: string) {
  if (typeof window === "undefined" || !POSTER_DESIGNS.some(design => design.id === id)) return;
  try { window.localStorage.setItem(POSTER_PREFERENCE_KEY, id); } catch { /* Preferences are optional. */ }
  try {
    // Follow the signed-in user between their profile and other authors' Strips.
    const sharedDomain = /(^|\.)striiip\.com$/i.test(window.location.hostname) ? "; Domain=striiip.com" : "";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${POSTER_PREFERENCE_KEY}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${sharedDomain}${secure}`;
  } catch { /* Sharing still succeeds when browser storage is unavailable. */ }
}
