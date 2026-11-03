"use client";

import { useEffect, useRef } from "react";
import { installLandingStartCue } from "../lib/landing-start-cue";

/** A direct native switch tap supplies Safari's single haptic. No synthetic clicks. */
export function HapticStartButton({ onStart, cueReady = true }: { onStart: () => void; cueReady?: boolean }) {
  const button = useRef<HTMLLabelElement>(null);
  useEffect(() => cueReady && button.current ? installLandingStartCue(button.current) : undefined, [cueReady]);
  return (
    <label ref={button} className="auth-action-button auth-haptic-start">
      <span aria-hidden="true">Get started</span>
      <input type="checkbox" {...{ switch: "" }} role="button" aria-label="Get started"
        onChange={() => {
          // Other mobile browsers expose the Vibration API instead of native switches.
          if (typeof navigator.vibrate === "function") navigator.vibrate(12);
          onStart();
        }}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); onStart(); }
        }}
      />
    </label>
  );
}
