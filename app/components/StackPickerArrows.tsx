"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

export function StackPickerArrows({ index, count, label, top = 50, onSelect }: {
  index: number; count: number; label: string; top?: number; onSelect: (index: number) => void;
}) {
  return <nav className="stack-picker-arrows" aria-label={`${label} navigation`} style={{ top: `${top}%` }}>
    <button type="button" disabled={index <= 0} onClick={() => onSelect(index - 1)} aria-label={`Previous ${label}`}>
      <ArrowUp aria-hidden="true" />
    </button>
    <button type="button" disabled={index >= count - 1} onClick={() => onSelect(index + 1)} aria-label={`Next ${label}`}>
      <ArrowDown aria-hidden="true" />
    </button>
  </nav>;
}
