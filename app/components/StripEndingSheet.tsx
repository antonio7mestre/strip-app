"use client";

import type { CSSProperties, ReactNode } from "react";
import { installEndingContact } from "@/app/lib/ending-contact";

/** One reader ending for preview and publication. Corner backing is below the
 * raised white surface, never painted over its curved shadow. */
export function StripEndingSheet({ username, cornerColor, preview = false, children }: {
  username?: string | null;
  cornerColor?: string;
  preview?: boolean;
  children: ReactNode;
}) {
  return (
    <footer
      ref={installEndingContact}
      className="strip-block strip-ending-card published-bottom-sheet strip-end-sheet"
      aria-label={preview ? "Strip actions preview" : "Strip actions"}
      style={{
        "--ending-background": "#FFFFFF",
        "--ending-corner-color": cornerColor ?? "transparent",
        "--ending-foreground": "#000000",
        "--ending-button": "#000000",
        "--ending-button-foreground": "#FFFFFF",
      } as CSSProperties}
    >
      <span className="strip-end-sheet-corner-fill" aria-hidden="true" />
      <span className="strip-end-sheet-surface" aria-hidden="true" />
      <div className="strip-ending-card-inner">
        <h2 className="published-bottom-sheet-title">
          {username ? <>A Strip by <span>@{username}</span></> : "Made with Strip"}
        </h2>
        {children}
      </div>
    </footer>
  );
}
