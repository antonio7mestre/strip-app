import { AnimatedEllipsis } from "./AnimatedEllipsis";

/** Informational status stays separate from the bottom action/error notices. */
export function TopStatusPill({ progress, waiting = false }: {
  progress?: number; waiting?: boolean;
}) {
  const loading = progress !== undefined;
  return <div className={`top-status-pill${loading ? " is-loading" : " is-temporary"}`}
    role="status" aria-label={loading ? "Strip loading" : undefined}>
    {loading ? <>
      <span className="top-status-label">Strip loading<AnimatedEllipsis /></span>
      <span className="top-status-progress" data-waiting={waiting}
        role="progressbar" aria-label="Strip loading" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={progress}>{progress}</span>
    </> : <>
      <span className="top-status-copy"><strong>Preview mode</strong><span>· Tap any block to edit</span></span>
    </>}
  </div>;
}
