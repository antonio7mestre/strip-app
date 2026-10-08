"use client";

import { useState } from "react";
import { instagramStoryCameraUrl } from "@/app/lib/instagram-story";

export function InstagramStoryAction({ active }: { active: boolean }) {
  const [href] = useState(() => instagramStoryCameraUrl(typeof navigator === "undefined" ? "" : navigator.userAgent));
  return (
    <a
      className="dock-icon-button publish-icon-button publish-flow-button share-story-button instagram-story-button"
      href={href}
      inert={!active}
      aria-hidden={!active}
      title="Choose your saved poster from the camera roll."
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
      <span>Open Instagram Stories</span>
    </a>
  );
}
