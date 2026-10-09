import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

test("no application screen changes or disables motion based on the device preference", () => {
  const app = new URL("../app/", import.meta.url);
  for (const file of readdirSync(app, { recursive: true })) {
    if (!/\.(?:css|tsx?|jsx?)$/.test(file)) continue;
    const source = readFileSync(new URL(file, app), "utf8");
    assert.doesNotMatch(source, /prefers-reduced-motion|reducedMotion|reduceMotion/, file);
  }
});
