"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./BlockMediaPlaceholder.module.css";

/** The block owns its geometry. This layer only paints inside that space. */
export function BlockMediaPlaceholder({ ready, failed = false, previewSrc, color }: {
  ready: boolean; failed?: boolean; previewSrc?: string; color?: string;
}) {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!ready) { setFinished(false); return; }
    const timer = window.setTimeout(() => setFinished(true), 420);
    return () => window.clearTimeout(timer);
  }, [ready]);
  if (finished && ready) return null;
  return <div className={`${styles.placeholder}${ready ? ` ${styles.ready}` : ""}${failed ? ` ${styles.failed}` : ""}`}
    style={color ? { "--block-loading-color": color } as CSSProperties : undefined}
    aria-hidden="true">
    <div className={styles.blur} style={previewSrc ? { backgroundImage: `url(${JSON.stringify(previewSrc)})` } : undefined} />
    <div className={styles.sheen} />
    {failed ? <span className={styles.error}>Couldn't load this media</span> :
      <span className={styles.dots}><i /><i /><i /></span>}
  </div>;
}
