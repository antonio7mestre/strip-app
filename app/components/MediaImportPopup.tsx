import type { CSSProperties } from "react";
import type { MediaImportProgress } from "@/app/lib/media-import";
import { profileInk } from '@/app/lib/profile';
import { MediaLoadingTile } from './MediaLoadingTile';

export function MediaImportPopup({ progress, revealing = false, preview, color = '#304dff' }: {
  progress: MediaImportProgress; revealing?: boolean;
  preview?: { src: string; previewSrc?: string; type: 'image' | 'video' } | null; color?: string;
}) {
  return <div className={`confirmation-backdrop media-import-popup${revealing ? " is-revealing" : ""}`}>
    <section className="media-import-art" role="status" aria-live="polite" aria-atomic="true"
      aria-label={`Adding media ${progress.completed} of ${progress.total}`} aria-busy="true"
      style={{ '--onboarding-background': color, '--onboarding-ink': profileInk(color) } as CSSProperties}>
      <MediaLoadingTile src={preview?.src} previewSrc={preview?.previewSrc} type={preview?.type} />
    </section>
  </div>;
}
