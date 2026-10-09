import assert from "node:assert/strict";
import test from "node:test";
import { getMediaEdgeSlice, paintMediaEdge } from "../app/lib/media-edge.ts";

const fullImage = {
  sourceHeight: 2000,
  renderedHeight: 800,
  visibleBottom: 800,
  visibleHeight: 800,
  extensionHeight: 44,
};

test("uses the bottom edge without cropping or resizing the original image", () => {
  assert.deepEqual(getMediaEdgeSlice(fullImage), { top: 1890, height: 110 });
});

test("uses the displayed bottom of a cropped image or video", () => {
  assert.deepEqual(getMediaEdgeSlice({ ...fullImage, visibleBottom: 600, visibleHeight: 300 }), {
    top: 1390, height: 110,
  });
});

test("keeps the edge inside very short media", () => {
  assert.deepEqual(getMediaEdgeSlice({ ...fullImage, visibleBottom: 20, visibleHeight: 12 }), {
    top: 20, height: 30,
  });
});

test("clamps the bottom to the actual source dimensions", () => {
  assert.deepEqual(getMediaEdgeSlice({ ...fullImage, visibleBottom: 900 }), { top: 1890, height: 110 });
});

test("waits for usable loaded media and layout dimensions", () => {
  for (const key of Object.keys(fullImage)) {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.equal(getMediaEdgeSlice({ ...fullImage, [key]: value }), null);
    }
  }
});

const initialTransform = [2, 0, 0, 3, 7, 11];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `expected ${actual} to equal ${expected}`);

// A five-argument draw uses the full decoded bitmap. A source rectangle uses
// bitmap coordinates, which can differ from density-corrected naturalHeight.
function pixelContext({ throwAt = 0 } = {}) {
  let state = { transform: [...initialTransform], clips: [] }, path = [];
  const stack = [], draws = [];
  const copy = value => ({ transform: [...value.transform], clips: [...value.clips] });
  const local = (transform, x, y) => ({
    x: (x - transform[4]) / transform[0],
    y: (y - transform[5]) / transform[3],
  });
  const context = {
    save() { stack.push(copy(state)); },
    restore() { assert.ok(stack.length, "restore must match save"); state = stack.pop(); },
    setTransform(...values) { state.transform = values; },
    beginPath() { path = []; },
    rect(...values) { path.push(values); },
    clip() { state.clips.push(...path.map(rect => ({ rect, transform: [...state.transform] }))); },
    drawImage(...args) {
      draws.push({ args, ...copy(state) });
      if (draws.length === throwAt) throw new Error("Frame unavailable");
    },
  };
  function sourcePixelAt(x, y) {
    for (const draw of [...draws].reverse()) {
      if (draw.clips.some(({ rect: [left, top, width, height], transform }) => {
        const point = local(transform, x, y);
        return point.x < left || point.x >= left + width || point.y < top || point.y >= top + height;
      })) continue;
      const [media] = draw.args;
      const point = local(draw.transform, x, y);
      const [sx, sy, sw, sh, dx, dy, dw, dh] = draw.args.length === 5
        ? [0, 0, media.bitmapWidth, media.bitmapHeight, ...draw.args.slice(1)]
        : draw.args.slice(1);
      if (point.x < dx || point.x >= dx + dw || point.y < dy || point.y >= dy + dh) continue;
      return { x: sx + (point.x - dx) * sw / dw, y: sy + (point.y - dy) * sh / dh };
    }
    return null;
  }
  return { context, draws, sourcePixelAt,
    assertRestored() {
      assert.equal(stack.length, 0);
      assert.deepEqual(state, { transform: initialTransform, clips: [] });
    },
  };
}

function responsivePhoto(density, visibleBottom = 600) {
  const media = {
    bitmapWidth: 3200, bitmapHeight: 2400,
    naturalWidth: 3200 / density, naturalHeight: 2400 / density,
  };
  const slice = getMediaEdgeSlice({
    sourceHeight: media.naturalHeight, renderedHeight: 600,
    visibleBottom, visibleHeight: Math.min(visibleBottom, 600), extensionHeight: 44,
  });
  return { media, slice, width: 400 * density, height: 44 * density };
}

test("reflection reuses the current video frame and restores the canvas state", () => {
  const h = pixelContext();
  const video = { bitmapWidth: 1000, bitmapHeight: 2000, currentTime: 12.5 };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    constructor() { throw new Error("The edge must reuse the mounted media"); }
  } });
  try {
    paintMediaEdge(h.context, video, 2000, { top: 1890, height: 110 }, 786, 88);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "Image", descriptor);
    else delete globalThis.Image;
  }
  assert.equal(h.draws.length, 1);
  assert.equal(h.draws[0].args[0], video);
  assert.equal(h.draws[0].args.length, 5);
  close(h.sourcePixelAt(393, 0.5).y, 1999.375);
  close(h.sourcePixelAt(393, 87.5).y, 1890.625);
  assert.equal(h.sourcePixelAt(393, -0.5), null);
  assert.equal(h.sourcePixelAt(393, 88.5), null);
  assert.equal(video.currentTime, 12.5);
  h.assertRestored();
});

for (const density of [2, 3]) {
  test(`${density}x responsive photos reflect the actual bitmap bottom, not naturalHeight as raw pixels`, () => {
    const h = pixelContext(), { media, slice, width, height } = responsivePhoto(density);
    paintMediaEdge(h.context, media, media.naturalHeight, slice, width, height);
    const top = h.sourcePixelAt(width / 4, 0.5);
    const bottom = h.sourcePixelAt(width / 4, height - 0.5);
    close(top.x, media.bitmapWidth / 4);
    close(top.y, media.bitmapHeight - 2 / density);
    close(bottom.y, media.bitmapHeight - 176 + 2 / density);
    assert.ok(top.y > media.naturalHeight, "the sample must reach the decoded bitmap's real bottom");
    assert.equal(h.draws[0].args.length, 5);
    assert.equal(h.draws[0].args[0], media);
    h.assertRestored();
  });

  test(`${density}x cropped photos mirror the visible crop boundary and stay clipped to the edge band`, () => {
    const h = pixelContext(), { media, slice, width, height } = responsivePhoto(density, 420);
    paintMediaEdge(h.context, media, media.naturalHeight, slice, width, height);
    close(h.sourcePixelAt(width / 2, 0.5).y, 1680 - 2 / density);
    close(h.sourcePixelAt(width / 2, height - 0.5).y, 1504 + 2 / density);
    assert.equal(h.sourcePixelAt(width / 2, height + 0.5), null);
    assert.equal(h.sourcePixelAt(width / 2, -0.5), null);
    assert.equal(h.sourcePixelAt(-0.5, height / 2), null);
    assert.equal(h.sourcePixelAt(width + 0.5, height / 2), null);
    h.assertRestored();
  });

  test(`${density}x one-pixel seam retains original orientation before reflection begins at the same bitmap edge`, () => {
    const h = pixelContext(), { media, slice, width, height } = responsivePhoto(density, 420);
    paintMediaEdge(h.context, media, media.naturalHeight, slice, width, height + 1, {
      height: 1, sourceHeight: media.naturalHeight / 600 / density,
    });
    assert.equal(h.draws.length, 2);
    assert.ok(h.draws.every(draw => draw.args.length === 5 && draw.args[0] === media));
    close(h.sourcePixelAt(width / 2, 0.5).y, 1680 - 2 / density);
    close(h.sourcePixelAt(width / 2, 1.5).y, 1680 - 2 / density);
    close(h.sourcePixelAt(width / 2, 2.5).y, 1680 - 6 / density);
    assert.ok(h.sourcePixelAt(width / 2, 0.25).y < h.sourcePixelAt(width / 2, 0.75).y,
      "the seam keeps the original image direction");
    assert.ok(h.sourcePixelAt(width / 2, 1.25).y > h.sourcePixelAt(width / 2, 1.75).y,
      "the reflected band reverses direction immediately below the seam");
    assert.equal(h.sourcePixelAt(width / 2, height + 1.5), null);
    h.assertRestored();
  });
}

test("canvas transform and clipping are restored if either band draw throws", () => {
  for (const overlap of [{ height: 0, sourceHeight: 0 }, { height: 1, sourceHeight: 1 }]) {
    for (const throwAt of overlap.height ? [1, 2] : [1]) {
      const h = pixelContext({ throwAt });
      const media = { bitmapWidth: 1000, bitmapHeight: 2000 };
      assert.throws(() => paintMediaEdge(h.context, media, 2000,
        { top: 1890, height: 110 }, 800, 90, overlap), /Frame unavailable/);
      h.assertRestored();
    }
  }
});
