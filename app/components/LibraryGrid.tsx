"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LibraryCoverLoading } from "./LibraryCoverLoading";

export const LIBRARY_BATCH_SIZE = 24;

/** Mount only the first batch on a tab switch. Keep existing cards mounted as
 * more are revealed, so loading another batch never restarts their images. */
export function LibraryGrid<T>({ items, label, renderCard }: {
  items: T[]; label: string; renderCard: (item: T) => ReactNode;
}) {
  const [limit, setLimit] = useState(LIBRARY_BATCH_SIZE);
  const moreRef = useRef<HTMLButtonElement>(null);
  const hasMore = limit < items.length;
  useEffect(() => {
    const more = moreRef.current;
    if (!hasMore || !more || typeof IntersectionObserver === "undefined") return;
    let requested = false;
    const observer = new IntersectionObserver(entries => {
      if (requested || !entries.some(entry => entry.isIntersecting)) return;
      requested = true;
      // One batch per observation, including repeated notifications while the
      // previous batch is being committed.
      observer.disconnect();
      setLimit(current => Math.min(items.length, current + LIBRARY_BATCH_SIZE));
    }, { rootMargin: "1000px 0px" });
    observer.observe(more);
    return () => observer.disconnect();
  }, [hasMore, items.length, limit]);
  const visible = items.slice(0, limit);
  return <>
    <LibraryCoverLoading><div className="library-grid" aria-label={label} aria-busy="false" data-total-items={items.length}>
      {[0, 1].map(column => <div className="library-column" key={column}>
        {visible.filter((_, index) => index % 2 === column).map(renderCard)}
      </div>)}
    </div></LibraryCoverLoading>
    {hasMore ? <button ref={moreRef} type="button" className="library-load-more"
      onClick={() => setLimit(current => Math.min(items.length, current + LIBRARY_BATCH_SIZE))}>
      More Strips
    </button> : null}
  </>;
}
