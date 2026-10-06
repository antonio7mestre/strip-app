"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { StickerImage } from "@/app/components/StickerImage";
import { installEmptyStateGuide, type EmptyStateKind } from "@/app/lib/empty-state-guide";
import styles from "./EmptyStripState.module.css";

const artwork = {
  profile: { src: "/sticker-pack/nature/white-daisy.webp", width: 512, height: 490 },
  editor: { src: "/sticker-pack/items/digital-camera.webp", width: 512, height: 289 },
} as const;

/** Decorative cutouts are guidance, never blocks added to someone's Strip. */
export function EmptyStripState({ kind, editing = false }: { kind: EmptyStateKind; editing?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (editing || !root.current || !arrow.current) return;
    return installEmptyStateGuide(root.current, arrow.current, kind);
  }, [kind, editing]);
  const decorations = <div className={styles.artwork} aria-hidden="true">
    <StickerImage {...artwork[kind]} alt="" draggable={false} decoding="async" className={styles.sticker} />
  </div>;
  return <div ref={root} className={`${styles.state} ${styles[kind]}`}>
    {kind === "editor" ? <>
      <div className={styles.collage}>
        <div className={styles.intro}>
          <h2 className={styles.title}>Your Strip<br />starts here.</h2>
          <p className={styles.subtitle}>Add a photo, a video, or a few words.</p>
        </div>
      </div>
    </> : null}
    {!editing ? <div ref={arrow} className={styles.guide}>
      <span className={styles.lettering} role="img"
        aria-label={kind === "profile" ? "click here to make a strip" : "pick a starting block"}
        style={{ "--empty-state-lettering": `url("/empty-states/${kind === "profile" ? "create-strip" : "starting-block"}.png")` } as CSSProperties} />
      <span className={styles.arrowGraphic} aria-hidden="true" />
    </div> : null}
    {decorations}
  </div>;
}
