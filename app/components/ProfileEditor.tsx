"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, PaintBucket, Palette, Pencil, Pipette, Type } from "lucide-react";
import { PROFILE_COLORS, PROFILE_FONTS, profileInk, profileTitle, type StripProfile } from "@/app/lib/profile";
import { type useStripProfile } from "./useStripProfile";
import { installPageColorDrag, pageColorPickerCenter } from "@/app/lib/page-color-picker";
import { samplePageColorAtPoint as sampleProfilePageColor } from "@/app/lib/page-color-sampler";

type ProfileController = ReturnType<typeof useStripProfile>;
type Props = { controller: ProfileController; username: string | null; publicProfile?: StripProfile };

export function ProfileHeader({ controller, username, publicProfile }: Props) {
  const { pending, update } = controller;
  const profile = publicProfile ?? controller.profile;
  const editing = !publicProfile && controller.editing;
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = titleInput.current;
    if (!editing || !input) return;
    const sizeToContent = () => {
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    };
    sizeToContent();
    window.addEventListener("resize", sizeToContent);
    return () => window.removeEventListener("resize", sizeToContent);
  }, [editing, profile.title, profile.font]);
  return <header className={`profile-header ${editing ? "is-editing" : ""}`}>
    <div className="profile-identity">
      <div className="profile-name">
        {editing ? <textarea ref={titleInput} id="profile-title-input" className="profile-title-input" aria-label="Profile title" rows={1}
          maxLength={60} value={profile.title} placeholder={username || "Your profile"} disabled={pending}
          autoComplete="off" enterKeyHint="done" onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          onChange={(event) => update({ title: event.target.value.replace(/\s*\n\s*/g, " ") })} /> :
          <h1>{profileTitle(profile, username)}</h1>}
        <div className="profile-meta-row">
          {username ? <p className="profile-handle">@{username}</p> : null}
          {username && !editing && !publicProfile ? <span className="profile-meta-divider" aria-hidden="true" /> : null}
          {!editing && !publicProfile ? <button type="button" className="profile-edit-button" disabled={controller.loading || controller.loadFailed}
            onClick={controller.begin}><Pencil aria-hidden="true" />{controller.loading ? "Loading profile…" : "Edit profile"}</button> : null}
        </div>
      </div>
    </div>
    {!publicProfile && controller.loadFailed ? <p className="profile-feedback" role="alert">{controller.error} <button type="button" onClick={controller.retry}>Retry</button></p> : null}
  </header>;
}

type ProfileTool = "background" | "accent" | "font";

function hslToHex(hue: number, lightness: number) {
  const saturation = 1;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0, green = 0, blue = 0;
  if (segment < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (segment < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, secondary];
  else if (segment < 4) [red, green, blue] = [0, secondary, chroma];
  else if (segment < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];
  const match = l - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function hexPosition(hex: string) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue), delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (maximum + minimum) / 2;
  return { hue, lightness: lightness * 100,
    saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) };
}

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
  const activeColor = colorTool ? profile[colorTool] : profile.background;
  const [wheelHue, setWheelHue] = useState(() => hexPosition(activeColor).hue);
  const activePosition = hexPosition(activeColor);
  const position = { ...activePosition, hue: activePosition.saturation > 0 ? activePosition.hue : wheelHue };
  const changeColor = (color: string) => {
    if (!colorTool) return;
    const nextColor = color.toUpperCase();
    const nextPosition = hexPosition(nextColor);
    if (nextPosition.saturation > 0) setWheelHue(nextPosition.hue);
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
  const setWheelPoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const hue = Math.min(359.99, Math.max(0, (event.clientX - bounds.left) / bounds.width * 360));
    const lightness = Math.min(100, Math.max(0, (1 - (event.clientY - bounds.top) / bounds.height) * 100));
    changeColor(hslToHex(hue, lightness));
  };
  const wheelKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    let { hue, lightness } = position;
    if (event.key === "ArrowLeft") hue -= 5;
    else if (event.key === "ArrowRight") hue += 5;
    else if (event.key === "ArrowUp") lightness += 5;
    else if (event.key === "ArrowDown") lightness -= 5;
    else return;
    event.preventDefault(); changeColor(hslToHex((hue + 360) % 360, Math.min(100, Math.max(0, lightness))));
  };

  return <div className={`profile-tools ${wheel ? "is-gradient-picker" : ""}`} aria-label="Edit your profile">
    {controller.error ? <p className="profile-save-error" role="alert">{controller.error}</p> : null}
    {tool ? <div className="profile-selector-row" id="profile-tools-panel" aria-label={tool === "font" ? "Typeface selector" : `${tool} color selector`}>
      <div ref={selectorScrollRef} className={`selector-scroll profile-selector-scroll ${wheel ? "is-gradient-mode" : ""}`} role="group" aria-label={tool === "font" ? "Typeface choices" : `${tool} color choices`}>
        {tool === "font" ? PROFILE_FONTS.map((font) => <button key={font.id} type="button" data-font={font.id}
          className={`selector-option font-selector-option ${profile.font === font.id ? "is-selected" : ""}`}
          style={{ fontFamily: font.family }} aria-label={`${font.label} typeface`} aria-pressed={profile.font === font.id}
          disabled={pending} onClick={() => update({ font: font.id })}>Aa</button>) : wheel ? <div className="full-gradient-picker"
          role="slider" tabIndex={0} aria-label={`Choose any ${tool} color`} aria-valuenow={Math.round(position.lightness)}
          aria-valuemin={0} aria-valuemax={100} aria-valuetext={activeColor}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setWheelPoint(event); }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWheelPoint(event); }}
          onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onKeyDown={wheelKeys}>
          <span className="gradient-picker-value" style={{ left: `${Math.min(94, Math.max(6, position.hue / 360 * 100))}%`,
            top: `${Math.min(72, Math.max(28, 100 - position.lightness))}%`, backgroundColor: activeColor }} aria-hidden="true" />
        </div> : <>{PROFILE_COLORS.map((color) => {
          const selected = activeColor === color.value;
          return <button key={color.value} type="button" className={`selector-option color-selector-option color-swatch-option ${selected ? "is-selected" : ""}`}
            style={{ backgroundColor: color.value, color: profileInk(color.value), "--swatch-foreground": profileInk(color.value) } as CSSProperties}
            aria-label={`${color.name} ${tool}`} aria-pressed={selected} disabled={pending}
            onClick={() => { setPickingPage(false); changeColor(color.value); }}>{selected ? <Check className="swatch-check" aria-hidden="true" /> : null}</button>;
        })}
          <button type="button" className="selector-option color-selector-option gradient-trigger" aria-label={`Open the ${tool} color wheel`}
            onClick={() => { setPickingPage(false); setWheel(true); }}><Palette aria-hidden="true" /></button>
          <button type="button" className="selector-option color-selector-option page-color-trigger"
            style={{ backgroundColor: activeColor, color: profileInk(activeColor) }} aria-label={`Match a ${tool} color from the page`}
            aria-pressed={pickingPage} onClick={startPagePicker}><Pipette aria-hidden="true" /></button>
        </>}
      </div>
      <div className="selector-leading"><button type="button" className="dock-icon-button selector-back-button"
        aria-label="Done choosing styles" onClick={leaveTool}><Check className="dock-glyph" aria-hidden="true" /></button></div>
    </div> : <div className="profile-tool-row" aria-label="Profile editor toolbar">
      <button type="button" className="dock-icon-button profile-tool-icon profile-cancel-button" aria-label="Cancel editing" disabled={pending} onClick={cancel}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="dock-icon-button profile-tool-icon" aria-label="Background color" onClick={() => chooseTool("background")}><PaintBucket aria-hidden="true" /></button>
      <button type="button" className="dock-icon-button profile-tool-icon" aria-label="Accent color" onClick={() => chooseTool("accent")}><Palette aria-hidden="true" /></button>
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

export function profilePageStyle(controller: Pick<ProfileController, "profile">): CSSProperties {
  const { profile } = controller;
  return {
    "--profile-background": profile.background,
    "--profile-ink": profileInk(profile.background),
    "--profile-accent": profile.accent,
    "--profile-accent-ink": profileInk(profile.accent),
    "--profile-font": PROFILE_FONTS.find(({ id }) => id === profile.font)?.family,
  } as CSSProperties;
}
