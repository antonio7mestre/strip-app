import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stickerAspectRatio, stickerLiftKeyframes } from "../app/lib/cover-entrance.ts";
import { stickerMesh, stickerPoint, stickerTilt, stickerPeelAmount, stickerFlightPhase } from "../app/lib/sticker-flight.ts";
import { stickerDate, markerDateStrokes, stickerDatePlacement } from "../app/lib/sticker-date.ts";

test("the marker date uses the original publication date, not today's date", () => {
  assert.equal(stickerDate(Date.UTC(2026,8,8,14)), "9/8/26");
  assert.equal(stickerDate(Date.UTC(2025,11,31,23)), "12/31/25");
  assert.equal(stickerDate(NaN), "");
  assert.equal(stickerDate(), "");
  const strokes = markerDateStrokes("9/8/26");
  assert.equal(strokes.length, 6);
  assert.ok(strokes.slice(1).every((value, i) => value.x > strokes[i].x));
  assert.ok(new Set(strokes.map(value => value.width)).size > 1);
  assert.deepEqual(markerDateStrokes("9/8/26"), strokes);
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const flight = readFileSync(new URL("../app/lib/sticker-flight.ts", import.meta.url), "utf8");
  assert.match(page, /publishedAt=\{entranceStrip.publishedAt\}/);
  assert.match(flight, /texture\(back, vec2\(1.0 - vUv.x, vUv.y\)\)/, "writing is readable, not mirrored on the reverse");
});

test("borderless stickers preserve the full artwork's ratio at every poster size", () => {
  for (const ratio of [0.2, 0.8, 1, 1.5, 5]) {
    for (const width of [160, 290.82, 320]) {
      const height = width / stickerAspectRatio(ratio);
      assert.ok(Math.abs(width / height - ratio) < 1e-10);
    }
  }
  assert.equal(stickerAspectRatio(NaN), 1);
  assert.equal(stickerAspectRatio(0), 1);
});

test("direct entry gently presses a small corner down without changing the home peel", () => {
  for(const progress of [0,.1,.4,.8,1]){
    assert.equal(stickerFlightPhase(progress),progress);
    assert.ok(Math.abs(stickerFlightPhase(progress,.9)-(.9+progress*.1))<1e-10);
  }
  assert.equal(stickerFlightPhase(0,.9),.9);
  assert.equal(stickerFlightPhase(1,.9),1);
  assert.ok(stickerPeelAmount(.9)<.27, "only a small corner starts lifted");
  const component=readFileSync(new URL("../app/components/StripEntrance.tsx",import.meta.url),"utf8");
  assert.match(component,/phaseStart: .9, duration: DIRECT_STICKER_SETTLE_MS/);
  assert.match(component,/stickerLiftKeyframes\(peelSide\).slice\(36\)/);
  assert.ok(component.includes('translate(8px, -12px) scale(.9)'), "starts smaller and close to its final position");
  assert.match(component,/animation.pause\(\); animation.currentTime = 0/);
  assert.match(component,/onReady: beginMotion, duration: COVER_MOVE_MS/);
  assert.doesNotMatch(component,/openDirectCover|liftDirectCover|clipPath/);
});

test("the smaller marker date follows the revealed top corner on both backs", () => {
  for (const [width, height] of [[300,300],[300,450],[300,150]]) {
    for (const date of ["9/8/26", "12/31/25"]) {
      const left = stickerDatePlacement(date,width,height,-1);
      const right = stickerDatePlacement(date,width,height,1);
      const textWidth = (markerDateStrokes(date).at(-1).x + 19) * left.scale;
      assert.equal(left.y,height*.075);
      assert.equal(right.y,left.y);
      assert.equal(left.scale,right.scale);
      assert.ok(textWidth <= width*.26+.001);
      assert.ok(left.x > width*.6, "left-front peel exposes the right of the readable back");
      assert.ok(right.x < width*.1, "right-front peel exposes the left of the readable back");
      assert.ok(Math.abs(left.x+right.x+textWidth-width)<.001);
    }
  }
  const component=readFileSync(new URL("../app/components/StripEntrance.tsx",import.meta.url),"utf8");
  assert.match(component,/paintStickerDate\(context, date, width, height, side\)/);
  assert.match(component,/data-peel-side=\{peelSide < 0 \? "left" : "right"\}/);
});

test("the sticker gently lifts without spinning and lands exactly flat", () => {
  for (const direction of [-1, 1]) {
    const frames = stickerLiftKeyframes(direction);
    assert.equal(frames.length, 41);
    const turns = frames.map(frame => Number(frame.transform.match(/rotateY\(([-\d.]+)deg\)/)[1]));
    assert.equal(Math.abs(turns[0]), 0);
    assert.equal(turns[20], -direction * 8);
    assert.equal(Math.abs(turns.at(-1)), 0);
    assert.ok(turns.every(turn => Math.abs(turn) <= 8));
    assert.match(frames[20].transform, /translateZ\(32.000px\)/);
    assert.match(frames.at(-1).transform, /translateZ\(0.000px\) rotateX\(0.000deg\)/);
    assert.deepEqual(frames.map(f => f.offset), Array.from({length:41}, (_, i) => i / 40));
  }
});

test("a continuous mesh curls the leading side early and lands completely flat", () => {
  const mesh = stickerMesh();
  assert.equal(mesh.points.length, 33 * 33 * 2);
  assert.equal(mesh.indices.length, 32 * 32 * 6);
  assert.ok(Math.max(...mesh.indices) < mesh.points.length / 2);
  for (const side of [-1, 1]) {
    const outer = side < 0 ? 0 : 1;
    assert.ok(stickerPoint(outer, 0, .15, side, 300, 300)[2] > 20, "leading corner curls before the turn is far along");
    assert.ok(stickerPoint(outer, 0, .9, side, 300, 300)[2] < stickerPoint(outer, 0, .5, side, 300, 300)[2]);
    assert.equal(Math.sign(stickerTilt(.5, side)), -side, "left cover raises its left edge; right cover raises its right");
    assert.ok(Math.abs(stickerTilt(.5, side)) < .15, "a subtle tilt, never a spin");
    for (let i = 0; i < mesh.points.length; i += 2) {
      assert.deepEqual(stickerPoint(mesh.points[i],mesh.points[i+1],0,side,300,240),
        stickerPoint(mesh.points[i],mesh.points[i+1],1,side,300,240));
    }
  }
});

test("the whole sticker releases before travel, then presses down progressively", () => {
  assert.equal(stickerPeelAmount(0), 0);
  assert.equal(stickerPeelAmount(.32), 1);
  assert.equal(stickerPeelAmount(.70), 1);
  assert.ok(stickerPeelAmount(.90) < stickerPeelAmount(.80));
  assert.equal(stickerPeelAmount(1), 0);
  for (const side of [-1, 1]) {
    const attachedEdge = side < 0 ? 1 : 0;
    assert.equal(stickerPoint(attachedEdge, .5, .15, side, 300, 300)[2], 0);
    assert.equal(Math.abs(stickerTilt(.15, side)), 0);
    assert.equal(stickerPoint(attachedEdge, .5, .9, side, 300, 300)[2], 0);
  }
});

test("the peel preserves material length rather than scaling or squashing the sheet", () => {
  const nx=.782,ny=Math.sqrt(1-nx*nx),half=150/nx;
  const sample=(i,time)=>{const along=(i/500*2-1)*half;return stickerPoint(.5+along*nx/300,.5-along*ny/300,time,1,300,300);};
  for (const time of [.15,.32,.5,.85]) {
    let distance=0,previous=sample(0,time);
    for(let i=1;i<=500;i++){
      const point=sample(i,time);
      distance+=Math.hypot(...point.map((value,j)=>value-previous[j]));previous=point;
    }
    assert.ok(Math.abs(distance-half*2)<4, `material length changed at ${time}: ${distance}`);
  }
});

test("top outside corners lift before the bottom edge, mirrored by home column", () => {
  for(const side of [-1,1]){
    const outside=side<0?0:1;
    assert.ok(stickerPoint(outside,0,.10,side,300,300)[2]>5);
    assert.equal(stickerPoint(outside,1,.10,side,300,300)[2],0);
    assert.equal(stickerPoint(1-outside,1,.20,side,300,300)[2],0);
  }
});

test("the curve is mirrored by home position and never has a sharp hinge", () => {
  for (const t of [.1,.35,.6,.9]) for (const u of [0,.2,.6,1]) {
    const left=stickerPoint(u,.2,t,-1,300,300),right=stickerPoint(1-u,.2,t,1,300,300);
    assert.ok(Math.abs(left[0]+right[0])<.0001);
    assert.ok(Math.abs(left[2]-right[2])<.0001);
    const adjacent=stickerPoint(u+.0001,.2,t,-1,300,300);
    assert.ok(Math.hypot(...left.map((value,i)=>value-adjacent[i]))<.1);
  }
});

test("home handoff captures and hides the complete backing, not only the image", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const component = readFileSync(new URL("../app/components/StripEntrance.tsx", import.meta.url), "utf8");
  assert.match(page, /button.querySelector<HTMLElement>\("\.library-cover-frame"\)/);
  assert.match(page, /library-cover-frame\$\{isDraft \? "" : " cover-sticker"\}/);
  assert.match(css, /\.library-card.is-opening-cover \.library-cover-frame,/);
  assert.doesNotMatch(css, /url\("\/cover-sticker-paper.webp"\)/);
  assert.match(css, /\.cover-sticker \{[^}]*padding: 0;[^}]*background: transparent;/);
  const flight=readFileSync(new URL("../app/lib/sticker-flight.ts",import.meta.url),"utf8");
  assert.match(flight,/context.drawImage\(options.image, 0, 0, w, h\)/);
  assert.doesNotMatch(flight,/\brim\b|materialBlend|cover-sticker-paper.webp/);
  assert.match(css, /url\("\/cover-sticker-back.webp"\)/);
  assert.match(page, /rel="preload" as="image" href="\/cover-sticker-back.webp"/);
  assert.match(component, /stickerRef.current\?\.animate\(stickerLiftKeyframes\(side\)/);
  assert.match(component, /startStickerFlight\(canvasRef.current/);
  assert.match(component, /animation.cancel\(\); lift\?\.cancel\(\); stopFlight\?\.\(\)/);
  assert.match(component, /lift.startTime = started/);
  assert.match(component, /cover-sticker-body-rear/);
  assert.doesNotMatch(component + css, /cover-sticker-flap/);
  assert.match(css, /\.cover-sticker-spinner \{[^}]*transform-style: preserve-3d/);
  assert.match(css, /transform: rotateY\(180deg\) translateZ\(0.35px\)/);
  assert.match(css, /cover-sticker-canvas\[data-ready="true"\] \+ \.cover-sticker-spinner \{ visibility: hidden; \}/);
  assert.match(component, /stickerAspectRatio\(image.naturalWidth \/ image.naturalHeight\)/);
  for (const face of ["paper", "back"]) {
    const asset = readFileSync(new URL(`../public/cover-sticker-${face}.webp`, import.meta.url));
    assert.equal(asset.subarray(8, 12).toString(), "WEBP");
    assert.ok(asset.length < 200000, "shared paper textures, not a 3D runtime per card");
  }
});
