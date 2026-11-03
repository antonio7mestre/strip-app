/** Shared fade curve with zero speed and acceleration at both ends. The dock,
 * footer controls and bottom tint ease in together instead of rushing away on
 * the first frame. Keep the existing duration so the handoff stays responsive. */
export function easePreviewHandoff(progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
