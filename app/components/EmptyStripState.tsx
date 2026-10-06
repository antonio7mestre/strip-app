"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { installEmptyStateGuide, type EmptyStateKind } from "@/app/lib/empty-state-guide";
import { watchEmptyStateArtwork } from "@/app/lib/empty-state-artwork";
import styles from "./EmptyStripState.module.css";

/** Empty-state guidance never adds blocks or changes tool behavior. */
export function EmptyStripState({ kind, editing = false }: { kind: EmptyStateKind; editing?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const [readyKind, setReadyKind] = useState<EmptyStateKind | null>(null);
  useLayoutEffect(() => {
    if (editing) return;
    return watchEmptyStateArtwork(kind, () => setReadyKind(kind));
  }, [kind, editing]);
  useLayoutEffect(() => {
    if (editing || !root.current || !arrow.current) return;
    return installEmptyStateGuide(root.current, arrow.current, kind);
  }, [kind, editing]);
  return <div ref={root} className={`${styles.state} ${styles[kind]}`}>
    {kind === "editor" ? <>
      <div className={styles.collage}>
        <div className={styles.intro}>
          <h2 className={styles.title}>Your Strip<br />starts here.</h2>
          <p className={styles.subtitle}>Add a photo, a video, or a few words.</p>
        </div>
      </div>
    </> : null}
    {!editing ? <div ref={arrow} className={styles.guide} data-artwork-ready={readyKind === kind}>
      <span className={styles.lettering} role="img"
        aria-label={kind === "profile" ? "click here to make a strip" : "pick a starting block"}
        style={{ "--empty-state-lettering": `url("/empty-states/${kind === "profile" ? "create-strip" : "starting-block"}.png")` } as CSSProperties} />
      <span className={styles.arrowGraphic} aria-hidden="true" />
    </div> : null}
  </div>;
}
