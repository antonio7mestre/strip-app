import type { CSSProperties } from "react";
import type { MediaImportProgress } from "@/app/lib/media-import";

/** One quiet, full-width block while the ordered batch is being prepared. */
export function MediaImportBlock({ progress, handoff }: {
  progress: MediaImportProgress;
  handoff?: "waiting" | "revealing";
}) {
  const total = Math.max(1, progress.total);
  const completed = Math.min(total, Math.max(0, progress.completed));
  return <section className={`strip-block media-import-block${handoff ? " is-handoff" : ""}${handoff === "revealing" ? " is-revealing" : ""}`} role="status" aria-live="polite" aria-atomic="true"
    aria-label={`Adding media ${completed} of ${total}`} aria-busy="true"
    style={{ "--media-import-progress": `${completed / total * 100}%` } as CSSProperties}>
    <div className="media-import-block-content">
      <h2>Adding media<span className="media-import-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></h2>
      <div className="media-import-block-bottom" aria-hidden="true">
        <span className="media-import-block-count">{completed}<span> / {total}</span></span>
        <span className="media-import-block-track"><span className="media-import-block-fill" /></span>
      </div>
    </div>
  </section>;
}
