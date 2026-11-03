"use client";

import { useContext, useLayoutEffect, useRef, useState } from "react";
import { watchCoverImage } from "@/app/lib/cover-entrance";
import { getLibraryCoverSrc } from "@/app/lib/reader-image";
import { LibraryCoverLoadingContext } from "./LibraryCoverLoading";

/** Keep a pulsing cover in place until decoded pixels can replace it. */
export function LibraryCoverImage({ src, alt, aspectRatio, eager, order = 0 }: {
  src: string; alt: string; aspectRatio?: number; eager: boolean; order?: number;
}) {
  const thumbnailSrc = getLibraryCoverSrc(src);
  const queue = useContext(LibraryCoverLoadingContext);
  const imageRef = useRef<HTMLImageElement>(null);
  const orderRef = useRef(order);
  useLayoutEffect(() => { orderRef.current = order; }, [order]);
  const [settled, setSettled] = useState<{ src: string; ready: boolean; ratio: number } | null>(null);
  const current = settled?.src === src ? settled : null;
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let unwatch: (() => void) | undefined;
    const start = (done: () => void) => {
      // No src is exposed to the browser until this cover's turn. The queue
      // follows recency across columns instead of column-major DOM order.
      if (queue) image.src = thumbnailSrc;
      unwatch = watchCoverImage(image,
        () => { setSettled({ src, ready: true, ratio: image.naturalWidth / image.naturalHeight }); done(); },
        () => { setSettled({ src, ready: false, ratio: 1 }); done(); });
    };
    const cancel = queue ? queue.add(() => orderRef.current, start) : (start(() => {}), undefined);
    return () => {
      unwatch?.();
      cancel?.();
      // Do not leave old-tab downloads competing with the newly selected tab.
      if (queue) image.removeAttribute("src");
    };
  }, [src, thumbnailSrc, queue]);
  const ready = current?.ready === true;
  return <div className="library-cover library-cover-image" data-cover-state={ready ? "ready" : current ? "error" : "loading"}
    style={{ aspectRatio: String(ready ? current.ratio : aspectRatio || 1) }}>
    <span className="library-cover-placeholder" aria-hidden="true" />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={imageRef} src={queue ? undefined : thumbnailSrc} alt={alt}
      loading={queue || eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "low"} decoding="async" />
  </div>;
}
