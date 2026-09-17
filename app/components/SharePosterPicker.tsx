"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { POSTER_DESIGNS, posterSwipeProgress, posterSwipeTarget } from "@/app/lib/share-posters";

export function SharePosterPicker({ previews, index, onSelect }: { previews: string[]; index: number; onSelect: (index: number) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const wheelState = useRef({ distance: 0, last: -Infinity });
  const drag = useRef<{ y: number; progress: number; pointer: number; tapped: number | null } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setHeight(Math.max(100, Math.min(element.clientHeight * .79, (element.clientWidth - 72) * 16 / 9, 680)));
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); const state = wheelState.current;
      if (performance.now() - state.last < 420) return;
      state.distance += e.deltaY;
      if (Math.abs(state.distance) >= 45) { onSelect(index + Math.sign(state.distance)); state.distance = 0; state.last = performance.now(); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [index, onSelect]);
  const cancel = () => { drag.current = null; setProgress(0); setDragging(false); };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const option = (event.target as Element).closest<HTMLElement>("[data-poster-index]");
    drag.current = { y: event.clientY, progress: 0, pointer: event.pointerId, tapped: option ? Number(option.dataset.posterIndex) : null };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const next = posterSwipeProgress(drag.current.y, event.clientY, index);
    drag.current.progress = next; setProgress(next);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (Math.abs(current.y - event.clientY) < 5 && current.tapped !== null) onSelect(current.tapped);
    else onSelect(posterSwipeTarget(index, current.progress));
    cancel();
  };
  return <div ref={stage} className={`poster-picker ${dragging ? "is-dragging" : ""}`} role="listbox" aria-label="Story poster designs" aria-activedescendant={`poster-design-${index}`} tabIndex={0}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={e => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); onSelect(e.key === "Home" ? 0 : e.key === "End" ? 9 : index + (["ArrowDown", "PageDown"].includes(e.key) ? 1 : -1));
      }
    }}>
    {POSTER_DESIGNS.map((design, i) => {
      const position = Math.max(-2, Math.min(2, i - index - progress));
      const distance = Math.abs(position), near = Math.min(1, distance);
      const scale = 1 - near * .4 - Math.max(0, distance - 1) * .13;
      const offset = Math.sign(position) * (near * (height * .2 + 36) + Math.max(0, distance - 1) * 60);
      const opacity = distance <= 1 ? 1 - distance * .4 : (2 - distance) * .6;
      return <div key={design.id} id={`poster-design-${i}`} role="option" aria-selected={i === index} aria-label={`${i + 1} of 10: ${design.name}`} data-poster-index={i}
        className="poster-option" style={{ height, width: height * 9 / 16, opacity, zIndex: Math.round(10 - distance * 3), visibility: distance >= 2 ? "hidden" : "visible", transform: `translate(-50%, calc(-50% + ${offset}px)) scale(${scale})` }}>
        {previews[i] ? <img src={previews[i]} alt={`${design.name} story poster`} draggable={false} /> : <div className="poster-preparing" aria-busy="true">Preparing…</div>}
      </div>;
    })}
  </div>;
}
