type AuthButton = Pick<HTMLButtonElement, "disabled" | "click" | "getBoundingClientRect">;
type AuthInput = Pick<HTMLInputElement, "focus">;
type TouchPoint = { clientX: number; clientY: number };

/** Keep iOS's synthetic tap from blurring the input before the button's click.
 * Activate during touchend instead, while Safari still grants keyboard access. */
export function finishAuthButtonTap(
  event: {
    currentTarget: AuthButton;
    changedTouches: ArrayLike<TouchPoint>;
    touches: ArrayLike<TouchPoint>;
    preventDefault(): void;
  },
  start: TouchPoint | null,
  input: AuthInput | null,
) {
  event.preventDefault();
  const end = event.changedTouches[0];
  if (!start || !end || event.touches.length || event.currentTarget.disabled) return;
  if (Math.hypot(end.clientX - start.clientX, end.clientY - start.clientY) > 12) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (end.clientX < bounds.left || end.clientX > bounds.right ||
      end.clientY < bounds.top || end.clientY > bounds.bottom) return;
  input?.focus({ preventScroll: true });
  // Dispatch exactly once. preventDefault above suppresses Safari's later tap.
  // Native button activation preserves form validation and submit semantics.
  event.currentTarget.click();
}
