"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { textTexture, textureControlsGeometry } from "@/app/lib/text-textures";
import { BlockMediaPlaceholder } from "./BlockMediaPlaceholder";

/** One stable image node in all three views, never detached on scroll. */
export function TextBlockTexture({ id, color, controlsVisible = false, onReady }: { id: string; color?: string; controlsVisible?: boolean; onReady: (status: "loaded" | "error", image: HTMLImageElement) => void }) {
  const image = useRef<HTMLImageElement>(null), callback = useRef(onReady);
  callback.current = onReady;
  const texture = textTexture(id);
  const [painted, setPainted] = useState("");
  const [failed, setFailed] = useState("");
  useLayoutEffect(() => {
    const node = image.current, viewport = node?.parentElement, block = viewport?.parentElement;
    const controls = block?.querySelector<HTMLElement>(".block-controls.has-texture-surface");
    if (!node || !viewport || !block || !controlsVisible || !controls) return;
    const sync = () => {
      if (!node.naturalWidth || !viewport.clientWidth || !viewport.clientHeight) return;
      const geometry = textureControlsGeometry(node.naturalWidth, node.naturalHeight,
        viewport.clientWidth, viewport.clientHeight, controls.clientWidth, controls.clientHeight,
        parseFloat(getComputedStyle(controls).top) || 0);
      block.style.setProperty("--texture-controls-extension", `${geometry.extension}px`);
      block.style.setProperty("--texture-controls-size", geometry.backgroundSize);
      block.style.setProperty("--texture-controls-position", geometry.backgroundPosition);
    };
    const resize = new ResizeObserver(sync);
    resize.observe(viewport); resize.observe(controls);
    node.addEventListener("load", sync); sync();
    return () => {
      resize.disconnect(); node.removeEventListener("load", sync);
      for (const property of ["--texture-controls-extension", "--texture-controls-size", "--texture-controls-position"]) block.style.removeProperty(property);
    };
  }, [texture?.src, controlsVisible]);
  useEffect(() => {
    const node = image.current;
    if (!node) return;
    let cancelled = false;
    let frame = 0;
    const sync = () => { if (!cancelled && node.complete && node.naturalWidth && node.clientWidth && node.clientHeight) callback.current("loaded", node); };
    const resize = new ResizeObserver(sync);
    void node.decode().then(() => { if (!cancelled) {
      sync(); resize.observe(node);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setPainted(id)); });
    } }, () => { if (!cancelled) { setFailed(id); callback.current("error", node); } });
    return () => { cancelled = true; cancelAnimationFrame(frame); resize.disconnect(); };
  }, [texture?.src]);
  return texture ? <>
    <BlockMediaPlaceholder ready={painted === id || failed === id} previewSrc={texture.thumbnail} color={color} />
    <img ref={image} className="text-block-texture" src={texture.src} alt="" draggable={false}
      style={{ opacity: painted === id ? 1 : 0, transition: "opacity 420ms cubic-bezier(.2,.7,.2,1)" }} />
  </> : null;
}
