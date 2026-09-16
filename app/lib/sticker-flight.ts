/** A single flexible sheet, not individually hinged panels. No 3D runtime. */
export const STICKER_RELEASE = .32;
export const STICKER_LAND = .70;

export function stickerMesh(columns = 32, rows = 32) {
  const points: number[] = [], indices: number[] = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) points.push(x / columns, y / rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { points: new Float32Array(points), indices: new Uint16Array(indices) };
}

/** Side is the cover's position in the home grid. The outer edge leads. */
export function stickerTilt(progress: number, side: number) {
  const carried = Math.min(1, Math.max(0, (progress - STICKER_RELEASE) / (STICKER_LAND - STICKER_RELEASE)));
  return -(side < 0 ? -1 : 1) * Math.PI / 180 * 8 * Math.sin(Math.PI * carried) ** 2;
}

export function stickerPeelAmount(t: number) {
  const smooth = (value: number) => { const a = Math.min(1, Math.max(0, value)); return a * a * (3 - 2 * a); };
  return t < STICKER_RELEASE ? smooth(t / STICKER_RELEASE) : t < STICKER_LAND ? 1 : 1 - smooth((t - STICKER_LAND) / (1 - STICKER_LAND));
}

// A moving adhesion boundary. The remaining attached portion stays exactly
// still until it releases, then the same curve unrolls onto its new position.
export function stickerPoint(u: number, v: number, t: number, side: number, width: number, height: number) {
  const direction = side < 0 ? -1 : 1;
  const nx = direction * .782, ny = Math.sqrt(1 - .782 ** 2);
  let x = (u - .5) * width, y = (.5 - v) * height;
  const span = Math.abs(nx) * width + ny * height;
  const across = (-ny * direction * x + Math.abs(nx) * y) / span;
  const peeled = stickerPeelAmount(t);
  // The contact line advances diagonally from the top outside corner. A little
  // uneven tension across it prevents a manufactured, perfectly cylindrical curl.
  const boundary = span * (.5 - peeled) + span * .022 * Math.sin(across * 5) * Math.sin(Math.PI * peeled);
  const distance = Math.max(0, nx * x + ny * y - boundary);
  const radius = span * (.035 + .375 * peeled) * (1 + .09 * Math.sin(across * 5 + 1.2));
  const curved = radius * Math.sin(distance / radius);
  x += nx * (curved - distance);
  y += ny * (curved - distance);
  const wave = Math.sin(Math.PI * distance / Math.max(1, peeled * span)) * Math.sin(across * 4.6 - t * 5);
  let z = radius * (1 - Math.cos(distance / radius)) + span * .009 * peeled * wave;
  if (t <= 0 || t >= 1) { x = (u - .5) * width; y = (.5 - v) * height; z = 0; }
  return [x, y, z];
}

const vertexSource = `#version 300 es
in vec3 position;
in vec2 uv;
uniform vec2 size;
uniform float turn;
uniform float phase;
uniform float carried;
out vec2 vUv;
out vec3 vPosition;
void main() {
  float arc = pow(sin(3.14159265 * carried), 2.0);
  float sway = 0.035 * sign(turn) * sin(3.14159265 * carried);
  vec3 p = position;
  p.xy = mat2(cos(sway), sin(sway), -sin(sway), cos(sway)) * p.xy;
  p.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xz;
  float pitch = -0.2 * arc;
  p.yz = mat2(cos(pitch), sin(pitch), -sin(pitch), cos(pitch)) * p.yz;
  p.z += 38.0 * arc;
  vPosition = p;
  vUv = uv;
  gl_Position = vec4(p.xy / size, -p.z / 1000.0, 1.0 - p.z / 700.0);
}`;
const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D front;
uniform sampler2D back;
uniform float phase;
in vec2 vUv;
in vec3 vPosition;
out vec4 color;
void main() {
  vec4 paper = gl_FrontFacing ? texture(front, vUv) : texture(back, vec2(1.0 - vUv.x, vUv.y));
  if (paper.a < 0.01) discard;
  vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
  float light = 0.84 + 0.16 * abs(dot(normal, normalize(vec3(-0.3, 0.5, 1.0))));
  color = vec4(paper.rgb * mix(1.0, light, sin(3.14159265 * phase)), paper.a);
}`;

const stockImages = new Map<string, Promise<HTMLImageElement>>();
function stockImage(src: string) {
  if (!stockImages.has(src)) stockImages.set(src, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.decode().then(() => resolve(image), reject);
    image.onerror = reject;
    image.src = src;
  }));
  return stockImages.get(src)!;
}

export function startStickerFlight(canvas: HTMLCanvasElement, options: {
  image: HTMLImageElement | null; color: string; width: number; height: number;
  side: number; onReady: () => number; duration: number;
  paintDate: (context: CanvasRenderingContext2D, width: number, height: number) => void;
}) {
  let stopped = false, raf = 0;
  let release = () => {};
  const { width, height, side, duration } = options;
  let started: number | null = null;
  const begin = () => {
    if (!stopped && started === null) started = options.onReady();
    return started ?? 0;
  };
  // Asset failures must never strand navigation. The CSS paper is the fallback.
  const fallbackTimer = window.setTimeout(begin, 600);
  const cleanup = () => { stopped = true; clearTimeout(fallbackTimer); cancelAnimationFrame(raf); release(); delete canvas.dataset.ready; };
  void (async () => {
    const [paper, rear] = await Promise.all([
      stockImage("/cover-sticker-paper.webp"), stockImage("/cover-sticker-back.webp"),
      options.image?.decode(),
    ]);
    if (stopped || (started !== null && Number(document.timeline.currentTime) - started >= duration)) return;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) { clearTimeout(fallbackTimer); begin(); return; }
    const resources: (() => void)[] = [];
    release = () => { resources.splice(0).forEach(dispose => dispose()); };
    const onLost = (event: Event) => { event.preventDefault(); cleanup(); };
    canvas.addEventListener("webglcontextlost", onLost);
    resources.push(() => canvas.removeEventListener("webglcontextlost", onLost));
    const shader = (type: number, source: string) => {
      const value = gl.createShader(type)!;
      resources.push(() => gl.deleteShader(value));
      gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("Sticker shader unavailable");
      return value;
    };
    const program = gl.createProgram()!;
    resources.push(() => gl.deleteProgram(program));
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Sticker program unavailable");
    gl.useProgram(program);
    // Square overscan leaves room for a diagonal peel on wide/short covers.
    const extent = Math.max(width, height) * 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1, 1600 / extent);
    canvas.style.width = extent + "px"; canvas.style.height = extent + "px";
    canvas.width = Math.ceil(extent * dpr); canvas.height = Math.ceil(extent * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.uniform2f(gl.getUniformLocation(program, "size"), extent / 2, extent / 2);
    const texture = (name: string, unit: number, stock: HTMLImageElement, isFront: boolean) => {
      const surface = document.createElement("canvas");
      surface.width = Math.ceil(width * 2); surface.height = Math.ceil(height * 2);
      const context = surface.getContext("2d")!;
      const w = surface.width, h = surface.height, rim = w * .0225;
      context.beginPath(); context.roundRect(0, 0, w, h, Math.min(w, h) * .024); context.clip();
      context.drawImage(stock, 0, 0, w, h);
      if (isFront) {
        context.fillStyle = options.color; context.fillRect(rim, rim, w - rim * 2, h - rim * 2);
        if (options.image) context.drawImage(options.image, rim, rim, w - rim * 2, h - rim * 2);
      } else options.paintDate(context, w, h);
      const tex = gl.createTexture()!;
      resources.push(() => gl.deleteTexture(tex));
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    };
    texture("front", 0, paper, true); texture("back", 1, rear, false);
    const mesh = stickerMesh(), positions = new Float32Array(mesh.points.length / 2 * 3);
    const buffer = (target: number, data: Float32Array | Uint16Array, usage: number) => {
      const value = gl.createBuffer()!; resources.push(() => gl.deleteBuffer(value));
      gl.bindBuffer(target, value); gl.bufferData(target, data, usage); return value;
    };
    buffer(gl.ARRAY_BUFFER, mesh.points, gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, "uv"); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    const positionBuffer = buffer(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const turn = gl.getUniformLocation(program, "turn"), phase = gl.getUniformLocation(program, "phase");
    const carried = gl.getUniformLocation(program, "carried");
    clearTimeout(fallbackTimer);
    const flightStart = begin();
    const draw = () => {
      if (stopped) return;
      const t = Math.min(1, Math.max(0, (Number(document.timeline.currentTime) - flightStart) / duration));
      for (let i = 0; i < mesh.points.length; i += 2) positions.set(stickerPoint(mesh.points[i], mesh.points[i + 1], t, side, width, height), i / 2 * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
      gl.uniform1f(turn, stickerTilt(t, side)); gl.uniform1f(phase, t);
      gl.uniform1f(carried, Math.min(1, Math.max(0, (t - STICKER_RELEASE) / (STICKER_LAND - STICKER_RELEASE))));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      canvas.dataset.ready = "true";
      if (t < 1) raf = requestAnimationFrame(draw);
    };
    draw();
  })().catch(error => { console.warn("Sticker material unavailable; using paper fallback", error); clearTimeout(fallbackTimer); release(); delete canvas.dataset.ready; begin(); });
  return cleanup;
}
