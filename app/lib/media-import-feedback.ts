import type { MediaImportProgress } from "./media-import";

export type MediaImportFeedback = MediaImportProgress & { visible: boolean };
export const MEDIA_IMPORT_SHOW_DELAY_MS = 180;
export const MEDIA_IMPORT_MIN_VISIBLE_MS = 320;

/** Fast batches skip the loading block. Once shown, it gets a readable beat
 * before the editor replaces it with the complete, decoded batch. */
export function createMediaImportFeedback({ signal, onProgress }: {
  signal: AbortSignal;
  onProgress: (progress: MediaImportFeedback) => void;
}) {
  let latest: MediaImportProgress | null = null;
  let shownAt: number | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let release: (() => void) | null = null;
  let finishing: Promise<void> | null = null;
  let disposed = signal.aborted;

  const publish = () => {
    if (!disposed && latest) onProgress({ ...latest, visible: shownAt !== null });
  };
  const dispose = () => {
    disposed = true;
    if (showTimer !== null) clearTimeout(showTimer);
    if (holdTimer !== null) clearTimeout(holdTimer);
    showTimer = holdTimer = null;
    signal.removeEventListener("abort", dispose);
    release?.();
    release = null;
  };
  signal.addEventListener("abort", dispose, { once: true });

  return {
    report(progress: MediaImportProgress) {
      if (disposed || finishing) return;
      const first = latest === null;
      latest = progress;
      publish();
      if (first) showTimer = setTimeout(() => {
        showTimer = null;
        if (disposed) return;
        shownAt = performance.now();
        publish();
      }, MEDIA_IMPORT_SHOW_DELAY_MS);
    },
    finish() {
      if (finishing) return finishing;
      if (showTimer !== null) clearTimeout(showTimer);
      showTimer = null;
      const remaining = shownAt === null ? 0
        : Math.max(0, MEDIA_IMPORT_MIN_VISIBLE_MS - (performance.now() - shownAt));
      finishing = disposed || remaining === 0 ? Promise.resolve() : new Promise<void>(resolve => {
        release = resolve;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          release = null;
          resolve();
        }, remaining);
      });
      return finishing;
    },
    dispose,
  };
}
