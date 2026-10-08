// Best-effort app handoff. Instagram owns this route and may change it.
// It opens story creation, not the feed's library composer. A website cannot
// supply a Photos LocalIdentifier or preselect the image saved by Web Share.
export const INSTAGRAM_STORY_CAMERA_URL = "instagram://story-camera";

export function instagramStoryCameraUrl(userAgent: string) {
  if (/Android/i.test(userAgent)) {
    return "intent://story-camera#Intent;scheme=instagram;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fwww.instagram.com%2F;end";
  }
  return INSTAGRAM_STORY_CAMERA_URL;
}
