import type { EmptyStateKind } from "./empty-state-guide";

const decodedArtwork = new Map<string, Promise<boolean>>();

function decodeArtwork(src: string) {
  const cached = decodedArtwork.get(src);
  if (cached) return cached;
  const ready = new Promise<boolean>(resolve => {
    const image = new Image();
    image.onload = () => {
      void image.decode().then(() => resolve(image.naturalWidth > 0), () => resolve(image.naturalWidth > 0));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
  decodedArtwork.set(src, ready);
  void ready.then(loaded => { if (!loaded) decodedArtwork.delete(src); });
  return ready;
}

/** Reveal the two masks together, only after both have decoded. */
export function watchEmptyStateArtwork(kind: EmptyStateKind, onReady: () => void) {
  let disposed = false;
  const lettering = `/empty-states/${kind === "profile" ? "create-strip" : "starting-block"}.png`;
  void Promise.all([decodeArtwork(lettering), decodeArtwork("/landing/sticker-help-arrow.png")])
    .then(ready => { if (!disposed && ready.every(Boolean)) onReady(); });
  return () => { disposed = true; };
}
