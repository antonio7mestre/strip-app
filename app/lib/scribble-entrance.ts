export const SCRIBBLE_DRAW_MS = 2600;
export const SCRIBBLE_ENTRY_MS = 260;
const SCRIBBLE_ENTRY_SEGMENTS = 120;
export const SCRIBBLE_SWEEP_MS = 720;
export const SCRIBBLE_FADE_MS = 650;

/** Safari 26 may report zero safe insets and a viewport shorter than the glass.
 * Use the screen only on iPhone, and only for this non-interactive paint layer. */
export function scribbleSurfaceBounds({
  viewportHeight, screenWidth, screenHeight, landscape, isPhone, safeTop, scrollY,
}: {
  viewportHeight: number; screenWidth: number; screenHeight: number;
  landscape: boolean; isPhone: boolean; safeTop: number; scrollY: number;
}) {
  const phoneHeight = landscape ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight);
  const phoneTop = isPhone && !landscape ? Math.min(62, Math.max(47, Math.min(screenWidth, screenHeight) * 0.154)) : 0;
  const inset = Math.max(safeTop, phoneTop);
  // Overscan the physical edge, not a separate colored safe-area patch. Safari's
  // fractional viewport/compositor rounding must never expose the next block.
  return { top: scrollY - inset, height: Math.ceil(Math.max(viewportHeight + inset, isPhone ? phoneHeight : 0)) + 8 };
}

export function installScribbleSurface(host: HTMLElement) {
  let disposed = false;
  // Text pages normally ask Safari for a solid edge tint. Suspend that hint
  // while real ink is painting there; preserve ongoing content/color updates.
  const theme = host.closest?.(".published-mode.has-leading-text")
    ? document.getElementById("strip-theme-color") : null;
  const themeName = theme?.getAttribute("name") ?? null;
  if (themeName) theme?.removeAttribute("name");
  const sync = () => {
    if (disposed) return;
    const safeTop = parseFloat(getComputedStyle(host).getPropertyValue("--entrance-safe-top")) || 0;
    const size = scribbleSurfaceBounds({
      viewportHeight: window.innerHeight,
      screenWidth: window.screen.width, screenHeight: window.screen.height,
      landscape: window.innerWidth > window.innerHeight,
      isPhone: /iPhone|iPod/.test(navigator.userAgent),
      safeTop, scrollY: window.scrollY,
    });
    const top = size.top + "px", height = size.height + "px";
    if (host.style.top !== top) host.style.top = top;
    if (host.style.height !== height) host.style.height = height;
    const viewport = window.visualViewport;
    const visibleBottom = Math.min(window.innerHeight, (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0));
    const labelBottom = Math.max(12, size.height + size.top - window.scrollY - visibleBottom + 12) + "px";
    if (host.style.getPropertyValue("--entrance-label-bottom") !== labelBottom) {
      host.style.setProperty("--entrance-label-bottom", labelBottom);
    }
  };
  sync();
  // The parent's existing leading-media anchor runs in the same layout commit.
  // Match its final position before painting, without moving the page ourselves.
  const frame = requestAnimationFrame(sync);
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
  };
}


export type InkSegment = {
  from: [number, number];
  to: [number, number];
  width: number;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Choose once: the authored accent or dominant media color, never changing ink mid-stroke. */
export function chooseScribbleColor(palette: readonly string[]) {
  const color = palette.find(value => /^#[0-9a-f]{6}$/i.test(value)) ?? "#3155FF";
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const lightness = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const lift = Math.max(0, (100 - lightness) / (255 - lightness || 1));
  return "#" + rgb.map(value => Math.round(value + (255 - value) * lift)
    .toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** New seed per entrance, retained by the controller across every resize. */
export function createScribbleJourney(width: number, height: number, seed = Math.floor(Math.random() * 4294967296)) {
  const w = Math.max(1, width), h = Math.max(1, height);
  // Independent randomness keeps the entry from reshuffling the later journey.
  let entrySeed = (seed ^ 0x9e3779b9) >>> 0;
  const entryRandom = () => {
    entrySeed = (Math.imul(entrySeed, 1664525) + 1013904223) >>> 0;
    return entrySeed / 4294967296;
  };
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const segments: InkSegment[] = [];
  const cx = w / 2, cy = h / 2;
  const step = Math.max(16, Math.min(w, h) * 0.085);
  const startWidth = Math.max(8, Math.min(14, Math.min(w, h) * 0.025));
  let previous: [number, number] = [cx, cy];
  let previousWidth = startWidth;
  let tangent = random() * Math.PI * 2;
  const entryOrigin: [number, number] = [w * (0.15 + 0.7 * entryRandom()), h + 24 + h * 0.12 * entryRandom()];
  const entryFirst = [w * (0.1 + 0.8 * entryRandom()), h * (0.72 + 0.22 * entryRandom())];
  const entryHandle = Math.min(w, h) * (0.14 + 0.18 * entryRandom());
  const entryLast = [cx - Math.cos(tangent) * entryHandle, cy - Math.sin(tangent) * entryHandle];
  previous = entryOrigin;
  for (let j = 1; j <= SCRIBBLE_ENTRY_SEGMENTS; j++) {
    const t = j / SCRIBBLE_ENTRY_SEGMENTS, u = 1 - t;
    const point: [number, number] = [0, 1].map(axis =>
      u ** 3 * entryOrigin[axis] + 3 * u * u * t * entryFirst[axis]
      + 3 * u * t * t * entryLast[axis] + t ** 3 * [cx, cy][axis],
    ) as [number, number];
    segments.push({ from: previous, to: point, width: previousWidth });
    previous = point;
  }
  // The incoming tangent meets the opening strokes smoothly, with no pen lift.
  const wander = (target: [number, number], penWidth: number) => {
    const origin = previous;
    const reach = Math.hypot(target[0] - origin[0], target[1] - origin[1]);
    const handle = Math.max(6, reach * (0.28 + random() * 0.15));
    const first = [origin[0] + Math.cos(tangent) * handle, origin[1] + Math.sin(tangent) * handle];
    tangent = Math.atan2(target[1] - origin[1], target[0] - origin[0]) + (random() - 0.5) * 2.4;
    const last = [target[0] - Math.cos(tangent) * handle, target[1] - Math.sin(tangent) * handle];
    for (let j = 1; j <= 40; j++) {
      const t = j / 40, u = 1 - t;
      const point: [number, number] = [0, 1].map(axis =>
        u ** 3 * origin[axis] + 3 * u * u * t * first[axis]
        + 3 * u * t * t * last[axis] + t ** 3 * target[axis],
      ) as [number, number];
      segments.push({ from: previous, to: point, width: previousWidth + (penWidth - previousWidth) * t });
      previous = point;
    }
    previousWidth = penWidth;
  };
  const travel = (target: [number, number], penWidth: number, wobble: number) => {
    const origin = previous;
    const phase = random() * Math.PI * 2;
    for (let j = 1; j <= 40; j++) {
      const t = j / 40;
      // The pen never lifts. Small sideways hesitations keep each long vertical
      // stroke human, while its endpoints meet the next stroke exactly.
      const sway = Math.sin(t * Math.PI) * (Math.sin(t * Math.PI * 3 + phase) * wobble
        + (random() - 0.5) * wobble * 0.35);
      const point: [number, number] = [
        origin[0] + (target[0] - origin[0]) * t + sway,
        origin[1] + (target[1] - origin[1]) * t,
      ];
      const width = previousWidth + (penWidth - previousWidth) * t;
      segments.push({ from: previous, to: point, width });
      previous = point;
    }
    previousWidth = penWidth;
  };
  let turn = random() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    turn += 2 + random() * 0.6;
    // Open out immediately instead of circling a tiny knot at the center.
    const radiusX = w * (0.12 + i * 0.05);
    const radiusY = h * (0.08 + i * 0.045);
    wander([cx + Math.cos(turn) * radiusX, cy + Math.sin(turn) * radiusY], startWidth + 0.5 + i * 0.65);
  }
  let rounds = 0, finished = false;
  const extend = () => {
    if (finished) return;
    // New destinations, but the same pen and tangent. Keep the waiting stroke
    // narrow enough to remain visibly in motion on a slow connection.
    const cells = Array.from({ length: 24 }, (_, index) => index % 12);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    cells.forEach((cell, index) => {
      const spread = rounds ? 1 : Math.min(1, 0.65 + index * 0.07);
      const x = ((cell % 3) + 0.12 + random() * 0.76) / 3 * w;
      const y = (Math.floor(cell / 3) + 0.12 + random() * 0.76) / 4 * h;
      const growth = 1 - Math.exp(-(rounds + (index + 1) / cells.length) * 0.55);
      wander([cx + (x - cx) * spread, cy + (y - cy) * spread], startWidth + 4 + step * 0.36 * growth);
    });
    rounds++;
  };
  extend();
  return {
    segments,
    extend,
    finish(drawn = segments.length) {
      if (finished) return;
      finished = true;
      // Readiness can arrive in the middle of a curve. Start the sweep at the
      // exact visible pen tip, not at a queued destination or a new stroke.
      segments.length = Math.max(1, Math.min(drawn, segments.length));
      const tip = segments[segments.length - 1];
      previous = tip.to;
      previousWidth = tip.width;
      tangent = Math.atan2(tip.to[1] - tip.from[1], tip.to[0] - tip.from[0]);
      wander([-step, -step * 2], step * 2.3);
      let pass = 0;
      for (let x = -step; x <= w + step * 2; x += step) {
        travel([x, pass++ % 2 === 0 ? h + step * 2 : -step * 2], step * 2.3 + pass * 0.15, step * 0.12);
      }
    },
  };
}

export function makeScribble(width: number, height: number, seed?: number): InkSegment[] {
  const journey = createScribbleJourney(width, height, seed);
  journey.finish();
  return journey.segments;
}

export function startScribble(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  palette: readonly string[],
  onComplete: () => void,
) {
  const context = canvas.getContext("2d");
  // Product choice: this entrance always draws, including with Reduce Motion.
  // Other motion preferences in the editor and navigation remain unchanged.
  let stopped = false, completed = false, ready = false, covered = false;
  let frame = 0, previousFrame: number | null = null, fadeStarted: number | null = null;
  let elapsed = 0, sweepElapsed = 0, sweepFrom: number | null = null, extensions = 0;
  let journey: ReturnType<typeof createScribbleJourney>;
  let segments: InkSegment[] = [], drawn = 0, progress = 0;
  let width = 1, height = 1;
  const ink = chooseScribbleColor(palette);
  const seed = Math.floor(Math.random() * 4294967296);
  const drawTo = (target: number) => {
    if (!context) return;
    for (; drawn < target; drawn++) {
      const segment = segments[drawn];
      context.strokeStyle = ink;
      context.lineWidth = segment.width;
      context.beginPath();
      // Include the preceding segment so the bend is joined without a gap.
      // Only the advancing tip is capped, with the marker's flat cut edge.
      const preceding = segments[drawn - 1];
      context.moveTo(...(preceding?.from ?? segment.from));
      if (preceding) context.lineTo(...segment.from);
      context.lineTo(...segment.to);
      context.stroke();
    }
  };
  const fillBehind = () => {
    if (!context) return;
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = ink;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  };
  const resize = () => {
    if (stopped) return;
    const bounds = host.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (context) { context.lineCap = "butt"; context.lineJoin = "round"; }
    const previousDrawn = drawn;
    journey = createScribbleJourney(width, height, seed);
    for (let i = 0; i < extensions; i++) journey.extend();
    if (sweepFrom !== null) journey.finish(sweepFrom);
    segments = journey.segments;
    drawn = 0;
    drawTo(sweepFrom === null ? previousDrawn : sweepFrom + Math.floor(clamp(sweepElapsed / SCRIBBLE_SWEEP_MS) * (segments.length - sweepFrom)));
    if (covered) fillBehind();
  };
  const schedule = () => {
    if (!frame && !stopped && !completed) frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (stopped || completed) return;
    // Never catch up an entire hidden-tab interval in one visible frame.
    const delta = previousFrame === null ? 0 : Math.min(64, Math.max(0, now - previousFrame));
    previousFrame = now;
    if (!covered) {
      if (!context) {
        progress = 1;
      } else if (sweepFrom === null) {
        elapsed += delta;
        const target = Math.floor(elapsed / SCRIBBLE_DRAW_MS * 1200);
        while (target > segments.length) { journey.extend(); extensions++; }
        drawTo(target);
        progress = Math.min(0.6, elapsed / (SCRIBBLE_ENTRY_MS + SCRIBBLE_DRAW_MS) * 0.6);
        if (ready && elapsed >= SCRIBBLE_ENTRY_MS + SCRIBBLE_DRAW_MS) {
          sweepFrom = drawn;
          journey.finish(drawn);
          host.dataset.inkPhase = "sweeping";
        }
      } else {
        sweepElapsed += delta;
        const sweep = clamp(sweepElapsed / SCRIBBLE_SWEEP_MS);
        drawTo(sweepFrom + Math.floor(sweep * (segments.length - sweepFrom)));
        progress = 0.6 + sweep * 0.4;
      }
      host.dataset.inkSegments = String(drawn);
      host.dataset.inkProgress = progress.toFixed(3);
      if (progress >= 1) {
        covered = true;
        fillBehind();
        host.dataset.inkPhase = "covered";
      }
    }
    if (covered && ready) {
      if (fadeStarted === null) fadeStarted = now;
      host.dataset.inkPhase = "fading";
      const fade = clamp((now - fadeStarted) / SCRIBBLE_FADE_MS);
      host.style.opacity = String(1 - fade * fade * (3 - 2 * fade));
      if (fade === 1) {
        completed = true;
        onComplete();
        return;
      }
    }
    // Keep drawing until assets settle and the final sweep ends.
    if (!covered || ready) schedule();
  }
  host.dataset.inkPhase = "drawing";
  host.style.opacity = "1";
  host.dataset.inkColor = ink;
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  schedule();
  return {
    setReady(value: boolean) { ready = value; schedule(); },
    dispose() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
