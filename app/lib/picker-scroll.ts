/** Bring later choices toward the middle, revealing the next half of the rail
 * without pinning the selection left. Never scroll the editor or keyboard. */
export function revealPickerOption(rail: HTMLElement, option: HTMLElement) {
  const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
  if (!max || !rail.contains(option)) return;
  const railBox = rail.getBoundingClientRect();
  const optionBox = option.getBoundingClientRect();
  // Account for the proportional desktop canvas as well as unscaled mobile.
  const scale = rail.offsetWidth ? railBox.width / rail.offsetWidth : 1;
  if (!scale) return;
  const optionLeft = (optionBox.left - railBox.left) / scale - rail.clientLeft;
  const optionRight = optionLeft + optionBox.width / scale;
  const trailingRoom = Math.round(rail.clientWidth * 0.5);
  const delta = optionLeft < 8
    ? optionLeft - 8
    : Math.max(0, optionRight - (rail.clientWidth - trailingRoom));
  const left = Math.min(max, Math.max(0, rail.scrollLeft + delta));
  if (Math.abs(left - rail.scrollLeft) > 1) rail.scrollTo({ left, behavior: "smooth" });
}

export function scrollPickerOnSelect(event: { currentTarget: HTMLElement; target: EventTarget | null }) {
  const option = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-picker-option]") : null;
  if (!option || option.matches(":disabled, [aria-disabled='true']")) return;
  revealPickerOption(event.currentTarget, option);
}
