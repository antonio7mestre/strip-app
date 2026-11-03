/** Published media survives draft cleanup. Each publication gets a fresh cache
 * key because the same Strip and block IDs can be edited and published again. */
export function publishedMediaPath(stripId: string, blockId: string | null, publishedAt: number) {
  const resource = blockId === null ? "cover" : `media/${encodeURIComponent(blockId)}`;
  return `/api/strips/${encodeURIComponent(stripId)}/${resource}?v=${encodeURIComponent(publishedAt)}`;
}
