"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_PROFILE, applyProfileChanges, profileColorsReadable, PROFILE_COLOR_ERROR, type StripProfile } from "@/app/lib/profile";

export function useStripProfile(userId: string | undefined) {
  const [owner, setOwner] = useState<string>();
  const [saved, setSaved] = useState<StripProfile>(DEFAULT_PROFILE);
  const [draft, setDraft] = useState<StripProfile | null>(null);
  const [photo, setPhoto] = useState<string | null | undefined>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const currentUser = useRef(userId);
  useLayoutEffect(() => { currentUser.current = userId; }, [userId]);
  const saving = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void fetch("/api/profile", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { profile?: StripProfile; error?: string };
        if (!response.ok || !data.profile) throw new Error(data.error || "Could not load your profile.");
        if (!controller.signal.aborted) {
          setOwner(userId); setSaved(data.profile); setDraft(null); setPhoto(undefined);
          setError(""); setLoadFailed(false);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOwner(userId); setSaved(DEFAULT_PROFILE); setDraft(null); setPhoto(undefined);
        setLoadFailed(true);
        setError(cause instanceof Error ? cause.message : "Could not load your profile.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, reload]);

  const begin = () => {
    if (loading || loadFailed || !userId || owner !== userId) return;
    setError(""); setPhoto(undefined); setDraft({ ...saved });
  };
  const cancel = useCallback(() => {
    if (saving.current) return;
    setDraft(null); setPhoto(undefined); setError("");
  }, []);
  const save = async () => {
    if (!draft || saving.current || preparingPhoto || !userId) return;
    if (!profileColorsReadable(draft)) { setError(PROFILE_COLOR_ERROR); return; }
    const savingUser = userId;
    saving.current = true;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, photo }),
      });
      const data = await response.json() as { profile?: StripProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Could not save your profile.");
      if (currentUser.current !== savingUser) return;
      setSaved(data.profile); setDraft(null); setPhoto(undefined);
    } catch (cause) {
      if (currentUser.current === savingUser) setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally { saving.current = false; setPending(false); }
  };
  const update = (changes: Partial<StripProfile>) => {
    setError("");
    setDraft((value) => value ? applyProfileChanges(value, changes) : value);
  };
  const changePhoto = (value: string | null) => { setPhoto(value); update({ photoUrl: value }); };
  const dirty = draft !== null && (
    draft.title !== saved.title || draft.font !== saved.font ||
    draft.background !== saved.background || draft.accent !== saved.accent ||
    draft.photoUrl !== saved.photoUrl || photo !== undefined
  );
  return {
    profile: owner === userId ? draft ?? saved : DEFAULT_PROFILE,
    editing: owner === userId && draft !== null, dirty: owner === userId && dirty,
    loading: Boolean(userId && (owner !== userId || loading)),
    pending: pending || preparingPhoto, preparingPhoto, setPreparingPhoto,
    error: owner === userId ? error : "", loadFailed: owner === userId && loadFailed,
    begin, cancel, save, update, changePhoto,
    retry: () => { setLoading(true); setReload((value) => value + 1); },
  };
}

/** Decode once, discard metadata, and keep avatars small before uploading. */
export async function prepareProfilePhoto(file: File) {
  if (!file.type.startsWith("image/") || file.type.includes("svg") || file.size > 25 * 1024 * 1024) {
    throw new Error("Choose a photo under 25 MB.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("Choose another photo.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare your photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally { URL.revokeObjectURL(url); }
}
