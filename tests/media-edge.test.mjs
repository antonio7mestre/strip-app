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

test("reflects the edge vertically and reuses the existing video frame", () => {
  const calls = [];
  const context = {
    setTransform: (...args) => calls.push(["transform", ...args]),
    drawImage: (...args) => calls.push(["draw", ...args]),
  };
  const video = { currentTime: 12.5 };
  paintMediaEdge(context, video, 1000, { top: 1890, height: 110 }, 786, 88);
  assert.deepEqual(calls, [
    ["transform", 1, 0, 0, -1, 0, 88],
    ["draw", video, 0, 1890, 1000, 110, 0, 0, 786, 88],
  ]);
  assert.equal(video.currentTime, 12.5);
});
