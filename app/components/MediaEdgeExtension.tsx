"use client";

import { useLayoutEffect, useRef } from "react";
import { getMediaEdgeSlice, paintMediaEdge } from "@/app/lib/media-edge";

export function MediaEdgeExtension({ src, cropTop, cropHeight }: {
  src: string;
  cropTop?: number;
  cropHeight?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refreshRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const block = canvas?.parentElement;
    const viewport = block?.querySelector<HTMLElement>(".block-crop-viewport");
    const media = block?.querySelector<HTMLImageElement | HTMLVideoElement>(
      ".block-crop-content > img, .block-crop-content > video",
    );
    const context = canvas?.getContext("2d");
    if (!canvas || !block || !viewport || !media || !context) return;
    context.resetTransform();
    context.clearRect(0, 0, canvas.width, canvas.height);

    const video = media instanceof HTMLVideoElement ? media : null;
    const transitions = new Set<string>();
    let visible = true;
    let disposed = false;
    let animationFrame: number | null = null;
    let videoFrame: number | null = null;

    function draw() {
      if (disposed || !visible || document.hidden) return;
      const sourceWidth = video ? video.videoWidth : (media as HTMLImageElement).naturalWidth;
      const sourceHeight = video ? video.videoHeight : (media as HTMLImageElement).naturalHeight;
      if (!sourceWidth || !sourceHeight || (video && video.readyState < 2)) return;
      const mediaBounds = media!.getBoundingClientRect();
      const viewportBounds = viewport!.getBoundingClientRect();
      const bounds = canvas!.getBoundingClientRect();
      const bottom = Math.min(viewportBounds.bottom, mediaBounds.bottom);
      const overlap = Math.max(0, Math.min(bounds.height, bottom - bounds.top));
      const slice = getMediaEdgeSlice({
        sourceHeight,
        renderedHeight: mediaBounds.height,
        visibleBottom: bottom - mediaBounds.top,
        visibleHeight: bottom - Math.max(viewportBounds.top, mediaBounds.top),
        extensionHeight: bounds.height - overlap,
      });
      if (!slice || bounds.width <= 0) return;

      // A small decorative strip, not a second video player or full-frame copy.
      // Match Retina image pixels at the join, including 3x iPhone displays.
      const density = Math.min(window.devicePixelRatio || 1, 3);
      const width = Math.max(1, Math.round(bounds.width * density));
      const height = Math.max(1, Math.round(bounds.height * density));
      if (canvas!.width !== width) canvas!.width = width;
      if (canvas!.height !== height) canvas!.height = height;
      try {
        paintMediaEdge(context!, media!, sourceWidth, slice, width, height, {
          height: Math.min(height - 1, Math.round(overlap * height / bounds.height)),
          sourceHeight: Math.min(
            slice.top + slice.height,
            overlap * sourceHeight / mediaBounds.height,
          ),
        });
      } catch {
        // Media may briefly be unavailable during a source change or seek.
      }
    }

    function stopFrames() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (videoFrame !== null) video?.cancelVideoFrameCallback(videoFrame);
      animationFrame = null;
      videoFrame = null;
    }

    function queueFrames() {
      if (disposed || !visible || document.hidden) return;
      const playing = video && !video.paused && !video.ended;
      if (playing && video.requestVideoFrameCallback && videoFrame === null) {
        videoFrame = video.requestVideoFrameCallback(() => {
          videoFrame = null;
          draw();
          queueFrames();
        });
      }
      if (
        animationFrame === null &&
        (transitions.size > 0 || (playing && !video.requestVideoFrameCallback))
      ) {
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          draw();
          queueFrames();
        });
      }
    }

    function refresh() {
      stopFrames();
      draw();
      queueFrames();
    }

    function onTransition(event: TransitionEvent) {
      if (event.target !== viewport && !(event.target as Element).classList?.contains("block-crop-content")) return;
      if (event.type === "transitionrun") transitions.add(event.propertyName);
      else transitions.delete(event.propertyName);
      refresh();
    }

    const resizeObserver = new ResizeObserver(refresh);
    resizeObserver.observe(media);
    resizeObserver.observe(viewport);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    }, { rootMargin: "160px" });
    intersectionObserver.observe(canvas);
    const mediaEvents = ["load", "loadeddata", "playing", "pause", "seeked", "ended", "timeupdate"];
    mediaEvents.forEach((event) => media.addEventListener(event, refresh));
    block.addEventListener("transitionrun", onTransition);
    block.addEventListener("transitionend", onTransition);
    block.addEventListener("transitioncancel", onTransition);
    document.addEventListener("visibilitychange", refresh);
    refreshRef.current = refresh;
    refresh();

    return () => {
      disposed = true;
      refreshRef.current = null;
      stopFrames();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      mediaEvents.forEach((event) => media.removeEventListener(event, refresh));
      block.removeEventListener("transitionrun", onTransition);
      block.removeEventListener("transitionend", onTransition);
      block.removeEventListener("transitioncancel", onTransition);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [src]);

  // Also update immediate crops when reduced motion disables transition events.
  useLayoutEffect(() => {
    refreshRef.current?.();
  }, [cropTop, cropHeight]);

  return <canvas ref={canvasRef} className="media-edge-extension" aria-hidden="true" />;
}
