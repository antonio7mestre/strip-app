"use client";

import { useLayoutEffect, useState } from "react";
import { observeTitleKeyboard } from "@/app/lib/title-keyboard";
import { AnimatedEllipsis } from "./AnimatedEllipsis";

export function TitleKeyboardPublish({ publishing, onPublish }: { publishing: boolean; onPublish: () => void }) {
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const input = document.querySelector<HTMLInputElement>(".title-question-field input");
    if (input) return observeTitleKeyboard(input, setOpen);
  }, []);
  return <div className="title-keyboard-action" data-keyboard-open={open} inert={!open} aria-hidden={!open}>
    <button type="button" onClick={onPublish} disabled={publishing} aria-label="Publish Strip">
      {publishing ? <>Publishing<AnimatedEllipsis /></> : "Publish"}
    </button>
  </div>;
}
