"use client";

import { DockViewport } from "./DockViewport";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, LoaderCircle, Slash } from "lucide-react";
import { TEXT_TEXTURES, textTexture } from "@/app/lib/text-textures";
import { installStickerPickerDismiss } from "@/app/lib/sticker-picker-dismiss";
import { installStickerTrayScroll } from "@/app/lib/sticker-tray-scroll";
import styles from "./TexturePicker.module.css";
import stickerStyles from "./StickerPicker.module.css";

export function TexturePicker({ open, selected, onSelect, onClose, onDone }: {
  open: boolean; selected?: string; onSelect: (id?: string) => void; onClose: () => void; onDone: () => void;
}) {
  const tray = useRef<HTMLElement>(null), row = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const request = useRef(0);
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    let frame = 0, timer = 0;
    if (open) {
      setPresent(true);
      frame = requestAnimationFrame(() => setShown(true));
    } else {
      ++request.current; setPending(undefined); setError(""); setShown(false);
      timer = window.setTimeout(() => setPresent(false), 240);
    }
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [open]);
  useEffect(() => {
    if (!open || !present) return;
    // Match the sticker tray, not Safari's native dialog top layer. A modal
    // top layer can retain its old chrome tint and restore a touch focus ring.
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const keyboard = origin?.matches(":focus-visible") ?? false;
    const buttons = () => Array.from(tray.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (keyboard) buttons()[0]?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const choices = buttons(), first = choices[0], last = choices.at(-1);
      if (!tray.current?.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      }
    };
    const dismiss = installStickerPickerDismiss(() => [tray.current], () => close.current());
    const scroll = installStickerTrayScroll(() => null, () => [row.current]);
    document.addEventListener("keydown", key);
    return () => {
      dismiss(); scroll(); document.removeEventListener("keydown", key);
      if (tray.current?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (keyboard && origin?.isConnected && !origin.closest('[aria-hidden="true"]')) origin.focus({ preventScroll: true });
    };
  }, [open, present]);
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

  if (typeof document === "undefined" || !present) return null;
  return createPortal(<DockViewport layer={90}><section ref={tray} role="dialog" aria-modal="true" aria-hidden={!open}
    className={`${styles.tray} ${shown ? styles.shown : ""}`}
    aria-labelledby="texture-picker-title" onClick={event => event.stopPropagation()}>
    <header className={`${stickerStyles.packHeader} ${styles.header}`}>
      <button className={stickerStyles.packIconButton} type="button" aria-label="Back to background colors" onClick={onClose}><ArrowLeft aria-hidden="true" /></button>
      <h2 id="texture-picker-title">Textures</h2>
      <button className={stickerStyles.packIconButton} type="button" aria-label="Done choosing textures" onClick={onDone} disabled={Boolean(pending)}><Check aria-hidden="true" /></button>
    </header>
    <div ref={row} className={styles.row} role="group" aria-label="Texture choices">
      <button type="button" className={`${styles.option} ${styles.none}`} aria-label="No texture" aria-pressed={!selected}
        onClick={() => void choose()}><Slash aria-hidden="true" /></button>
      {TEXT_TEXTURES.map(texture => <button type="button" key={texture.id} className={styles.option}
        aria-label={texture.label} aria-pressed={selected === texture.id} aria-busy={pending === texture.id}
        style={{ color: texture.checkColor }}
        onClick={() => void choose(texture.id)}>
        <img src={texture.thumbnail} alt="" loading="lazy" width={240} height={240} draggable={false} />
        <span className={styles.check} aria-hidden="true">
          <LoaderCircle className={`${styles.loading} ${pending === texture.id ? styles.visible : ""}`} />
          <Check className={selected === texture.id && pending !== texture.id ? styles.visible : ""} />
        </span>
      </button>)}
    </div>
    <p className={styles.error} role="status">{error}</p>
  </section></DockViewport>, document.body);
}
