"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { StickerImage } from "@/app/components/StickerImage";
import { installEmptyStateGuide, type EmptyStateKind } from "@/app/lib/empty-state-guide";
import styles from "./EmptyStripState.module.css";

const artwork = {
  profile: [
    { src: "/landing/sticker-camera.webp", width: 768, height: 512 },
    { src: "/sticker-pack/nature/white-daisy.webp", width: 512, height: 490 },
    { src: "/sticker-pack/random/jelly-bow.webp", width: 512, height: 344 },
  ],
  editor: [
    { src: "/sticker-pack/items/digital-camera.webp", width: 512, height: 289 },
    { src: "/sticker-pack/random/pearl-star.webp", width: 512, height: 507 },
    { src: "/sticker-pack/scrap/notebook-scrap.webp", width: 411, height: 512 },
  ],
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
    {artwork[kind].map((image, index) => kind === "editor" && index === 2
      ? <span key={image.src} className={`${styles.sticker} ${styles.sticker2}`}>
          <StickerImage {...image} alt="" draggable={false} decoding="async" className={styles.textPaper} />
          <span className={styles.textGlyph}>Aa</span>
        </span>
      : <StickerImage key={image.src} {...image}
          alt="" draggable={false} decoding="async" className={`${styles.sticker} ${styles[`sticker${index}`]}`} />)}
  </div>;
  return <div ref={root} className={`${styles.state} ${styles[kind]}`}>
    <div className={styles.collage}>
      <h2 className={styles.title}>{kind === "profile"
        ? <>Your photos.<br />Your words.<br />Your world.</>
        : <>Your Strip<br />starts here.</>}</h2>
    </div>
    <p className={styles.subtitle}>{kind === "profile"
      ? "Make a little something that feels like you."
      : "Add a photo, a video, or a few words."}</p>
    {!editing ? <div ref={arrow} className={styles.guide}>
      <span className={styles.lettering} role="img"
        aria-label={kind === "profile" ? "click here to make a strip" : "pick a starting block"}
        style={{ "--empty-state-lettering": `url("/empty-states/${kind === "profile" ? "create-strip" : "starting-block"}.png")` } as CSSProperties} />
      <span className={styles.arrowGraphic} aria-hidden="true" />
    </div> : null}
    {decorations}
  </div>;
}
