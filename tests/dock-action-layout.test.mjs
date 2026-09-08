import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

function rule(selector) {
  const start = css.indexOf(`\n${selector} {`) + 1;
  assert.ok(start > 0, `Missing ${selector}`);
  return css.slice(start + selector.length + 2, css.indexOf("}", start));
}

test("all three two-button steps opt into the shared layout without changing actions", () => {
  for (const [dock, handlers] of [
    ["title-setup-dock", ["returnToCoverSetup()", "publish()"]],
    ["publish-setup-dock", ["returnFromPublishSetup()", "continueToTitle"]],
  ]) {
    const start = page.indexOf(`className=${dock === "title-setup-dock" ? '"' : '{`'}composer-dock ${dock}`);
    assert.ok(start >= 0);
    const footer = page.slice(start, page.indexOf("</footer>", start));
    assert.match(footer, /currentDockControlsClass\} dock-action-controls/);
    for (const handler of handlers) assert.ok(footer.includes(handler));
  }
  assert.match(page, /currentDockControlsClass\} dock-action-controls height-crop-dock-controls/);
  assert.match(page, /onClick=\{\(\) => finishHeightCrop\(false\)\}/);
  assert.match(page, /onClick=\{\(\) => finishHeightCrop\(true\)\}/);
});

test("action rows and the main editor use exactly the same width and outer padding", () => {
  const dock = rule(".composer-dock");
  assert.match(dock, /--dock-controls-width: min\(calc\(100% - 24px\), 536px\)/);
  assert.match(dock, /--dock-padding-left: max\(12px, env\(safe-area-inset-left\)\)/);
  assert.match(dock, /--dock-padding-right: max\(12px, env\(safe-area-inset-right\)\)/);
  assert.match(rule(".main-composer-dock .dock-controls-current"), /width: var\(--dock-controls-width\)/);
  const actions = rule(".composer-dock .dock-action-controls");
  assert.match(actions, /width: var\(--dock-controls-width\)/);
  assert.match(actions, /padding-inline: 0/);
  assert.doesNotMatch(actions, /bottom-action-tray-max-width/);
  assert.doesNotMatch(rule(".main-composer-dock .height-crop-dock-controls"), /width:|gap:|padding/);
});

test("buttons fill equal columns with a real gap, independent of their labels", () => {
  const actions = rule(".composer-dock .dock-action-controls");
  assert.match(actions, /display: grid/);
  assert.match(actions, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(actions, /gap: 12px/);
  const button = rule(".composer-dock .dock-action-controls > button");
  assert.match(button, /width: 100%/);
  assert.match(button, /min-width: 0/);
  assert.match(button, /height: 48px/);
  assert.match(button, /padding-inline: 12px/);
});

test("phone rules cannot collapse the crop gap or shrink a Back button to icon width", () => {
  const start = css.indexOf("@media (max-width: 430px)");
  const mobile = css.slice(start, css.indexOf(".font-size-stepper button", start));
  assert.doesNotMatch(mobile, /dock-controls-current|gap: 0/);
  assert.match(mobile, /:not\(\.publish-strip-button\):not\(\.publish-flow-button\)/);
});

test("outgoing action rows retain equal columns and the same inset during navigation", () => {
  assert.match(page, /classList\.contains\("dock-action-controls"\)\s*\? "dock-action-controls"/);
  const outgoing = rule(".composer-dock .dock-action-controls.dock-controls-outgoing");
  assert.match(outgoing, /right: calc\(var\(--dock-padding-right\) \+ 12px\)/);
  assert.match(outgoing, /left: calc\(var\(--dock-padding-left\) \+ 12px\)/);
  assert.match(outgoing, /width: auto/);
  assert.match(outgoing, /max-width: 536px/);
  assert.match(outgoing, /margin-inline: auto/);
  assert.match(css, /\.publish-flow-dock \.publish-flow-button,\s*\.dock-action-controls \.publish-flow-button/);
});
