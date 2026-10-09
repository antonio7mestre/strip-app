export const MEDIA_IMPORT_REVEAL_MS = 440;
const MOUNTED_MEDIA_TIMEOUT_MS = 2_000;

/** Keep the upload feedback until the actual mounted media is decoded.
 * An offscreen predecode alone does not guarantee a new Safari image is ready. */
export async function revealImportedMedia(canvas: HTMLElement | null, ids: readonly string[], {
  signal,
  onReveal,
}: { signal: AbortSignal; onReveal: () => void }) {
  const cleanups = new Set<() => void>();
  const cancelled = () => new DOMException("Import cancelled", "AbortError");
  const wait = (start: (resolve: () => void) => () => void) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    let settled = false;
    let stop = () => {};
    const cleanup = () => { stop(); signal.removeEventListener("abort", abort); cleanups.delete(cleanup); };
    const done = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const abort = () => { if (settled) return; settled = true; cleanup(); reject(cancelled()); };
    cleanups.add(cleanup);
    signal.addEventListener("abort", abort, { once: true });
    stop = start(done);
  });
  const frame = () => wait(done => {
    const id = requestAnimationFrame(done);
    return () => cancelAnimationFrame(id);
  });

  try {
    const selected = new Set(ids);
    const mounted = Array.from(canvas?.querySelectorAll<HTMLElement>(".strip-block[data-block-id]") ?? []);
    const blocks = mounted.filter(block => selected.has(block.dataset.blockId ?? ""));
    await wait(done => {
      const removers: Array<() => void> = [];
      const ready = blocks.flatMap(block => {
        const image = block.querySelector("img");
        if (image) return [image.decode().catch(() => {})];
        const video = block.querySelector("video");
        if (!video || video.readyState >= 2 || video.error) return [];
        return [new Promise<void>(resolve => {
          const settled = () => resolve();
          video.addEventListener("loadeddata", settled, { once: true });
          video.addEventListener("error", settled, { once: true });
          removers.push(() => { video.removeEventListener("loadeddata", settled); video.removeEventListener("error", settled); });
        })];
      });
      const timer = setTimeout(done, MOUNTED_MEDIA_TIMEOUT_MS);
      void Promise.all(ready).then(done);
      return () => { clearTimeout(timer); removers.forEach(remove => remove()); };
    });
    // Paint the unchanged canvas before the decoded batch is revealed.
    await frame();
    await frame();
    if (signal.aborted) throw cancelled();
    const positions = mounted.filter(block => !selected.has(block.dataset.blockId ?? ""))
      .flatMap(block => {
        const bounds = block.getBoundingClientRect?.();
        return bounds?.height ? [{ block, top: bounds.top }] : [];
      });
    onReveal();
    // The final layout is committed once. Existing content moves from its
    // previous position using translation, without reflowing every frame.
    const moves = positions.flatMap(({ block, top }) => {
      const delta = top - block.getBoundingClientRect().top;
      if (Math.abs(delta) < 1 || !block.animate) return [];
      const animation = block.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }],
        { duration: MEDIA_IMPORT_REVEAL_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
      cleanups.add(() => animation.cancel());
      return [animation];
    });
    // CSS begins on its own paint clock, which may lag the commit on a busy
    // phone. Keep the handoff until the real grow/shrink and pixel fade finish.
    const animations = (blocks[0]?.getAnimations?.({ subtree: true }) ?? []).filter(animation =>
      "animationName" in animation && typeof animation.animationName === "string" &&
      animation.animationName.startsWith("media-import-")).concat(moves);
    await wait(done => {
      const timer = setTimeout(done, MEDIA_IMPORT_REVEAL_MS + (animations.length ? 240 : 0));
      if (animations.length) void Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(done);
      return () => clearTimeout(timer);
    });
  } finally {
    cleanups.forEach(cleanup => cleanup());
  }
}
