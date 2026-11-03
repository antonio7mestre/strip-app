/** A UI hint only. A missing marker must retain the normal browser behavior. */
const INSTAGRAM_BROWSER_MARKER = /\bInstagram(?:[ /]|$)/i;

export function isInstagramInAppBrowser(userAgent: string) {
  return INSTAGRAM_BROWSER_MARKER.test(userAgent);
}

// Run before the first paint, including cached HTML and client-side navigation.
// Never use the referrer: arriving from Instagram is not the same as its browser.
export const IN_APP_BROWSER_SCRIPT = `(() => {
  if (${INSTAGRAM_BROWSER_MARKER}.test(navigator.userAgent)) {
    document.documentElement.setAttribute("data-in-app-browser", "instagram");
  }
})();`;
