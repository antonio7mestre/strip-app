"use client";

import { useRef, type ButtonHTMLAttributes, type RefObject } from "react";
import { finishAuthButtonTap } from "../lib/auth-keyboard";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  inputRef: RefObject<HTMLInputElement | null>;
  keepKeyboard?: boolean;
};

/** Phone and code actions must not end the same native editing session. */
export default function AuthKeyboardButton({
  inputRef, keepKeyboard = true, onClick, children, ...props
}: Props) {
  const touchStart = useRef<{ clientX: number; clientY: number } | null>(null);
  return (
    <button
      {...props}
      onPointerDown={event => { if (keepKeyboard) event.preventDefault(); }}
      onTouchStart={event => {
        const touch = event.touches[0];
        touchStart.current = event.touches.length === 1 && touch
          ? { clientX: touch.clientX, clientY: touch.clientY } : null;
      }}
      onTouchMove={event => {
        const touch = event.touches[0], start = touchStart.current;
        if (event.touches.length !== 1 || !touch || (start &&
            Math.hypot(touch.clientX - start.clientX, touch.clientY - start.clientY) > 12)) {
          touchStart.current = null;
        }
      }}
      onTouchCancel={() => { touchStart.current = null; }}
      onTouchEnd={event => {
        const start = touchStart.current;
        touchStart.current = null;
        if (keepKeyboard) finishAuthButtonTap(event, start, inputRef.current);
      }}
      onClick={event => {
        // Also covers mouse, keyboard, and assistive-technology activation.
        if (keepKeyboard) inputRef.current?.focus({ preventScroll: true });
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
