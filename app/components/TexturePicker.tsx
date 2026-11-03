"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Slash } from "lucide-react";
import { TEXT_TEXTURES, textTexture } from "@/app/lib/text-textures";
import styles from "./TexturePicker.module.css";
import stickerStyles from "./StickerPicker.module.css";

export function TexturePicker({ open, selected, onSelect, onClose }: {
  open: boolean; selected?: string; onSelect: (id?: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    let frame = 0, timer = 0;
    if (open) {
      node.showModal();
      frame = requestAnimationFrame(() => setShown(true));
    } else {
      ++request.current; setPending(undefined); setError(""); setShown(false);
      timer = window.setTimeout(() => node.close(), 240);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [open]);
  useEffect(() => () => { ++request.current; }, []);

  const choose = async (id?: string) => {
    const version = ++request.current, texture = textTexture(id);
    setError(""); setPending(id);
    if (texture) {
      const image = new Image(); image.src = texture.src;
      try { await image.decode(); }
      catch { if (version === request.current) { setPending(undefined); setError("Couldn't load that texture. Try again."); } return; }
    }
    if (version !== request.current) return;
    setPending(undefined); onSelect(texture?.id);
  };

  if (typeof document === "undefined") return null;
  return createPortal(<dialog ref={dialog} className={`${styles.tray} ${shown ? styles.shown : ""}`}
    aria-labelledby="texture-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right)) onClose();
    }}>
    <header className={`${stickerStyles.packHeader} ${styles.header}`}>
      <button className={stickerStyles.packIconButton} type="button" aria-label="Back to background colors" onClick={onClose}><ArrowLeft aria-hidden="true" /></button>
      <h2 id="texture-picker-title">Textures</h2>
      <button className={stickerStyles.packIconButton} type="button" aria-label="Done choosing textures" onClick={onClose}><Check aria-hidden="true" /></button>
    </header>
    <div className={styles.row} role="group" aria-label="Texture choices">
      <button type="button" className={`${styles.option} ${styles.none}`} aria-label="No texture" aria-pressed={!selected}
        onClick={() => void choose()}><Slash aria-hidden="true" /></button>
      {TEXT_TEXTURES.map(texture => <button type="button" key={texture.id} className={styles.option}
        aria-label={texture.label} aria-pressed={selected === texture.id} aria-busy={pending === texture.id}
        style={{ color: texture.checkColor }}
        onClick={() => void choose(texture.id)}>
        <img src={texture.thumbnail} alt="" loading="lazy" width={240} height={240} draggable={false} />
        {selected === texture.id && <span className={styles.check}><Check aria-hidden="true" /></span>}
      </button>)}
    </div>
    <p className={styles.error} role="status">{error}</p>
  </dialog>, document.body);
}
