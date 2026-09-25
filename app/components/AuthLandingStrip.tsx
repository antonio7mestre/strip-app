import { createContext, useContext, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const AUTH_LANDING_COLOR = "#304dff";

const STICKER_HEIGHTS = { camera: 512, flipphone: 1152, "green-glasses": 512, daisy: 922, cherries: 790, cassette: 512, headphones: 816, cd: 768, "ticket-admit": 511, shell: 702, rollerskate: 814, clip: 640 } as const;
const PACK_CUTOUTS = {
  daisy: { src: "/sticker-pack/nature/white-daisy.webp", width: 512, height: 490 },
} as const;

const StickerSelection = createContext<{ selected: string | null; select: (id: string | null) => void; layer: HTMLDivElement | null }>({ selected: null, select: () => {}, layer: null });

/** The collage photo is rotated. Convert a screen-space drag into its local axes. */
export function landingStickerOffset(x: number, y: number, angle: number) {
  return { x: x * Math.cos(angle) + y * Math.sin(angle), y: y * Math.cos(angle) - x * Math.sin(angle) };
}

/** Match the editor: no inset, with just a grab-able sliver kept on the canvas. */
export function landingStickerBounds(rect: { left: number; right: number; width: number }, canvasWidth: number) {
  const visible = Math.min(44, rect.width);
  return { minX: Math.min(0, visible - rect.right), maxX: Math.max(0, canvasWidth - visible - rect.left) };
}

const OUTLINE_OFFSETS = Array.from({ length: 32 }, (_, index) => {
  const angle = index * Math.PI / 16;
  return { x: 3 * Math.cos(angle), y: 3 * Math.sin(angle) };
});

function parentAngle(element: HTMLElement) {
  let angle = 0;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const transform = getComputedStyle(parent).transform;
    if (transform !== "none") {
      const matrix = new DOMMatrixReadOnly(transform);
      angle += Math.atan2(matrix.b, matrix.a);
    }
  }
  return angle;
}

function MovableSticker({ className, label, children, aspectRatio = 1 }: { className: string; label: string; children: ReactNode; aspectRatio?: number }) {
  const { selected, select, layer } = useContext(StickerSelection);
  const anchor = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; width: number; height: number; angle: number; color: string } | null>(null);
  const isSelected = selected === className;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; scrollY: number; angle: number; origin: typeof offset; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  useLayoutEffect(() => {
    const element = anchor.current;
    if (!element || !layer) return;
    // Only the invisible anchor belongs to the section. Every real sticker
    // paints in one shared layer, so selection never raises a photo or block.
    const measure = () => {
      const rect = element.getBoundingClientRect(), canvas = layer.getBoundingClientRect();
      const style = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
      const next = {
        left: rect.left + rect.width / 2 - canvas.left - element.offsetWidth / 2,
        top: rect.top + rect.height / 2 - canvas.top - element.offsetHeight / 2,
        width: element.offsetWidth, height: element.offsetHeight,
        angle: parentAngle(element) + Math.atan2(matrix.b, matrix.a), color: style.color,
      };
      setPlacement(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(layer);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [layer]);
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const sticker = (
    <button type="button" data-landing-sticker className={`${className} landing-sticker-button${isSelected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      aria-label={`Move ${label} sticker`} aria-pressed={isSelected} aria-describedby="landing-sticker-help"
      style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, right: "auto", bottom: "auto",
        width: placement?.width ?? "100%", height: placement?.height ?? "100%",
        transform: placement ? `rotate(${placement.angle}rad)` : "none", color: placement?.color,
        translate: `${offset.x}px ${offset.y}px` }}
      onClick={() => select(className)}
      onPointerDown={event => {
        // Like the editor: first tap selects; swiping an unselected sticker still scrolls.
        if (!isSelected || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        const element = event.currentTarget;
        const rect = element.getBoundingClientRect();
        const canvas = element.closest(".auth-landing")!.getBoundingClientRect();
        element.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, scrollY: window.scrollY, angle: parentAngle(element), origin: offset,
          ...landingStickerBounds(rect, document.documentElement.clientWidth),
          minY: Math.min(0, canvas.top - rect.top), maxY: Math.max(0, canvas.bottom - rect.bottom) };
        setDragging(true);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        event.preventDefault();
        const dx = Math.max(current.minX, Math.min(current.maxX, event.clientX - current.x));
        const dy = Math.max(current.minY, Math.min(current.maxY, event.clientY - current.y + window.scrollY - current.scrollY));
        const delta = landingStickerOffset(dx, dy, current.angle);
        setOffset({ x: current.origin.x + delta.x, y: current.origin.y + delta.y });
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onKeyDown={event => {
        if (event.key === "Escape") { select(null); return; }
        if (!isSelected) return;
        const step = event.shiftKey ? 24 : 8;
        const direction = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!direction) return;
        event.preventDefault();
        const delta = landingStickerOffset(direction[0], direction[1], parentAngle(event.currentTarget));
        setOffset(value => ({ x: value.x + delta.x, y: value.y + delta.y }));
      }}>
      <span className="landing-sticker-art">{children}</span>
    </button>
  );
  return <>
    <span ref={anchor} className={`${className} landing-sticker-anchor`} style={{ aspectRatio }} aria-hidden="true">
      {!layer || !placement ? sticker : null}
    </span>
    {layer && placement ? createPortal(sticker, layer) : null}
  </>;
}

/** Complete alpha-cut objects. Selection follows the alpha, never an image rectangle. */
function PhotoCutout({ kind, className = "" }: { kind: keyof typeof STICKER_HEIGHTS; className?: string }) {
  const asset = PACK_CUTOUTS[kind as keyof typeof PACK_CUTOUTS] ?? { src: `/landing/sticker-${kind}.webp`, width: 768, height: STICKER_HEIGHTS[kind] };
  return (
    <MovableSticker className={`landing-cutout landing-cutout-${kind} ${className}`} aspectRatio={asset.width / asset.height} label={kind === "flipphone" ? "phone" : kind.replaceAll("-", " ")}>
      <img src={asset.src} alt="" width={asset.width} height={asset.height} decoding="async" draggable={false} />
    </MovableSticker>
  );
}

function CollageBurst({ className }: { className: string }) {
  const shapes: Record<string, string> = {
    "landing-hero-spark": "M50 0 58 31 80 8 71 39 100 38 75 54 95 77 64 69 59 100 47 73 24 96 30 66 0 62 28 48 7 23 39 32Z",
    "landing-hero-squiggle": "M17 8C-9 30 31 53 54 31C72 14 91 30 77 47C63 64 26 52 27 74C28 88 51 98 73 87L66 71C53 77 44 74 45 70C46 65 71 73 88 60C117 37 92 0 65 9C47 15 44 32 31 28C24 25 24 21 29 17Z",
    "landing-make-spark": "M48 0 62 33 98 28 72 55 88 93 51 77 18 99 25 59 0 31 36 33Z",
    "landing-share-spark": "M50 94C35 81 3 57 3 30C3 3 37 0 50 24C63 0 97 3 97 30C97 57 66 81 50 94Z",
  };
  return (
    <MovableSticker className={`landing-doodle ${className}`} label={className === "landing-share-spark" ? "heart" : className === "landing-hero-squiggle" ? "squiggle" : "spark"}>
      <svg viewBox="0 0 100 100" focusable="false">
        <path className="landing-shape-outline" fill="white" stroke="white" strokeWidth="6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" d={shapes[className]} />
        <path fill="currentColor" d={shapes[className]} />
      </svg>
    </MovableSticker>
  );
}

/** Use Safari's document scroller so the actual Strip paints behind its chrome. */
export function AuthLandingStrip() {
  const [selected, select] = useState<string | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const backgroundTap = useRef<{ id: number; x: number; y: number; scrollY: number } | null>(null);
  useLayoutEffect(() => {
    // A fixed theme color would conceal the content behind the status bar.
    const theme = document.getElementById("strip-theme-color");
    const themeName = theme?.getAttribute("name");
    if (themeName) theme?.removeAttribute("name");
    return () => {
      if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
    };
  }, []);
  return (
    <StickerSelection.Provider value={{ selected, select, layer }}>
    <div className="auth-landing" role="region" aria-label="Meet Strip" onPointerDown={event => {
      backgroundTap.current = (event.target as Element).closest("[data-landing-sticker]") ? null
        : { id: event.pointerId, x: event.clientX, y: event.clientY, scrollY: window.scrollY };
    }} onPointerUp={event => {
      const tap = backgroundTap.current;
      backgroundTap.current = null;
      // Scrolling off the sticker keeps it selected, just like the editor.
      if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 8
        && Math.abs(window.scrollY - tap.scrollY) < 8) select(null);
    }} onPointerCancel={() => { backgroundTap.current = null; }}>
      <svg className="landing-sticker-filters" aria-hidden="true" width="0" height="0" focusable="false">
        <defs>
          <filter id="landing-sticker-outline" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            {OUTLINE_OFFSETS.map((offset, index) => <feOffset key={index} in="SourceAlpha" dx={offset.x} dy={offset.y} result={`rim-${index}`} />)}
            <feMerge result="edge"><feMergeNode in="SourceAlpha" />{OUTLINE_OFFSETS.map((_, index) => <feMergeNode key={index} in={`rim-${index}`} />)}</feMerge>
            <feFlood floodColor="white" /><feComposite in2="edge" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      <span id="landing-sticker-help" className="sr-only">Tap a sticker to select it, then drag to move. Use arrow keys to move a selected sticker, or Escape to deselect.</span>
      <div className="landing-strip">
        <header className="landing-block landing-hero">
          <div className="landing-content">
            <h1 id="auth-heading">Want to<br />strip?</h1>
            <p className="landing-intro">This is what a Strip looks like. A place to tell a story, mix photos, videos and words, and make something that feels like you.</p>
            <div className="landing-hero-stickers">
              <div className="landing-play-hint" aria-hidden="true">
                <img className="landing-play-lettering" src="/landing/sticker-help-text.png" alt="click a sticker to move it around" width="1536" height="1024" draggable={false} />
                <span className="landing-play-arrow"><img src="/landing/sticker-help-arrow.png" alt="" width="1536" height="1024" draggable={false} /></span>
              </div>
              <img className="landing-sticker landing-sticker-sky" src="/landing/story-friends.webp" width="900" height="1200" alt="Friends laughing together in the sunshine" decoding="async" />
              <PhotoCutout kind="green-glasses" className="landing-hero-glasses" />
              <PhotoCutout kind="camera" className="landing-hero-camera" />
              <PhotoCutout kind="flipphone" className="landing-hero-phone" />
              <MovableSticker className="landing-doodle landing-hero-ring" label="ringing phone">
                <svg viewBox="0 0 100 100" focusable="false">
                  <path className="landing-shape-outline" d="M49 85Q49 49 85 49M23 85Q23 23 85 23" fill="none" stroke="white" strokeWidth="24" strokeLinecap="round" />
                  <path d="M49 85Q49 49 85 49M23 85Q23 23 85 23" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                </svg>
              </MovableSticker>
              <CollageBurst className="landing-hero-spark" />
              <CollageBurst className="landing-hero-squiggle" />
            </div>
          </div>
        </header>

        <section className="landing-block landing-photo-block" aria-label="A moment worth keeping">
          <div className="landing-feature-photo">
            <img className="landing-full-photo" src="/landing/story-night.webp" alt="Two silhouettes leaning together against blurred blue and pink city lights" width="1280" height="768" decoding="async" />
            <div className="landing-photo-scraps">
              <PhotoCutout kind="daisy" className="landing-photo-daisy" />
            </div>
          </div>
        </section>

        <section className="landing-block landing-make">
          <div className="landing-content">
            <h2 className="landing-section-title"><span>01 /</span> MAKE IT YOURS</h2>
            <p className="landing-make-headline">Your photos.<br />Your words.<br />Your world.</p>
            <p className="landing-description">Stack photos and videos. Add a thought, a color, a sticker. Keep going.</p>
            <div className="landing-make-collage">
              <img className="landing-sticker landing-make-scrap-street" src="/landing/cosmos-street.webp" alt="" width="900" height="1126" loading="lazy" decoding="async" />
              <PhotoCutout kind="cassette" className="landing-make-cassette" />
              <PhotoCutout kind="rollerskate" className="landing-make-skate" />
              <PhotoCutout kind="headphones" className="landing-make-headphones" />
              <PhotoCutout kind="cd" className="landing-make-cd" />
              <CollageBurst className="landing-make-spark" />
            </div>
          </div>
        </section>

        <section className="landing-block landing-share">
          <div className="landing-content">
            <h2 className="landing-section-title"><span>02 /</span> PASS IT AROUND</h2>
            <p className="landing-description">You decide who sees your Strip.<br />One shareable link.</p>
            <div className="landing-share-photo">
              <img src="/landing/cosmos-ocean.webp" alt="A candid sunset portrait beside the ocean" width="900" height="1199" loading="lazy" decoding="async" />
              <PhotoCutout kind="ticket-admit" className="landing-share-ticket" />
              <PhotoCutout kind="cherries" className="landing-share-cherries" />
              <PhotoCutout kind="shell" className="landing-share-shell" />
              <PhotoCutout kind="clip" className="landing-share-clip" />
              <CollageBurst className="landing-share-spark" />
            </div>
            <p className="landing-signoff">This is a Strip.<br />Now make yours.</p>
          </div>
        </section>
      </div>
      <div ref={setLayer} className="landing-sticker-layer" />
    </div>
    </StickerSelection.Provider>
  );
}
