"use client";

import type { ReactNode } from "react";

/** A real switch tap gives supported iPhones native feedback. Keep valid actions
 * as regular buttons, and never synthesize clicks on a hidden offscreen switch. */
export function HapticActionButton({ children, className, label, feedback, disabled = false, pressed, onClick }: {
  children: ReactNode;
  className: string;
  label: string;
  feedback: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: (target: HTMLElement) => void;
}) {
  const activate = (event: { currentTarget: HTMLElement }) => {
    if (disabled) return;
    if (feedback && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      // Unsupported hardware or browser policy must never interrupt validation.
      try { navigator.vibrate(12); } catch { /* Optional physical feedback. */ }
    }
    onClick(event.currentTarget);
  };

  if (!feedback) return <button type="button" className={className} disabled={disabled}
    aria-label={label} aria-pressed={pressed}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); activate(event); }}>{children}</button>;

  return <label className={`${className} haptic-action-button`}>
    <span className="haptic-action-content" aria-hidden="true">{children}</span>
    <input type="checkbox" {...{ switch: "" }} role="button" aria-label={label} aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onChange={activate}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); if (!event.repeat) activate(event); }
      }} />
  </label>;
}
