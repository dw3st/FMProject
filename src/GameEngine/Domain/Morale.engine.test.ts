import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import { setTeamMoraleOverride } from "@/GameEngine/Configs/MoraleConfig";
import { mulberry32 } from "@/Domain/rng";
import formation433Json from "@/Data/formations/4-3-3.json";
import type { Formation } from "@/GameEngine/types";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/** Etapa 23 (`.claude/rules/game/morale.md`): morale scales a player's attributes at build time. */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const f = formation433Json as Formation;

/** Builds the state with the same pre-match random rolls every time. */
function build(home: RosterPlayer[], away: RosterPlayer[]) {
  const rng = mulberry32(42);
  const spy = spyOn(Math, "random").mockImplementation(rng);
  try {
    return createMatchState(home, f, away, f);
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => {
  setTeamMoraleOverride("A", undefined);
  setTeamMoraleOverride("B", undefined);
});

describe("morale in the engine", () => {
  const home = loadSquad("33.json").players;
  const away = loadSquad("34.json").players;

  test("65 (and absent) builds exactly the same players", () => {
    const base = build(home, away);
    const neutral = build(home.map((p) => ({ ...p, morale: 65 })), away);
    expect(neutral.players.map((p) => p.fit)).toEqual(base.players.map((p) => p.fit));
    expect(neutral.benchA.map((p) => p.fit)).toEqual(base.benchA.map((p) => p.fit));
  });

  test("a player's own morale scales his attributes (×1.01 at 100), capped at 10", () => {
    const base = build(home, away);
    const happy = build(home.map((p) => ({ ...p, morale: 100 })), away);
    const a0 = base.players.find((p) => p.team === "A")!;
    const h0 = happy.players.find((p) => p.team === "A" && p.rosterId === a0.rosterId)!;
    for (const k of Object.keys(a0.fit!.stats) as (keyof typeof a0.fit!.stats)[]) {
      expect(h0.fit!.stats[k]).toBeCloseTo(Math.min(10, a0.fit!.stats[k] * 1.01));
    }
    expect(h0.morale).toBe(100);
    // The AI side is untouched.
    expect(happy.players.filter((p) => p.team === "B").map((p) => p.fit))
      .toEqual(base.players.filter((p) => p.team === "B").map((p) => p.fit));
  });

  test("a team override sets the whole side (lab, /test)", () => {
    const base = build(home, away);
    setTeamMoraleOverride("B", 0);
    const sad = build(home, away);
    const b0 = base.players.find((p) => p.team === "B")!;
    const s0 = sad.players.find((p) => p.rosterId === b0.rosterId && p.team === "B")!;
    expect(s0.fit!.stats.passing).toBeCloseTo(b0.fit!.stats.passing * 0.98);
    expect(s0.morale).toBe(0);
  });
});
