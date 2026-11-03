export const LANDING_ART = {
  hero: ["/landing/story-friends.webp", "/landing/sticker-help-text.png", "/landing/sticker-help-arrow.png",
    "/landing/sticker-green-glasses.webp", "/landing/sticker-camera.webp", "/landing/sticker-flipphone.webp", "/landing/sticker-cursor.webp"],
  night: ["/landing/story-night.webp", "/sticker-pack/nature/white-daisy.webp"],
  make: ["/landing/cosmos-street.webp", "/landing/sticker-cassette.webp", "/landing/sticker-rollerskate.webp",
    "/landing/sticker-headphones.webp", "/landing/sticker-cd.webp"],
  share: ["/landing/cosmos-ocean.webp", "/landing/sticker-ticket-admit.webp", "/landing/sticker-cherries.webp",
    "/landing/sticker-shell.webp", "/landing/sticker-clip.webp"],
} as const;
export type LandingArtGroup = keyof typeof LANDING_ART;
const groups = new Map<LandingArtGroup, Promise<void>>();

/** Decode a complete collage, including the cutouts, before any shape appears.
 * A failed asset settles too; neither the text nor the CTA waits for artwork. */
export function prepareLandingArt(group: LandingArtGroup): Promise<void> {
  const cached = groups.get(group);
  if (cached) return cached;
  const ready = Promise.all(LANDING_ART[group].map(src => new Promise<void>(resolve => {
    const image = new Image();
    image.decoding = "async";
    const finish = () => { image.onload = null; image.onerror = null; resolve(); };
    image.onload = () => { void image.decode().catch(() => {}).then(finish); };
    image.onerror = finish;
    image.src = src;
  }))).then(() => {});
  groups.set(group, ready);
  return ready;
}
