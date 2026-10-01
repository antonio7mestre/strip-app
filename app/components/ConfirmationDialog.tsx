"use client";

import type { RefObject } from "react";

/** One card treatment for discarding profile edits, drafts, blocks and stickers. */
export function ConfirmationDialog({
  id, title, description, cancelLabel, confirmLabel, pending = false,
  cancelButtonRef, onCancel, onConfirm,
}: {
  id: string;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  pending?: boolean;
  cancelButtonRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="confirmation-backdrop" onClick={() => { if (!pending) onCancel(); }}>
    <section className="confirmation-card" role="alertdialog" aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      aria-busy={pending || undefined} onClick={event => event.stopPropagation()}>
      <h2 id={`${id}-title`}>{title}</h2>
      {description ? <p id={`${id}-description`}>{description}</p> : null}
      <div className="confirmation-actions">
        <button ref={cancelButtonRef} type="button" disabled={pending}
          onClick={() => { if (!pending) onCancel(); }}>{cancelLabel}</button>
        <button type="button" disabled={pending}
          onClick={() => { if (!pending) onConfirm(); }}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}
