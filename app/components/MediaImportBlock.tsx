import type { CSSProperties } from "react";
import type { MediaImportProgress } from "@/app/lib/media-import";

/** One quiet, full-width block while the ordered batch is being prepared. */
export function MediaImportBlock({ progress }: { progress: MediaImportProgress }) {
  const total = Math.max(1, progress.total);
  const completed = Math.min(total, Math.max(0, progress.completed));
  return <section className="strip-block media-import-block" role="status" aria-live="polite" aria-atomic="true"
    aria-label={`Adding media ${completed} of ${total}`} aria-busy="true"
    style={{ "--media-import-progress": `${completed / total * 100}%` } as CSSProperties}>
    <h2>Adding media</h2>
    <div className="media-import-block-bottom" aria-hidden="true">
      <span className="media-import-block-count">{completed}<span> / {total}</span></span>
      <span className="media-import-block-track"><span className="media-import-block-fill" /></span>
    </div>
  </section>;
}
