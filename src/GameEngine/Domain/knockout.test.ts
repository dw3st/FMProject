import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, endCurrentPeriod, knockoutDecider, matchMinute, tickState } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { Formation, GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}
function loadFormation(): Formation {
  const path = fileURLToPath(new URL(`../../example_data/formations/4-3-3.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Formation;
}

function base(knockout: boolean, score: { A: number; B: number }): GameState {
  const f = loadFormation();
  const s = createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f);
  return { ...s, knockout, score, matchPhase: "secondHalf", presentationCountdown: 0 };
}

describe("endCurrentPeriod", () => {
  test("league match level after 90' ends the match", () => {
    const s = endCurrentPeriod(base(false, { A: 1, B: 1 }));
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toBeNull();
  });

  test("knockout match decided in 90' ends without a decider", () => {
    const s = endCurrentPeriod(base(true, { A: 2, B: 1 }));
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toBeNull();
  });

  test("knockout level after 90' → extra time break → ET1 → ET2", () => {
    let s = endCurrentPeriod(base(true, { A: 1, B: 1 }));
    expect(s.matchPhase).toBe("extraTimeBreak");
    expect(s.scoreAtRegulation).toEqual({ A: 1, B: 1 });
    s = tickState({ ...s, presentationCountdown: 0.01 }, 0.02).state;
    expect(s.matchPhase).toBe("extraTimeFirst");
    expect(s.matchTime).toBe(0);
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("extraTimeSecond");
  });

  test("goal in extra time wins it; decider reports the extra-time goals", () => {
    let s = endCurrentPeriod(base(true, { A: 1, B: 1 }));
    s = { ...s, matchPhase: "extraTimeSecond", score: { A: 2, B: 1 } };
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("matchEnd");
    expect(knockoutDecider(s)).toEqual({ extraTime: { A: 1, B: 0 }, penalties: null, winner: "A" });
  });

  test("level after extra time → penalties, presented kick by kick, then matchEnd", () => {
    let s = endCurrentPeriod(base(true, { A: 0, B: 0 }));
    s = { ...s, matchPhase: "extraTimeSecond" };
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("penalties");
    const total = s.shootout!.kicks.length;
    let kicks = 0;
    let ended: { decider?: unknown } | null = null;
    const offKick = gameBus.on("penaltyKick", () => { kicks++; });
    const offEnd = gameBus.on("matchEnd", (e) => { ended = e; });
    for (let i = 0; i < 200 && s.matchPhase === "penalties"; i++) s = tickState(s, 2).state;
    offKick(); offEnd();
    expect(kicks).toBe(total);
    expect(s.matchPhase).toBe("matchEnd");
    const d = knockoutDecider(s)!;
    expect(d.penalties).toEqual(s.shootout!.finalScore);
    expect(d.winner).toBe(s.shootout!.winner);
    expect(ended).not.toBeNull();
  });
});

describe("matchMinute", () => {
  test("offsets per period", () => {
    const s = base(true, { A: 0, B: 0 });
    expect(matchMinute({ ...s, matchPhase: "firstHalf", matchTime: 600 })).toBe(10);
    expect(matchMinute({ ...s, matchPhase: "secondHalf", matchTime: 600 })).toBe(55);
    expect(matchMinute({ ...s, matchPhase: "extraTimeBreak", matchTime: 2760 })).toBe(91);
    expect(matchMinute({ ...s, matchPhase: "extraTimeFirst", matchTime: 300 })).toBe(95);
    expect(matchMinute({ ...s, matchPhase: "extraTimeSecond", matchTime: 300 })).toBe(110);
  });
});
