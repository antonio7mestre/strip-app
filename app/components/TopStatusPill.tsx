import type { CSSProperties } from "react";
import { Eye } from "lucide-react";
import { AnimatedEllipsis } from "./AnimatedEllipsis";

/** Informational status stays separate from the bottom action/error notices. */
export function TopStatusPill({ progress, waiting = false, progressStyle }: {
  progress?: number; waiting?: boolean; progressStyle?: CSSProperties;
}) {
  const loading = progress !== undefined;
  return <div className={`top-status-pill${loading ? " is-loading" : " is-temporary"}`}
    role="status" aria-label={loading ? "Strip loading" : undefined}>
    {loading ? <>
      <span className="top-status-label">Strip loading<AnimatedEllipsis /></span>
      <span className="top-status-progress" style={progressStyle} data-waiting={waiting}
        role="progressbar" aria-label="Strip loading" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={progress}>{progress}</span>
    </> : <>
      <Eye className="top-status-icon" size={22} aria-hidden="true" />
      <span className="top-status-copy"><strong>Preview mode</strong><span>Tap any block to edit</span></span>
    </>}
  </div>;
}
