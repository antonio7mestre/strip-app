"use client";

// Local-only proof route. Not part of the production release.
import { SharePosterPicker } from "@/app/components/SharePosterPicker";
import { StoryShareControls } from "@/app/components/StoryShareControls";
import { CopyStripLinkButton } from "@/app/components/CopyStripLinkButton";
import { StoryShareBackdrop } from "@/app/components/StoryShareBackdrop";
import { StoryShareSaveIcon } from "@/app/components/StoryShareSaveIcon";
import { beginStoryShare, getStoryShareConfirmation, type StoryShareConfirmationData } from "@/app/lib/story-share";
import { useStoryPosters } from "@/app/components/useStoryPosters";
import type { PosterStrip } from "@/app/lib/share-posters";
import { SAVED_LINK_GUIDANCE_CENTER_Y } from "@/app/lib/share-posters";
import source from "./siblings.json";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

const media: Record<string, string> = {
  "1787294808016-lz3n0k": "siblings-cover.webp",
  "1787294872205-knnr7o": "siblings-photo-1.webp",
  "1787294939899-0cotpg": "siblings-photo-2.webp",
  "1787295101603-j0vuhd": "siblings-dog.webp",
  "1791242298463-r8rnbr": "siblings-frame.webp",
};
const strip: PosterStrip = {
  ...source.strip,
  cover: { ...source.strip.cover, src: "/__poster-proof/siblings-cover.webp" },
  blocks: source.strip.blocks.map(block => media[block.id] ? { ...block, src: `/__poster-proof/${media[block.id]}` } : block),
};
export default function PosterProof() {
  const [blockCount, setBlockCount] = useState(7);
  const proofStrip = useMemo(() => blockCount === 7 ? strip : { ...strip,
    blocks: strip.blocks.filter(block => block.type !== "sticker").slice(0, blockCount),
  }, [blockCount]);
  const posters = useStoryPosters(proofStrip);
  const seededDesign = useRef(false);
  // Local-only direct route for inspecting a specific design in Device Hub.
  useEffect(() => {
    if (seededDesign.current || !posters.previews.length) return;
    seededDesign.current = true;
    const design = new URL(window.location.href).searchParams.get("poster-design");
    const index = posters.designs.findIndex(option => option.id === design);
    if (index >= 0) posters.select(index);
  }, [posters.previews.length, posters.designs, posters.select]);
  const [saved, setSaved] = useState(false);
  const [savedFile, setSavedFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState<StoryShareConfirmationData | null>(null);
  const [detail, setDetail] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Local Safari paint check, without needing to open a native share sheet.
  useEffect(() => {
    if (posters.file && new URL(window.location.href).searchParams.has("share-cue-preview")) setSheetOpen(true);
  }, [posters.file]);
  useEffect(() => {
    if (!sheetOpen || !new URL(window.location.href).searchParams.has("share-cue-preview")) return;
    const closeProof = () => setSheetOpen(false);
    window.addEventListener("pointerdown", closeProof, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", closeProof, true);
  }, [sheetOpen]);
  const instagramReady = Boolean(!sheetOpen && savedFile && savedFile === posters.file);
  return <><main className="app-shell share-mode" inert={sheetOpen} data-story-ready={instagramReady}>
    <section className="share-shell" aria-labelledby="share-heading">
      <header className="share-heading"><h1 id="share-heading">Pick your story poster</h1>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:10}} aria-label="Test content block count">
          {[1,2,3,7].map(count => <button key={count} onClick={() => setBlockCount(count)} aria-pressed={blockCount === count}
            style={{border:0,borderRadius:20,padding:"6px 12px",background:blockCount===count?"#FFFFFF":"#303030",color:blockCount===count?"#000000":"#FFFFFF"}}>{count} {count === 1 ? "block" : "blocks"}</button>)}
        </div>
      </header>
      {saved && posters.url ? <div style={{position:"relative",flex:1,minHeight:0,overflow:"hidden"}}><img src={posters.url} alt={`Saved ${posters.designs[posters.index].name} PNG`} style={detail
        ? {position:"absolute",left:"calc(50% - 540px)",top:`calc(50% - ${SAVED_LINK_GUIDANCE_CENTER_Y}px)`,width:1080,height:1920,maxWidth:"none"}
        : {position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}} /></div>
        : <SharePosterPicker previews={posters.previews} index={posters.index} onSelect={posters.select} designs={posters.designs} />}
      <div className="poster-picker-meta">
        {posters.error ? <button onClick={posters.retry}>{posters.error}</button> : null}
        <span>{posters.designs[posters.index].name} · Siblings / {blockCount} content {blockCount === 1 ? "block" : "blocks"}</span>
        {saved ? <button onClick={() => setDetail(value => !value)}>{detail ? "Full poster" : "Link detail"}</button> : null}
        <div className="share-link-anchor">
          <CopyStripLinkButton copied={confirmation?.copied} onCopy={() => {
            setConfirmation({ image: null, copied: null });
            void navigator.clipboard.writeText("https://antonio.striiip.com/1789771007143-ic0p7n").then(
              () => setConfirmation({ image: null, copied: true }),
              () => setConfirmation({ image: null, copied: false }),
            );
          }} />
        </div>
      </div>
    </section>
    <footer className="composer-dock share-dock publish-flow-dock">
      <StoryShareControls
        instagramReady={instagramReady}
        backLabel={saved ? "Preview" : "View PNG"}
        shareLabel={posters.file ? "Save PNG" : "Preparing…"}
        disabled={!posters.file}
        onBack={() => setSaved(value => !value)}
        onShare={() => {
            if (!posters.file) return;
            const file = posters.file;
            setSavedFile(null); setConfirmation(null);
            const { copied, finished } = beginStoryShare({files:[file]}, "https://antonio.striiip.com/1789771007143-ic0p7n", {
              open: () => flushSync(() => setSheetOpen(true)), close: () => setSheetOpen(false),
              download: () => {
                const link=document.createElement("a");link.href=posters.url;link.download=file.name;
                document.body.appendChild(link);link.click();link.remove();posters.remember(file);
              },
            });
            void finished.then(result => {
              if (result !== "cancelled") { setSavedFile(file); posters.remember(file); }
              setConfirmation(getStoryShareConfirmation(result, null));
              void copied.then(success => setConfirmation(getStoryShareConfirmation(result, success)));
            });
          }}
      />
    </footer>
  </main>{typeof document !== "undefined" ? createPortal(
    <StoryShareBackdrop open={sheetOpen}>
      <div className="story-share-hint">
        <div className="story-share-option"><StoryShareSaveIcon /><p>Save to post</p></div>
        <span className="story-share-or">or</span>
        <div className="story-share-option"><img className="story-share-messages-icon" src="/apple-messages.jpg" width="56" height="56" alt="" /><p>Send to friends</p></div>
      </div>
    </StoryShareBackdrop>, document.body,
  ) : null}</>;
}
