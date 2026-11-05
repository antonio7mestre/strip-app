"use client";
import { useState } from 'react';
import styles from './MediaLoadingTile.module.css';

export function LoadingDots() {
  return <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>;
}

/** The blurry backing stays painted as the decoded item fades over it. */
export function MediaLoadingTile({ src, previewSrc, type = 'image', alt = '', ready = false }: {
  src?: string; previewSrc?: string; type?: 'image' | 'video'; alt?: string; ready?: boolean;
}) {
  const [painted, setPainted] = useState(false);
  const blur = previewSrc || (type === 'image' ? src : undefined);
  return <div className={`${styles.tile}${ready && painted ? ` ${styles.ready}` : ''}`} aria-busy={!ready || !painted}>
    <div className={styles.blur} aria-hidden="true">{blur ? <img src={blur} alt="" /> : null}</div>
    <div className={styles.sheen} aria-hidden="true" />
    {ready && src ? type === 'video'
      ? <video className={styles.media} src={`${src}#t=0.001`} poster={previewSrc} muted playsInline preload="auto"
          aria-label={alt} onLoadedData={() => setPainted(true)} onError={() => setPainted(true)}
          ref={element => { if (element && element.readyState >= 2 && !painted) setPainted(true); }} />
      : <img className={styles.media} src={src} alt={alt} onLoad={() => setPainted(true)} onError={() => setPainted(true)} /> : null}
    {!ready ? <LoadingDots /> : null}
  </div>;
}
