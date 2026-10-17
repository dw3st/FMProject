import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Rules of Hooks guard (4.29.1): a hook called after a component's early `return` runs only on some renders and
 * React throws "Rendered more hooks than during the previous render" (the live match went black). The project has
 * no hooks lint, so the screens that grew early returns are checked here: no top-level `useX(` after the first
 * top-level `if (...) { return (`.
 */
const SCREENS = ["MatchScreen.tsx"];

function hooksAfterEarlyReturn(source: string): string[] {
  const early = source.search(/\n {2}if \([^\n]*\) \{\n {4}return \(/);
  if (early < 0) return [];
  const rest = source.slice(early);
  return [...rest.matchAll(/\n {2}(?:const|let) [^\n=]+= (use[A-Z]\w*)\s*[<(]|\n {2}(use[A-Z]\w*)\(/g)].map((m) => m[1] ?? m[2]!);
}

describe("rules of hooks", () => {
  for (const file of SCREENS) {
    test(`${file}: no hook after an early return`, () => {
      const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
      expect(hooksAfterEarlyReturn(source)).toEqual([]);
    });
  }
});
