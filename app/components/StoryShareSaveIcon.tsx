/** Save Image action from the supplied reference, as a resolution-independent icon. */
export function StoryShareSaveIcon() {
  return (
    <svg className="story-share-save-icon" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="story-share-save-disc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#808080" />
          <stop offset="1" stopColor="#9B9B9B" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#story-share-save-disc)" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M85 79H80C70 79 65 87 65 97V126C65 136 71 142 81 142H119C129 142 135 136 135 126V97C135 87 129 79 119 79H115" />
        <path d="M100 56V112M86 98L100 112L114 98" />
      </g>
    </svg>
  );
}
