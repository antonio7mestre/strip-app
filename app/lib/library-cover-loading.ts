export const COVER_LOAD_CONCURRENCY = 4;

type CoverJob = {
  order: () => number;
  start: (done: () => void) => void;
  active: boolean;
};

/** One queue per visible library. Collect both masonry columns before starting
 * requests, then give the newest remaining cover the next available slot.
 * This schedules the actual images, not a second set of preload downloads. */
export function createCoverLoadQueue() {
  const jobs = new Set<CoverJob>();
  let active = 0;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const waiting = [...jobs].filter(job => !job.active).sort((a, b) => a.order() - b.order());
      for (const job of waiting) {
        if (active >= COVER_LOAD_CONCURRENCY) break;
        if (!jobs.has(job)) continue;
        job.active = true;
        active++;
        const done = () => {
          if (!jobs.delete(job)) return;
          active--;
          schedule();
        };
        try { job.start(done); } catch { done(); }
      }
    });
  };
  return {
    add(order: CoverJob["order"], start: CoverJob["start"]) {
      const job: CoverJob = { order, start, active: false };
      jobs.add(job);
      schedule();
      return () => {
        if (!jobs.delete(job)) return;
        if (job.active) active--;
        schedule();
      };
    },
  };
}

/** Published: newest publication. Drafts: newest edit. History: newest visit. */
export function newestLibraryItems<T extends { id: string; publishedAt?: number; updatedAt?: number; viewedAt?: number }>(items: T[]): T[] {
  const recent = (item: T) => item.viewedAt ?? item.updatedAt ?? item.publishedAt ?? 0;
  return [...items].sort((a, b) => recent(b) - recent(a) || b.id.localeCompare(a.id));
}
