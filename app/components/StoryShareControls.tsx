"use client";

import { InstagramStoryAction } from "@/app/components/InstagramStoryAction";

// Keep the tray mounted. Button tracks merge and the instructions unfold
// below them, while the existing bottom and safe-area geometry stay intact.
export function StoryShareControls({
  instagramReady,
  backLabel = "Done",
  shareLabel = "Share",
  disabled,
  onBack,
  onShare,
}: {
  instagramReady: boolean;
  backLabel?: string;
  shareLabel?: string;
  disabled: boolean;
  onBack: () => void;
  onShare: () => void;
}) {
  return (
    <div className="story-share-dock-content" data-instagram-ready={instagramReady}>
      <div className="dock-controls dock-controls-current dock-action-controls story-share-controls" data-instagram-ready={instagramReady}>
        <button
          className="dock-icon-button publish-flow-button publish-flow-back-button"
          type="button"
          onClick={onBack}
          inert={instagramReady}
          aria-hidden={instagramReady}
        >
          {backLabel}
        </button>
        <div className="story-share-primary">
          <button
            className="dock-icon-button publish-icon-button publish-flow-button share-story-button"
            type="button"
            onClick={onShare}
            disabled={disabled}
            inert={instagramReady}
            aria-hidden={instagramReady}
          >
            <span>{shareLabel}</span>
          </button>
          <InstagramStoryAction active={instagramReady} />
        </div>
      </div>
      <div className="story-share-instructions" aria-hidden={!instagramReady}>
        <p>Select your saved poster and paste your link sticker.</p>
      </div>
    </div>
  );
}
