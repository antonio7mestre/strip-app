export const SCRIBBLE_DRAW_MS = 2600;
export const SCRIBBLE_FADE_MS = 650;
export const SCRIBBLE_REDUCED_FADE_MS = 280;

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
  return { top: scrollY - inset, height: Math.max(viewportHeight + inset, isPhone ? phoneHeight : 0) };
}

export function installScribbleSurface(host: HTMLElement) {
  let disposed = false;
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
  };
  sync();
  // The parent's existing leading-media anchor runs in the same layout commit.
  // Match its final position before painting, without moving the page ourselves.
  const frame = requestAnimationFrame(sync);
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
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
export function makeScribble(width: number, height: number, seed = Math.floor(Math.random() * 4294967296)): InkSegment[] {
  const w = Math.max(1, width), h = Math.max(1, height);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const segments: InkSegment[] = [];
  const cx = w / 2, cy = h / 2;
  const step = Math.max(16, Math.min(w, h) * 0.085);
  let previous: [number, number] = [cx, cy];
  let previousWidth = 1.8;
  let tangent = random() * Math.PI * 2;
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
  const angle = random() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const turn = angle + i * (2 + random() * 0.6);
    const radius = 5 + i * 1.5;
    wander([cx + Math.cos(turn) * radius, cy + Math.sin(turn) * radius], 2 + i * 0.4);
  }
  // Shuffle two visits to every cell. This feels freehand but cannot remain
  // trapped in a central knot. The curve's tangent carries through every join.
  const cells = Array.from({ length: 24 }, (_, index) => index % 12);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  cells.forEach((cell, index) => {
    const spread = Math.min(1, 0.25 + index * 0.13);
    const x = ((cell % 3) + 0.12 + random() * 0.76) / 3 * w;
    const y = (Math.floor(cell / 3) + 0.12 + random() * 0.76) / 4 * h;
    wander([cx + (x - cx) * spread, cy + (y - cy) * spread],
      4 + Math.pow((index + 1) / cells.length, 1.5) * step * 0.85);
  });
  // The SAME line becomes a broad marker and paints vertically, edge to edge.
  // The connector reaches outside the glass before the first full-height pass.
  wander([-step, -step * 2], step * 2.3);
  let pass = 0;
  for (let x = -step; x <= w + step * 2; x += step) {
    travel([x, pass++ % 2 === 0 ? h + step * 2 : -step * 2], step * 2.3 + pass * 0.15, step * 0.12);
  }
  return segments;
}

/** Short, drawing-synchronized taps. No timers, catch-up bursts, or activation tricks. */
export function createScribbleHaptics(device: {
  vibrate: (duration: number) => boolean; active: () => boolean; visible: () => boolean;
}) {
  const marks = [0.025, 0.14, 0.27, 0.42, 0.59, 0.77, 0.94];
  let next = 0, last = -Infinity, buzzing = false, disabled = false;
  const stop = () => {
    if (!buzzing) return;
    buzzing = false;
    try { device.vibrate(0); } catch { disabled = true; }
  };
  return {
    stop,
    update(now: number, progress: number, allowed: boolean) {
      if (!allowed || progress >= 1 || !device.visible()) { stop(); return; }
      let due = false;
      while (next < marks.length && progress >= marks[next]) { next++; due = true; }
      if (!due || disabled || now - last < 220 || !device.active()) return;
      try {
        buzzing = device.vibrate(4 + next);
        last = now;
        if (!buzzing) disabled = true;
      } catch { disabled = true; }
    },
  };
}

export function scribbleProgress(elapsed: number) {
  // Spend most of the drawing on the expanding knot, then scribble in the gaps.
  const p = clamp(elapsed / SCRIBBLE_DRAW_MS);
  return p < 0.79 ? Math.pow(p / 0.79, 0.9) * 0.6 : 0.6 + (p - 0.79) / 0.21 * 0.4;
}

export function startScribble(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  palette: readonly string[],
  onComplete: () => void,
) {
  const context = canvas.getContext("2d");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motion.matches;
  let stopped = false, completed = false, ready = false, covered = false;
  let frame = 0, started: number | null = null, fadeStarted: number | null = null;
  let segments: InkSegment[] = [], drawn = 0, progress = 0;
  let width = 1, height = 1;
  const ink = chooseScribbleColor(palette);
  const seed = Math.floor(Math.random() * 4294967296);
  const haptics = createScribbleHaptics({
    vibrate: duration => typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
      ? navigator.vibrate(duration) : false,
    active: () => typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive === true,
    visible: () => typeof document !== "undefined" && document.visibilityState === "visible",
  });
  const drawTo = (target: number) => {
    if (!context) return;
    for (; drawn < target; drawn++) {
      const segment = segments[drawn];
      context.strokeStyle = ink;
      context.lineWidth = segment.width;
      context.beginPath();
      context.moveTo(...segment.from);
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
  const paintReduced = () => {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    drawn = 0;
    drawTo(110);
    fillBehind();
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
    if (context) { context.lineCap = "round"; context.lineJoin = "round"; }
    segments = makeScribble(width, height, seed);
    drawn = 0;
    if (reduced) paintReduced();
    else { drawTo(Math.floor(progress * segments.length)); if (covered) fillBehind(); }
  };
  const schedule = () => {
    if (!frame && !stopped && !completed) frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (stopped || completed) return;
    if (started === null) started = now;
    if (!covered) {
      progress = reduced || !context ? 1 : scribbleProgress(now - started);
      if (reduced) paintReduced();
      else drawTo(Math.floor(progress * segments.length));
      host.dataset.inkProgress = progress.toFixed(3);
      haptics.update(now, progress, !reduced && Boolean(context));
      if (progress >= 1) {
        covered = true;
        fillBehind();
        host.dataset.inkPhase = "covered";
      }
    }
    if (covered && ready) {
      if (fadeStarted === null) fadeStarted = now;
      host.dataset.inkPhase = "fading";
      const fade = clamp((now - fadeStarted) / (reduced ? SCRIBBLE_REDUCED_FADE_MS : SCRIBBLE_FADE_MS));
      host.style.opacity = String(1 - fade * fade * (3 - 2 * fade));
      if (fade === 1) {
        completed = true;
        onComplete();
        return;
      }
    }
    // No idle animation or sampling loop while a slow connection finishes.
    if (!covered || ready) schedule();
  }
  const onMotionChange = () => {
    reduced = motion.matches;
    if (reduced) haptics.stop();
    resize();
    schedule();
  };
  const onVisibilityChange = () => { if (document.visibilityState !== "visible") haptics.stop(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
  host.dataset.inkPhase = "drawing";
  host.style.opacity = "1";
  host.dataset.inkColor = ink;
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  motion.addEventListener("change", onMotionChange);
  schedule();
  return {
    setReady(value: boolean) { ready = value; schedule(); },
    dispose() {
      stopped = true;
      haptics.stop();
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", onMotionChange);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
