import { Check, Link2, LoaderCircle, X } from "lucide-react";
import type { StoryShareConfirmationData } from "@/app/lib/story-share";

export function StoryShareConfirmation({ confirmation, onDismiss }: {
  confirmation: StoryShareConfirmationData;
  onDismiss: () => void;
}) {
  return (
    <div className="story-share-confirmation">
      <div className="story-share-confirmation-lines" role="status" aria-live="polite" aria-atomic="true">
        {confirmation.image ? <p><Check aria-hidden="true" /><span>{confirmation.image}</span></p> : null}
        <p>
          {confirmation.copied === null ? <LoaderCircle className="is-pending" aria-hidden="true" /> : confirmation.copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          <span>{confirmation.copied === null ? "Copying link…" : confirmation.copied ? "Link copied" : "Link not copied"}</span>
        </p>
        {confirmation.copied === false ? <small>Tap Copy link to try again.</small> : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss sharing confirmation"><X aria-hidden="true" /></button>
    </div>
  );
}
