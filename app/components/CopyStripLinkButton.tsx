"use client";

import { Check, Link2, LoaderCircle } from "lucide-react";

export function CopyStripLinkButton({ copied, onCopy }: {
  copied: boolean | null | undefined;
  onCopy: () => void;
}) {
  return (
    <button
      className={`share-link-button${copied === true ? " is-copied" : ""}`}
      type="button"
      onClick={onCopy}
      disabled={copied === null}
    >
      {copied === null ? <LoaderCircle className="is-copying" aria-hidden="true" /> : copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      <span aria-live="polite" aria-atomic="true">{copied === null ? "Copying…" : copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}
