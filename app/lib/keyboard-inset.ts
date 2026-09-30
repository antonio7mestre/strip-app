/** Safari pans the visual viewport toward low inputs without closing the
 * keyboard. offsetTop is that pan, not part of the keyboard's height. */
export function keyboardInsetForViewport(
  layoutHeight: number,
  viewportHeight: number,
  textIsFocused: boolean,
) {
  const obscuredHeight = Math.max(0, layoutHeight - viewportHeight);
  return textIsFocused && obscuredHeight > 80 ? obscuredHeight : 0;
}
