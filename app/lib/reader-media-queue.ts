type Job = { top: () => number; run: (signal: AbortSignal) => Promise<void>; controller: AbortController };

/** Bounded work, sorted by actual page position (including floating stickers). */
export function createReaderMediaQueue(concurrency = 2, initiallyEnabled = false, onIdle?: () => void) {
  let enabled = initiallyEnabled, active = 0, disposed = false, scheduled = false;
  let notifiedIdle = false;
  const waiting = new Set<Job>(), running = new Set<Job>();
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; pump(); });
  };
  const pump = () => {
    if (disposed || !enabled) return;
    while (active < concurrency && waiting.size) {
      const job = [...waiting].sort((a, b) => a.top() - b.top())[0];
      waiting.delete(job); running.add(job); active++;
      void Promise.resolve().then(() => job.run(job.controller.signal)).catch(() => {
        // A failed upgrade keeps its already-decoded preview.
      }).finally(() => { running.delete(job); active--; schedule(); });
    }
    if (!active && !waiting.size && !notifiedIdle) { notifiedIdle = true; onIdle?.(); }
  };
  return {
    get idle() { return !active && !waiting.size; },
    add(top: Job['top'], run: Job['run']) {
      const job = { top, run, controller: new AbortController() };
      if (!disposed) { notifiedIdle = false; waiting.add(job); schedule(); }
      return () => { waiting.delete(job); job.controller.abort(); };
    },
    setEnabled(value: boolean) { enabled = value; schedule(); },
    dispose() {
      disposed = true;
      [...waiting, ...running].forEach(job => job.controller.abort());
      waiting.clear();
    },
  };
}
