type MediaBlock = { id: string; type: string; src?: string; alt?: string };
type DraftInput<T extends MediaBlock> = { id: string; blocks: readonly T[]; [key: string]: unknown };
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;

export class DraftSaveError extends Error {}

/** A queue belongs to one editor. Keep its display URLs intact: replacing a
 * playing video's src after saving would make Safari decode it again. */
export function createDraftSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  const uploaded = new Map<string, { source: string; path: string }>();

  const request = async (url: string, init: RequestInit, label: string) => {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      let retry = true;
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (response.ok) return response;
        retry = response.status === 408 || response.status === 429 || response.status >= 500;
        if (response.status === 401) throw new DraftSaveError("Sign in again to save this draft. Keep this page open.");
        if (response.status === 413) throw new DraftSaveError(`${label} is too large to save. Each file must be under 80 MB.`);
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new DraftSaveError(data?.error || `Couldn’t save ${label}. Keep this page open and try again.`);
      } catch (error) {
        if (!retry || attempt >= 2) {
          throw error instanceof DraftSaveError ? error
            : new DraftSaveError(`Couldn’t upload ${label}. Check your connection and keep this page open.`);
        }
      } finally { clearTimeout(timeout); }
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  };

  return {
    idle: () => tail.catch(() => {}),
    save<T extends MediaBlock, D = unknown>(input: DraftInput<T>, isCurrent = () => true,
      prepare?: (blocks: readonly T[]) => Promise<T[]>) {
      const job = tail.catch(() => {}).then(async () => {
        if (!isCurrent()) return null;
        // Reserve queue order before asynchronous sticker preparation as well.
        // The editor can already be open while its first draft is preparing.
        const prepared = prepare ? await prepare(input.blocks) : input.blocks;
        if (!isCurrent()) return null;
        const blocks: T[] = [];
        const retained = new Set(prepared.map(block => `${input.id}/${block.id}`));
        for (const key of uploaded.keys()) {
          if (key.startsWith(`${input.id}/`) && !retained.has(key)) uploaded.delete(key);
        }
        for (const block of prepared) {
          if (!isCurrent()) return null;
          const source = block.src;
          if (!source || (!source.startsWith("data:") && !source.startsWith("blob:"))) {
            blocks.push(block);
            continue;
          }
          const key = `${input.id}/${block.id}`;
          const cached = uploaded.get(key);
          const path = `/api/drafts/${encodeURIComponent(input.id)}/media/${encodeURIComponent(block.id)}`;
          if (cached?.source !== source) {
            // One Blob at a time. No base64 expansion in the upload request,
            // no Promise.all holding a batch of decoded files in memory.
            const blob = await (await fetch(source)).blob();
            const label = block.alt?.trim() ? `“${block.alt.trim().slice(0, 80)}”` : "this file";
            if (!blob.size || blob.size > MAX_MEDIA_BYTES) {
              throw new DraftSaveError(`${label} must be a nonempty file under 80 MB.`);
            }
            await request(path, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob }, label);
            uploaded.set(key, { source, path });
          }
          blocks.push({ ...block, src: path });
        }
        if (!isCurrent()) return null;
        const response = await request("/api/drafts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, blocks }),
        }, "this draft");
        const data = await response.json() as { draft: D };
        return { draft: data.draft, blocks };
      });
      tail = job;
      return job;
    },
  };
}
