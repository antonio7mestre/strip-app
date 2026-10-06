import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../app/lib/media-import-feedback.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

export function mediaFeedbackClock() {
  const timers = new Map(), exports = {};
  let clock = 0, sequence = 0;
  runInNewContext(compiled, {
    exports, performance: { now: () => clock },
    setTimeout: (callback, delay) => {
      const id = ++sequence;
      timers.set(id, { at: clock + delay, callback });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  return {
    ...exports, timers,
    advance(ms) {
      const end = clock + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); clock = next[1].at; next[1].callback();
      }
      clock = end;
    },
  };
}
