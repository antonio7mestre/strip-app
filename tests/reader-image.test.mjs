import assert from "node:assert/strict";
import test from "node:test";
import { getReaderImageProps, READER_IMAGE_VERSION, READER_IMAGE_WIDTHS } from "../app/lib/reader-image.ts";

const origin = "https://antonio.striiip.com";
const media = "/api/strips/1791303521563-plsa2g/media/photo-001";
const cover = "/api/strips/1791303521563-plsa2g/cover";
const draft = "/api/drafts/draft-001/media/photo-001";
const parse = source => new URL(source, origin);

test("the reader exposes a finite, ascending set of bounded widths and a cache version", () => {
  assert.deepEqual([...READER_IMAGE_WIDTHS], [480, 768, 1024, 1280, 1600, 1920, 2560]);
  assert.equal(READER_IMAGE_VERSION, "1");
  assert.equal(new Set(READER_IMAGE_WIDTHS).size, READER_IMAGE_WIDTHS.length);
});

test("known media and cover routes get responsive variants with one 1280px fallback", () => {
  for (const source of [media, cover, draft]) {
    const result = getReaderImageProps(source);
    assert.equal(result.sizes, "100vw");
    assert.notEqual(result.src, source);
    assert.equal(parse(result.src).pathname, source);
    assert.equal(parse(result.src).searchParams.get("reader-width"), "1280");
    assert.equal(parse(result.src).searchParams.get("reader-version"), READER_IMAGE_VERSION);
    const candidates = result.srcSet.split(", ").map(candidate => {
      const [url, descriptor] = candidate.split(" ");
      assert.match(descriptor, /^\d+w$/);
      assert.equal(parse(url).pathname, source);
      assert.equal(parse(url).searchParams.get("reader-width"), descriptor.slice(0, -1));
      assert.equal(parse(url).searchParams.get("reader-version"), READER_IMAGE_VERSION);
      return { url, width: Number(descriptor.slice(0, -1)) };
    });
    assert.deepEqual(candidates.map(candidate => candidate.width), [...READER_IMAGE_WIDTHS]);
    assert.equal(candidates.find(candidate => candidate.width === 1280).url, result.src);
    assert.equal(new Set(candidates.map(candidate => candidate.url)).size, READER_IMAGE_WIDTHS.length);
  }
});

test("custom display sizes change selection hints without altering variant identity", () => {
  const full = getReaderImageProps(cover);
  const entrance = getReaderImageProps(cover, "74vw");
  assert.equal(entrance.sizes, "74vw");
  assert.equal(entrance.src, full.src);
  assert.equal(entrance.srcSet, full.srcSet);
});

test("reusing an existing variant replaces stale width/version values without stacking parameters", () => {
  const result = getReaderImageProps(`${media}?reader-width=99999&reader-width=99&reader-version=old`);
  assert.deepEqual(parse(result.src).searchParams.getAll("reader-width"), ["1280"]);
  assert.deepEqual(parse(result.src).searchParams.getAll("reader-version"), [READER_IMAGE_VERSION]);
  assert.deepEqual(getReaderImageProps(result.src), result);
});

test("variants preserve the original route, unrelated query values and fragment", () => {
  const source = `${media}?v=existing-cover-version&name=a%20b#photo`;
  const result = getReaderImageProps(source);
  for (const candidate of [result.src, ...result.srcSet.split(", ").map(item => item.split(" ")[0])]) {
    const url = parse(candidate);
    assert.equal(url.pathname, media);
    assert.equal(url.searchParams.get("v"), "existing-cover-version");
    assert.equal(url.searchParams.get("name"), "a b");
    assert.equal(url.hash, "#photo");
    assert.equal(url.origin, origin);
  }
});

test("unknown resources remain exact originals without responsive query injection", () => {
  for (const source of [
    "", "/photo.jpg", "/api/strips/strip-id", "/api/strips/strip-id/cover/extra",
    "/api/strips/strip-id/media", "/api/strips/strip-id/media/photo-id/extra",
    "/api/drafts/draft-id/cover", "/api/profiles/antonio/avatar",
    "/api/strips//media/photo", "/api/strips/strip-id/media/",
    "/api/strips/x/media/y", "/api/strips/strip-id/media/invalid%2Fid",
    "blob:https://antonio.striiip.com/image-id", "data:image/jpeg;base64,abcd",
    "javascript:alert(1)", "https://example.com/photo.jpg",
    media.slice(1), `/\\evil.example${media}`,
  ]) {
    assert.deepEqual(getReaderImageProps(source), { src: source }, source);
  }
});

test("foreign and lookalike origins cannot receive Striiip variant parameters", () => {
  for (const source of [
    `https://example.com${media}`, `https://striiip.com.evil.example${media}`,
    `https://notstriiip.com${media}`, `https://striiip.com@evil.example${media}`,
    `ftp://antonio.striiip.com${media}`, `http://antonio.striiip.com${media}`, `//evil.example${media}`,
  ]) {
    assert.deepEqual(getReaderImageProps(source), { src: source }, source);
  }
});

test("approved Striiip and local absolute URLs retain their own origin", () => {
  for (const base of ["https://striiip.com", "https://antonio.striiip.com", "http://localhost:3000", "https://localhost:3000", "http://127.0.0.1:3000", "https://127.0.0.1:3000"]) {
    const result = getReaderImageProps(base + media);
    assert.notEqual(result.src, base + media);
    assert.equal(new URL(result.src).origin, base);
    assert.equal(new URL(result.src).pathname, media);
    assert.ok(result.srcSet);
  }
});
