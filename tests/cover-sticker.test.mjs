import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stickerAspectRatio, stickerLiftKeyframes } from "../app/lib/cover-entrance.ts";

test("paper backing preserves the full artwork's ratio at every poster size", () => {
  for (const ratio of [0.2, 0.8, 1, 1.5, 5]) {
    for (const width of [160, 290.82, 320]) {
      const height = width / stickerAspectRatio(ratio);
      const rim = width * 0.0225;
      assert.ok(Math.abs((width - rim * 2) / (height - rim * 2) - ratio) < 1e-10);
    }
  }
  assert.equal(stickerAspectRatio(NaN), 1);
  assert.equal(stickerAspectRatio(0), 1);
});

test("paper lifts subtly toward the center and settles exactly flat", () => {
  for (const direction of [-1, 1]) {
    const frames = stickerLiftKeyframes(direction);
    assert.equal(frames[0].transform, frames.at(-1).transform);
    assert.match(frames[1].transform, /translateZ\(12px\)/);
    assert.match(frames[2].transform, /translateZ\(4px\)/);
    assert.ok(frames[1].transform.includes(`rotateY(${direction * 5}deg)`));
    assert.deepEqual(frames.map(f => f.offset), [0, 0.32, 0.65, 1]);
  }
});

test("home handoff captures and hides the complete backing, not only the image", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.match(page, /button.querySelector<HTMLElement>\("\.library-cover-frame"\)/);
  assert.match(page, /library-cover-frame\$\{isDraft \? "" : " cover-sticker"\}/);
  assert.match(css, /\.library-card.is-opening-cover \.library-cover-frame,/);
  assert.match(css, /url\("\/cover-sticker-backing.png"\)/);
  assert.match(component, /stickerRef.current\?\.animate\(stickerLiftKeyframes\(side\)/);
  assert.match(component, /animation.cancel\(\); lift\?\.cancel\(\)/);
  assert.match(component, /stickerAspectRatio\(image.naturalWidth \/ image.naturalHeight\)/);
  const asset = readFileSync(new URL("../public/cover-sticker-backing.png", import.meta.url));
  assert.equal(asset.subarray(1, 4).toString(), "PNG");
  assert.ok(asset.length < 200000, "one lightweight shared backing, not a 3D runtime per card");
});
