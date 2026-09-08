"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { makeEntrancePalette, sampleEntranceMedia } from "@/app/lib/strip-entrance";
import { installScribbleSurface, startScribble } from "@/app/lib/scribble-entrance";

type Cover = { kind: "image"; src: string } | { kind: "color"; color: string };
type PaletteBlock = { type: string; backgroundColor?: string; textColor?: string };

function InkCanvas({ palette, ready, onComplete }: {
  palette: string[]; ready: boolean; onComplete: () => void;
}) {
  // Once the pen touches down, arriving photos must not recolor old strokes.
  const [ink] = useState(palette);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<ReturnType<typeof startScribble> | null>(null);
  const complete = useRef(onComplete);
  useLayoutEffect(() => { complete.current = onComplete; }, [onComplete]);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element?.parentElement) return;
    const animation = startScribble(element, element.parentElement, ink, () => complete.current());
    controller.current = animation;
    return () => { animation.dispose(); controller.current = null; };
  }, [ink]);
  useLayoutEffect(() => { controller.current?.setReady(ready); }, [ready]);
  return <canvas ref={canvas} className="strip-entrance-ink" aria-hidden="true" />;
}

export function StripEntrance({
  cover,
  blocks,
  endingStyle,
  mediaReady,
  revealing,
  onCoverSettled,
  onExitComplete,
}: {
  cover: Cover;
  blocks: PaletteBlock[];
  endingStyle: { backgroundColor: string; buttonColor: string };
  mediaReady: boolean;
  revealing: boolean;
  onCoverSettled: () => void;
  onExitComplete: () => void;
}) {
  const coverRef = useRef<HTMLImageElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (surface) return installScribbleSurface(surface);
  }, []);
  const mounted = useRef(false);
  const frozen = useRef(false);
  const settledCallback = useRef(onCoverSettled);
  const [sampledColors, setSampledColors] = useState<string[]>([]);
  const [paletteSampled, setPaletteSampled] = useState(false);
  // The parent can rerender as media arrives, without restarting the animation.
  useEffect(() => { settledCallback.current = onCoverSettled; }, [onCoverSettled]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (frozen.current) return;
    const frame = requestAnimationFrame(() => {
      const groups: string[][] = [];
      if (coverRef.current?.complete) groups.push(sampleEntranceMedia(coverRef.current));
      if (mediaReady) {
        const media = document.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
          ".published-strip .image-block img, .published-strip .video-block video",
        );
        // Reuse decoded elements already on the strip. No duplicate video or download.
        [...media].slice(0, 3).forEach(element => groups.push(sampleEntranceMedia(element)));
      }
      // Interleave the samples so one cover cannot crowd out all the strip's media.
      const colors = Array.from({ length: 5 }, (_, index) =>
        groups.flatMap(group => group[index] ? [group[index]] : []),
      ).flat();
      if (colors.length) setSampledColors(colors);
      if (colors.length || mediaReady) setPaletteSampled(true);
      if (revealing) frozen.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [mediaReady, revealing]);

  const authored = [
    ...(cover.kind === "color" ? [cover.color] : []),
    ...blocks.flatMap(block => block.type === "text"
      ? [block.backgroundColor, block.textColor].filter((value): value is string => Boolean(value))
      : []),
    endingStyle.backgroundColor,
    endingStyle.buttonColor,
  ];
  const palette = makeEntrancePalette(authored, sampledColors);
  const hasPalette = cover.kind === "color" || blocks.some(block => block.type === "text") || paletteSampled;
  const style = {
    "--entrance-a": palette[0],
    "--entrance-b": palette[1],
    "--entrance-c": palette[2],
  } as CSSProperties;

  return (
    <div ref={surfaceRef} className={`published-strip-loading strip-entrance ${hasPalette ? "has-palette" : ""} ${revealing ? "is-revealing" : ""}`}
      style={style} role="status" aria-label="Loading Strip">
      {cover.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={coverRef} className="strip-entrance-color-source" src={cover.src} alt=""
          aria-hidden="true" fetchPriority="high" decoding="async"
          onLoad={event => {
            const image = event.currentTarget;
            void image.decode().catch(() => {}).then(() => {
              if (!mounted.current) return;
              if (!frozen.current) {
                setSampledColors(sampleEntranceMedia(image));
                setPaletteSampled(true);
              }
              settledCallback.current();
            });
          }}
          onError={() => settledCallback.current()}
        />
      ) : null}
      {hasPalette ? <InkCanvas palette={palette} ready={revealing} onComplete={onExitComplete} /> : null}
    </div>
  );
}
