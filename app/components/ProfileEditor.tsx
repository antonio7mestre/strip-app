"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Camera, Check, Palette, Pencil, Type, UserRound } from "lucide-react";
import { PROFILE_COLORS, PROFILE_FONTS, profileInk, profileTitle } from "@/app/lib/profile";
import { prepareProfilePhoto, type useStripProfile } from "./useStripProfile";

type ProfileController = ReturnType<typeof useStripProfile>;
type Props = { controller: ProfileController; username: string | null; count: number; loading: boolean };

export function ProfileHeader({ controller, username, count, loading }: Props) {
  const { profile, editing, pending, update } = controller;
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoRequest = useRef(0);
  useEffect(() => {
    if (!editing) photoRequest.current += 1;
  }, [editing]);
  useEffect(() => () => { photoRequest.current += 1; }, []);
  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    const request = ++photoRequest.current;
    setPhotoBusy(true); controller.setPreparingPhoto(true); setPhotoError("");
    try {
      const photo = await prepareProfilePhoto(file);
      if (request === photoRequest.current) controller.changePhoto(photo);
    } catch (cause) {
      if (request === photoRequest.current) setPhotoError(cause instanceof Error ? cause.message : "Choose another photo.");
    } finally { controller.setPreparingPhoto(false); if (request === photoRequest.current) setPhotoBusy(false); }
  };
  return <header className={`profile-header ${editing ? "is-editing" : ""}`}>
    <div className="profile-eyebrow"><span>Your Strip profile</span><span className="profile-brand">striiip</span></div>
    <div className="profile-identity">
      <div className="profile-photo-column">
        <button type="button" className="profile-avatar" aria-label={editing ? "Change profile photo" : "Edit profile photo"}
          disabled={pending || photoBusy || controller.loading || controller.loadFailed}
          onClick={() => { if (!editing) controller.begin(); photoInput.current?.click(); }}>
          {profile.photoUrl ? <img src={profile.photoUrl} alt="Your profile" /> : <UserRound aria-hidden="true" />}
          {editing ? <span className="profile-avatar-edit"><Camera aria-hidden="true" /></span> : null}
        </button>
        {editing && profile.photoUrl ? <button type="button" className="profile-remove-photo" disabled={pending || photoBusy}
          onClick={() => controller.changePhoto(null)}>Remove</button> : null}
        <input ref={photoInput} id="profile-photo-input" type="file" accept="image/*" hidden
          onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      <div className="profile-name">
        {editing ? <input id="profile-title-input" className="profile-title-input" aria-label="Profile title" type="text"
          maxLength={60} value={profile.title} placeholder={username || "Your profile"} disabled={pending}
          autoComplete="off" enterKeyHint="done" onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          onChange={(event) => update({ title: event.target.value })} /> :
          <h1>{profileTitle(profile, username)}</h1>}
        {username ? <p className="profile-handle">@{username}</p> : null}
      </div>
    </div>
    {editing ? <p className="profile-edit-hint">Tap your photo or title to make it yours.</p> :
      <button type="button" className="profile-edit-button" disabled={controller.loading || controller.loadFailed}
        onClick={controller.begin}><Pencil aria-hidden="true" />{controller.loading ? "Loading profile…" : "Edit profile"}</button>}
    {editing && photoBusy ? <p className="profile-feedback" role="status">Preparing photo…</p> : null}
    {editing && photoError ? <p className="profile-feedback" role="alert">{photoError}</p> : null}
    {controller.loadFailed ? <p className="profile-feedback" role="alert">{controller.error} <button type="button" onClick={controller.retry}>Retry</button></p> : null}
    <div className="profile-collection-label"><span>Your Strips</span><span>{loading ? "…" : count}</span></div>
  </header>;
}

export function ProfileTools({ controller }: { controller: ProfileController }) {
  const [tab, setTab] = useState<"edit" | "design">("edit");
  const [tool, setTool] = useState<"background" | "accent" | "font">("background");
  const { profile, update, pending } = controller;
  const initialFocus = useRef<HTMLButtonElement>(null);
  useEffect(() => { initialFocus.current?.focus({ preventScroll: true }); }, []);
  const focusTitle = () => {
    const input = document.querySelector<HTMLInputElement>("#profile-title-input");
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return <div className="profile-tools" aria-label="Edit your profile">
    <div className="profile-tool-tabs" role="tablist" aria-label="Profile tools">
      <button ref={initialFocus} id="profile-edit-tab" type="button" role="tab" aria-selected={tab === "edit"} aria-controls="profile-tools-panel" onClick={() => setTab("edit")}><Pencil aria-hidden="true" />Edit</button>
      <button id="profile-design-tab" type="button" role="tab" aria-selected={tab === "design"} aria-controls="profile-tools-panel" onClick={() => setTab("design")}><Palette aria-hidden="true" />Design</button>
    </div>
    <div className="profile-tools-panel" id="profile-tools-panel" role="tabpanel" aria-labelledby={`profile-${tab}-tab`}>
      {tab === "edit" ? <div className="profile-edit-actions">
        <button type="button" disabled={pending} onClick={() => document.querySelector<HTMLInputElement>("#profile-photo-input")?.click()}><Camera aria-hidden="true" /><span>Photo</span></button>
        <button type="button" disabled={pending} onClick={focusTitle}><Type aria-hidden="true" /><span>Title</span></button>
      </div> : <>
        <div className="profile-design-options" aria-label="Design tools">
          {(["background", "accent", "font"] as const).map((item) => <button key={item} type="button" aria-pressed={tool === item} onClick={() => setTool(item)}>{item === "background" ? "Background" : item === "accent" ? "Accent" : "Font"}</button>)}
        </div>
        {tool === "font" ? <div className="profile-font-options" aria-label="Profile font">
          {PROFILE_FONTS.map((font) => <button key={font.id} type="button" disabled={pending} style={{ fontFamily: font.family }}
            aria-pressed={profile.font === font.id} onClick={() => update({ font: font.id })}>{font.label}</button>)}
        </div> : <div className="profile-color-options" aria-label={`${tool} color`}>
          {PROFILE_COLORS.map((color) => <button type="button" key={color.value} disabled={pending}
            aria-label={`${color.name} ${tool}`} aria-pressed={profile[tool] === color.value}
            style={{ backgroundColor: color.value, color: profileInk(color.value) }} onClick={() => update({ [tool]: color.value })}>
            {profile[tool] === color.value ? <Check aria-hidden="true" /> : null}
          </button>)}
          <label className="profile-custom-color" title="Custom color"><Palette aria-hidden="true" />
            <input type="color" value={profile[tool]} aria-label={`Custom ${tool} color`} disabled={pending} onChange={(event) => update({ [tool]: event.target.value.toUpperCase() })} />
          </label>
        </div>}
      </>}
    </div>
    {controller.error ? <p className="profile-save-error" role="alert">{controller.error}</p> : null}
    <div className="profile-save-actions">
      <button type="button" disabled={pending} onClick={controller.cancel}><ArrowLeft aria-hidden="true" />Cancel</button>
      <button type="button" className="profile-save-button" disabled={pending} onClick={() => void controller.save()}>{controller.preparingPhoto ? "Preparing…" : pending ? "Saving…" : "Save"}<Check aria-hidden="true" /></button>
    </div>
  </div>;
}

export function profilePageStyle(controller: ProfileController): CSSProperties {
  const { profile } = controller;
  return {
    "--profile-background": profile.background,
    "--profile-ink": profileInk(profile.background),
    "--profile-accent": profile.accent,
    "--profile-accent-ink": profileInk(profile.accent),
    "--profile-font": PROFILE_FONTS.find(({ id }) => id === profile.font)?.family,
  } as CSSProperties;
}
