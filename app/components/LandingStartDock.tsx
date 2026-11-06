"use client";

import { DockFooter } from "@/app/components/DockViewport";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { HapticStartButton } from "./HapticStartButton";
import { enterLandingDock } from "../lib/landing-dock";

/** One fixed, live tray on both direct load and Make a Strip. No cloned button,
 * document-scroll coordinates, or replacement surface at the end of motion. */
export function LandingStartDock({ onStart }: { onStart: () => void }) {
  const dock = useRef<HTMLElement>(null);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (!dock.current) return;
    return enterLandingDock(dock.current, () => flushSync(() => setSettled(true)));
  }, []);
  return <DockFooter ref={dock} className="composer-dock auth-action-dock landing-start-dock" data-entering={!settled || undefined}>
    <div className="dock-controls dock-controls-current auth-action-controls">
      <HapticStartButton onStart={onStart} cueReady={settled} />
      <p className="auth-action-terms">By continuing, you agree to our Terms &amp; Privacy Policy.</p>
    </div>
  </DockFooter>;
}
