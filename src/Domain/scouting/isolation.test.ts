import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * The AI market and the match engine read exact values only (`.claude/rules/game/scouting.md`):
 * nothing under them may import the scouting model or the screen blur.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("scouting isolation", () => {
  test("engine, AI market and day-advance domain never import scouting or the blur", () => {
    const dirs = ["src/GameEngine", "src/Domain/transfer", "src/Domain/negotiation", "src/Domain/advanceDay", "src/Domain/aiFinance"];
    const offenders = dirs.flatMap(files).filter((f) => {
      const src = readFileSync(f, "utf-8");
      return /from "@\/(Domain\/scouting|backend\/scoutingWorld)/.test(src) || /\bobscure(Player|Squad|ForViewer)\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
