import type { CSSProperties } from "react";
import type { MediaImportProgress } from "@/app/lib/media-import";

/** Confirmation-style feedback, separate from the Strip's content and layout. */
export function MediaImportPopup({ progress, revealing = false }: {
  progress: MediaImportProgress;
  revealing?: boolean;
}) {
  const total = Math.max(1, progress.total);
  const completed = Math.min(total, Math.max(0, progress.completed));
  return <div className={`confirmation-backdrop media-import-popup${revealing ? " is-revealing" : ""}`}>
    <section className="confirmation-card media-import-card" role="status" aria-live="polite" aria-atomic="true"
    aria-label={`Adding media ${completed} of ${total}`} aria-busy="true"
    style={{ "--media-import-progress": `${completed / total * 100}%` } as CSSProperties}>
      <h2>Adding media<span className="media-import-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></h2>
      <div className="media-import-progress" aria-hidden="true">
        <span className="media-import-count">{completed}<span> / {total}</span></span>
        <span className="media-import-track"><span className="media-import-fill" /></span>
      </div>
    </section>
  </div>;
}
