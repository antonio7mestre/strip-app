import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(read("app/components/ConfirmationDialog.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require: createRequire(import.meta.url) });
const { ConfirmationDialog } = exports;
const base = { id: "confirmation", title: "Delete this draft?", description: "This can't be undone.", cancelLabel: "Cancel", confirmLabel: "Delete", cancelButtonRef: { current: null } };

test("profile, draft, block and sticker confirmations use the same card and action markup", () => {
  for (const title of ["Discard profile changes?", "Delete this draft?", "Delete this text block?", "Delete this photo block?", "Delete this video block?", "Delete this sticker block?"]) {
    const profile = title.startsWith("Discard");
    const element = ConfirmationDialog({ ...base, title, description: profile ? undefined : base.description, onCancel() {}, onConfirm() {} });
    const html = renderToStaticMarkup(element);
    assert.match(html, /class="confirmation-backdrop"/);
    assert.match(html, /class="confirmation-card" role="alertdialog" aria-modal="true"/);
    assert.match(html, /class="confirmation-actions"/);
    assert.equal((html.match(/<button/g) ?? []).length, 2);
    assert(html.includes(title));
    assert.equal(html.includes('aria-describedby="confirmation-description"'), !profile);
    assert.equal(html.includes('<p id="confirmation-description">'), !profile);
  }
  const page = read("app/page.tsx"), editor = read("app/components/ProfileEditor.tsx");
  assert.match(page, /return <ConfirmationDialog id="delete-modal" title=\{title\} description="This can't be undone\."/);
  assert.match(editor, /createPortal\(<ConfirmationDialog\s+id="profile-discard" title="Discard profile changes\?"/);
});

test("cancel and confirm remain separate and pending deletions cannot dismiss or submit twice", () => {
  for (const pending of [false, true]) {
    const calls = [];
    const element = ConfirmationDialog({ ...base, pending, onCancel: () => calls.push("cancel"), onConfirm: () => calls.push("confirm") });
    const card = element.props.children;
    const buttons = card.props.children[2].props.children;
    element.props.onClick();
    let stopped = 0;
    card.props.onClick({ stopPropagation: () => stopped++ });
    buttons[0].props.onClick(); buttons[1].props.onClick();
    assert.equal(stopped, 1);
    assert.equal(buttons[0].props.ref, base.cancelButtonRef);
    assert(buttons.every(button => button.props.disabled === pending));
    assert.deepEqual(calls, pending ? [] : ["cancel", "cancel", "confirm"]);
  }
});

test("all dialog text is centered and shares the profile discard sizing and pill buttons", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.confirmation-card \{[^}]*width: min\(100%, 360px\);[^}]*padding: 23px;[^}]*border-radius: 22px;[^}]*text-align: center;/);
  assert.match(css, /\.confirmation-card h2 \{[^}]*font-size: 18px;[^}]*text-align: center;/);
  assert.match(css, /\.confirmation-card p \{[^}]*text-align: center;/);
  assert.match(css, /\.confirmation-actions \{[^}]*repeat\(2, minmax\(0, 1fr\)\);[^}]*gap: 10px;[^}]*margin-top: 22px;/);
  assert.match(css, /\.confirmation-actions button \{[^}]*min-height: 44px;[^}]*border-radius: 999px;/);
  assert.doesNotMatch(css, /\.delete-modal|\.profile-discard-card|\.modal-backdrop/);
});
