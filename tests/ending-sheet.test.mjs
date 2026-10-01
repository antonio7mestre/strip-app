import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StripEndingSheet } from "./helpers/ending-sheet.mjs";

test("preview and published endings have identical surfaces, caption and spacing for any last block", () => {
  for (const username of ["antonio", null]) {
    for (const cornerColor of [undefined, "#000000", "#FFFFFF", "#9772FF", "#CCFF00"]) {
      const children = createElement("div", { className: "strip-end-sheet-controls" },
        createElement("button", null, "Edit this Strip"), createElement("button", null, "Share"));
      const render = preview => renderToStaticMarkup(createElement(StripEndingSheet, { username, cornerColor, preview, children }));
      assert.equal(render(true).replace('aria-label="Strip actions preview"', 'aria-label="Strip actions"'),
        render(false).replace(/<a[^>]*>([^<]*)<\/a>/g, "<span>$1</span>"));
      assert.match(render(false), /strip-end-sheet-corner-fill[^]*strip-end-sheet-surface[^]*strip-ending-card-inner[^]*published-bottom-sheet-title/);
      assert.match(render(false), /--ending-background:#FFFFFF/);
      assert.match(render(false), /--ending-button:#000000/);
    }
  }
});

test("published attribution links to the author's personal profile without changing the preview", () => {
  for (const username of ["antonio", "softweekend-demo", "ANTONIO"]) {
    const html = renderToStaticMarkup(createElement(StripEndingSheet, { username }));
    assert.ok(html.includes(`href="https://${username.toLowerCase()}.striiip.com/"`));
    assert.ok(html.includes(`aria-label="View @${username}’s profile"`));
    assert.ok(html.includes(`>@${username}</a>`));
    assert.doesNotMatch(html, /target=/, "open in the same tab so browser Back returns to the Strip");
    const preview = renderToStaticMarkup(createElement(StripEndingSheet, { username, preview: true }));
    assert.ok(preview.includes(`<span>@${username}</span>`));
    assert.doesNotMatch(preview, /<a /);
  }
  for (const username of [null, "", "api", "someone_else", "a@evil.test", "bad/name"]) {
    const html = renderToStaticMarkup(createElement(StripEndingSheet, { username }));
    assert.doesNotMatch(html, /<a /, "missing or invalid usernames must not produce a broken or unsafe link");
  }
});

test("both page routes mount the shared footer and never duplicate its caption or surfaces", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal((page.match(/<StripEndingSheet\b/g) ?? []).length, 2);
  assert.doesNotMatch(page, /<h2 className="published-bottom-sheet-title"/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.editor-mode \.strip-ending-card \{|\.published-bottom-sheet::after/);
  assert.match(css, /\.strip-end-sheet \{[^}]*calc\(var\(--dock-bottom-gap\) - var\(--ending-paint-overlap\) \+ env\(safe-area-inset-bottom\)\)/);
});

test("reader bottom clearance matches the cover toolbar including its seam overlap", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--dock-bottom-gap: 2px/);
  assert.match(css, /180px \+ var\(--dock-bottom-gap\) \+ env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.strip-end-sheet-controls.is-preview \{[^}]*repeat\(2, minmax\(0, 1fr\)\)[^}]*gap: 12px/);
  for (const safe of [0, 21, 34]) {
    const footerLayoutGap = 2 - 2 + safe;
    const footerPaintOverlap = 2;
    const toolbarGap = 180 + 2 + safe - 180;
    assert.equal(footerLayoutGap + footerPaintOverlap, toolbarGap);
  }
});
