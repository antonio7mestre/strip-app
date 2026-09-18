"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { POSTER_DESIGNS } from "@/app/lib/share-posters";
import { stackSwipeProgress, stackSwipeTarget, stackCardStyle } from "@/app/lib/stack-picker";

export function SharePosterPicker({ previews, index, onSelect }: { previews: string[]; index: number; onSelect: (index: number) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const wheelState = useRef({ distance: 0, last: -Infinity });
  const drag = useRef<{ y: number; progress: number; pointer: number; index: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(400);
  const [stageHeight, setStageHeight] = useState(500);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      setStageHeight(Math.max(1, element.clientHeight));
      setHeight(Math.max(100, Math.min(element.clientHeight * .79, (element.clientWidth - 72) * 16 / 9, 680)));
    };
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
    drag.current = { y: event.clientY, progress: 0, pointer: event.pointerId, index };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const next = stackSwipeProgress(drag.current.y, event.clientY, drag.current.index, POSTER_DESIGNS.length);
    drag.current.progress = next; setProgress(next);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    onSelect(stackSwipeTarget(current.index, current.progress, POSTER_DESIGNS.length));
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const dragTarget = index + Math.sign(progress);
  const cornersOpacity = Math.max(1 - Math.abs(progress), dragTarget >= 0 && dragTarget < POSTER_DESIGNS.length ? Math.abs(progress) : 0);
  return <div className={`poster-picker ${dragging ? "is-dragging" : ""}`}>
    <div ref={stage} className="poster-card-stage" role="listbox" aria-label="Story poster designs" aria-activedescendant={`poster-design-${index}`} tabIndex={0}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={e => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); onSelect(e.key === "Home" ? 0 : e.key === "End" ? POSTER_DESIGNS.length - 1 : index + (["ArrowDown", "PageDown"].includes(e.key) ? 1 : -1));
      }
    }}>
    {POSTER_DESIGNS.map((design, i) => {
      const motion = stackCardStyle({ relativePosition: i - index, dragProgress: progress,
        cardHeight: height, cardWidth: height * 9 / 16, selectedHeight: height, stageHeight, centerPercent: 50 });
      return <div key={design.id} id={`poster-design-${i}`} role="option" aria-selected={i === index} aria-label={`${i + 1} of 10: ${design.name}`} data-poster-index={i}
        className="poster-option" style={{ height, width: height * 9 / 16, ...motion, visibility: Math.abs(i - index - progress) >= 2 ? "hidden" : "visible" }}>
        {previews[i] ? <img src={previews[i]} alt={`${design.name} story poster`} draggable={false} /> : <div className="poster-preparing" aria-busy="true">Preparing…</div>}
      </div>;
    })}
    </div>
    <div className={`cover-selection-corners ${dragging ? "is-dragging" : ""}`}
      style={{ top: "50%", width: height * 9 / 16, height, opacity: cornersOpacity }} aria-hidden="true">
      <span className="is-top-left" /><span className="is-top-right" />
      <span className="is-bottom-right" /><span className="is-bottom-left" />
    </div>
    <nav className="cover-pagination" style={{ top: "50%" }} aria-label="Story poster options">
      {POSTER_DESIGNS.map((design, i) => <button key={design.id} type="button"
        className={i === index ? "is-current" : ""} aria-current={i === index ? "true" : undefined}
        aria-label={`Show story poster ${i + 1} of ${POSTER_DESIGNS.length}`}
        onClick={() => { cancel(); onSelect(i); }} />)}
    </nav>
  </div>;
}
