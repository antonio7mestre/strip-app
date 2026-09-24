export type StickerLayout = { rotation?: number; anchorBlockId?: string; anchorY?: number };

export function stickerLayoutFields(value: StickerLayout): StickerLayout {
  return {
    ...(typeof value.rotation === "number" && Number.isFinite(value.rotation)
      ? { rotation: Math.max(-180, Math.min(180, value.rotation)) } : {}),
    ...(typeof value.anchorBlockId === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value.anchorBlockId) &&
      typeof value.anchorY === "number" && Number.isFinite(value.anchorY) && value.anchorY >= 0 && value.anchorY <= 1
      ? { anchorBlockId: value.anchorBlockId, anchorY: value.anchorY } : {}),
  };
}
