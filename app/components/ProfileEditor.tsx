"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Baseline, Check, ChevronLeft, PaintBucket, Palette, Pencil, Pipette, Type } from "lucide-react";
import { PROFILE_COLORS, PROFILE_FONTS, profileInk, profileTextColor, profileTitle, type StripProfile } from "@/app/lib/profile";
import { type useStripProfile } from "./useStripProfile";
import { installPageColorDrag, pageColorPickerCenter } from "@/app/lib/page-color-picker";
import { samplePageColorAtPoint as sampleProfilePageColor } from "@/app/lib/page-color-sampler";
import { GradientColorPicker } from "./GradientColorPicker";

type ProfileController = ReturnType<typeof useStripProfile>;
type Props = { controller: ProfileController; username: string | null; publicProfile?: StripProfile };

export function ProfileHeader({ controller, username, publicProfile }: Props) {
  const { pending, update } = controller;
  const profile = publicProfile ?? controller.profile;
  const editing = !publicProfile && controller.editing;
  const titleInput = useRef<HTMLHeadingElement>(null);
  // React owns the heading, the browser owns its text/caret while typing.
  const initialTitle = useRef(profileTitle(profile, username));
  useLayoutEffect(() => {
    const input = titleInput.current;
    if (!input) return;
    const text = editing ? profile.title : profileTitle(profile, username);
    if (input.textContent !== text) input.textContent = text;
  }, [editing, profile.title, username]);
  const updateTitle = (input: HTMLHeadingElement) => {
    const text = (input.textContent ?? "").replace(/[\r\n]+/g, " ").slice(0, 60);
    if (input.textContent !== text) {
      input.textContent = text;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input); range.collapse(false);
      selection?.removeAllRanges(); selection?.addRange(range);
    }
    update({ title: text });
  };
  return <header className={`profile-header ${editing ? "is-editing" : ""}`}>
    <div className="profile-identity">
      <div className="profile-name">
        <h1 ref={titleInput} id="profile-title-input" className="profile-title-input" aria-label={editing ? "Profile title" : undefined}
          contentEditable={editing && !pending ? "plaintext-only" : false} suppressContentEditableWarning
          role={editing ? "textbox" : undefined} aria-multiline={editing ? false : undefined}
          data-placeholder={username || "Your profile"} enterKeyHint="done" spellCheck={false}
          onKeyDown={(event) => { if (editing && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.blur(); } }}
          onInput={(event) => { if (editing && !(event.nativeEvent as InputEvent).isComposing) updateTitle(event.currentTarget); }}
          onCompositionEnd={(event) => { if (editing) updateTitle(event.currentTarget); }}
          onPaste={(event) => {
            if (!editing) return;
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
            document.execCommand("insertText", false, text);
            updateTitle(event.currentTarget);
          }}>{initialTitle.current}</h1>
        <div className="profile-meta-row">
          {username ? <p className="profile-handle">@{username}</p> : null}
          {username && !publicProfile ? <span className="profile-meta-divider" aria-hidden="true" /> : null}
          {!publicProfile ? <button type="button" className="profile-edit-button" disabled={editing || controller.loading || controller.loadFailed}
            onClick={controller.begin}><Pencil aria-hidden="true" />{controller.loading ? "Loading profile…" : "Edit profile"}</button> : null}
        </div>
      </div>
    </div>
    {!publicProfile && controller.loadFailed ? <p className="profile-feedback" role="alert">{controller.error} <button type="button" onClick={controller.retry}>Retry</button></p> : null}
  </header>;
}

type ProfileTool = "background" | "accent" | "font";

export function ProfileTools({ controller }: { controller: ProfileController }) {
  const [tool, setTool] = useState<ProfileTool | null>(null);
  const [wheel, setWheel] = useState(false);
  const [pickingPage, setPickingPage] = useState(false);
  const [pickerPoint, setPickerPoint] = useState<{ x: number; y: number; color: string } | null>(null);
  const selectorScrollRef = useRef<HTMLDivElement>(null);
  const [pickerDragging, setPickerDragging] = useState(false);
  const samplePointRef = useRef<(x: number, y: number) => void>(() => {});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const { profile, update, pending } = controller;
  const colorTool = tool === "background" || tool === "accent" ? tool : null;
  const colorLabel = tool === "accent" ? "text" : "background";
  const activeColor = colorTool ? profile[colorTool] : profile.background;
  const changeColor = (color: string) => {
    if (!colorTool) return;
    const nextColor = color.toUpperCase();
    update({ [colorTool]: nextColor });
  };
  const chooseTool = (next: ProfileTool) => { setTool(next); setWheel(false); setPickingPage(false); setPickerPoint(null); };
  const leaveTool = () => { setTool(null); setWheel(false); setPickingPage(false); setPickerPoint(null); };
  const cancel = () => controller.dirty ? setConfirmCancel(true) : controller.cancel();

  useEffect(() => { if (confirmCancel) keepEditing.current?.focus(); }, [confirmCancel]);
  useEffect(() => {
    if (!tool) return;
    const frame = window.requestAnimationFrame(() => {
      if (selectorScrollRef.current) selectorScrollRef.current.scrollLeft = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tool, wheel]);
  useEffect(() => {
    if (!pickingPage) return;
    return installPageColorDrag({
      onSample: (x, y) => samplePointRef.current(x, y),
      onDraggingChange: setPickerDragging,
    });
  }, [pickingPage]);
  const updatePickerPoint = (clientX: number, clientY: number) => {
    const color = sampleProfilePageColor(clientX, clientY);
    if (!color) return;
    setPickerPoint({ x: clientX + window.scrollX, y: clientY + window.scrollY, color });
    changeColor(color);
  };
  useLayoutEffect(() => { samplePointRef.current = updatePickerPoint; });
  const startPagePicker = () => {
    const { x, y } = pageColorPickerCenter(window);
    setWheel(false); setPickingPage(true);
    const color = sampleProfilePageColor(x, y) ?? activeColor;
    setPickerPoint({ x: x + window.scrollX, y: y + window.scrollY, color });
    changeColor(color);
  };
  return <div className={`profile-tools ${wheel ? "is-gradient-picker" : ""}`} aria-label="Edit your profile">
    {controller.error && typeof document !== "undefined" ? createPortal(<p className="notice profile-save-notice" role="alert">{controller.error}</p>, document.body) : null}
    {tool ? <div className="profile-selector-row" id="profile-tools-panel" aria-label={tool === "font" ? "Typeface selector" : `${colorLabel} color selector`}>
      <div ref={selectorScrollRef} className={`selector-scroll profile-selector-scroll ${wheel ? "is-gradient-mode" : ""}`} role="group" aria-label={tool === "font" ? "Typeface choices" : `${colorLabel} color choices`}>
        {tool === "font" ? PROFILE_FONTS.map((font) => <button key={font.id} type="button" data-font={font.id}
          className={`selector-option font-selector-option ${profile.font === font.id ? "is-selected" : ""}`}
          style={{ fontFamily: font.family }} aria-label={`${font.label} typeface`} aria-pressed={profile.font === font.id}
          disabled={pending} onClick={() => update({ font: font.id })}>Aa</button>) : wheel ? <GradientColorPicker
          color={activeColor} onChange={changeColor} label={`Choose any ${colorLabel} color`} /> : <>{PROFILE_COLORS.map((color) => {
          const selected = activeColor === color.value;
          return <button key={color.value} type="button" className={`selector-option color-selector-option color-swatch-option ${selected ? "is-selected" : ""}`}
            style={{ backgroundColor: color.value, color: profileInk(color.value), "--swatch-foreground": profileInk(color.value) } as CSSProperties}
            aria-label={`${color.name} ${colorLabel}`} aria-pressed={selected} disabled={pending}
            onClick={() => { setPickingPage(false); changeColor(color.value); }}>{selected ? <Check className="swatch-check" aria-hidden="true" /> : null}</button>;
        })}
          <button type="button" className="selector-option color-selector-option gradient-trigger" aria-label={`Open the ${colorLabel} color wheel`}
            onClick={() => { setPickingPage(false); setWheel(true); }}><Palette aria-hidden="true" /></button>
          <button type="button" className="selector-option color-selector-option page-color-trigger"
            style={{ backgroundColor: activeColor, color: profileInk(activeColor) }} aria-label={`Match a ${colorLabel} color from the page`}
            aria-pressed={pickingPage} onClick={startPagePicker}><Pipette aria-hidden="true" /></button>
        </>}
      </div>
      <div className="selector-leading"><button type="button" className="dock-icon-button selector-back-button"
        aria-label="Done choosing styles" onClick={leaveTool}><Check className="dock-glyph" aria-hidden="true" /></button></div>
    </div> : <div className="profile-tool-row" aria-label="Profile editor toolbar">
      <button type="button" className="dock-icon-button profile-tool-icon profile-cancel-button" aria-label="Cancel editing" disabled={pending} onClick={cancel}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="dock-icon-button profile-tool-icon" aria-label="Background color" onClick={() => chooseTool("background")}><PaintBucket aria-hidden="true" /></button>
      <button type="button" className="dock-icon-button profile-tool-icon" aria-label="Text color" onClick={() => chooseTool("accent")}><Baseline aria-hidden="true" /></button>
      <button type="button" className="dock-icon-button profile-tool-icon" aria-label="Profile font" onClick={() => chooseTool("font")}><Type aria-hidden="true" /></button>
      <button type="button" className="profile-save-button" disabled={pending} onClick={() => void controller.save()}>{pending ? "Saving…" : "Save"}</button>
    </div>}
    {pickingPage && pickerPoint && typeof document !== "undefined" ? createPortal(<button type="button" className={`page-color-picker-indicator ${pickerDragging ? "is-dragging" : ""}`}
      style={{ left: pickerPoint.x, top: pickerPoint.y, color: pickerPoint.color }} aria-label="Drag to sample a page color"
      onKeyDown={(event) => {
        const step = 10;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        event.preventDefault(); updatePickerPoint(pickerPoint.x - window.scrollX + dx, pickerPoint.y - window.scrollY + dy);
      }}><span className="page-color-picker-indicator-core" /></button>, document.body) : null}
    {confirmCancel && typeof document !== "undefined" ? createPortal(<div className="profile-discard-backdrop">
      <button type="button" className="profile-discard-shade" aria-label="Keep editing" onClick={() => setConfirmCancel(false)} />
      <div className="profile-discard-card" role="alertdialog" aria-modal="true" aria-labelledby="profile-discard-title">
        <strong id="profile-discard-title">Discard profile changes?</strong>
        <div><button ref={keepEditing} type="button" onClick={() => setConfirmCancel(false)}>Keep editing</button>
          <button type="button" onClick={() => { setConfirmCancel(false); controller.cancel(); }}>Discard changes</button></div>
      </div></div>, document.body) : null}
  </div>;
}

export function profilePageStyle(controller: Pick<ProfileController, "profile"> & { editing?: boolean }): CSSProperties {
  const { profile } = controller;
  return {
    "--profile-background": profile.background,
    "--profile-ink": profileTextColor(profile, controller.editing),
    "--profile-ui-ink": profileInk(profile.background),
    "--profile-accent": profile.accent,
    "--profile-accent-ink": profileInk(profile.accent),
    "--profile-font": PROFILE_FONTS.find(({ id }) => id === profile.font)?.family,
  } as CSSProperties;
}
