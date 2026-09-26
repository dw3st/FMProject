import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("simulateMatch pass accounting", () => {
  // Every counted pass must end in passCompleted or passFailed. Through balls have their own
  // stat family (throughBallStarted → Completed / LostInFlight / LostInRace / LostInDuel) and
  // must not be counted as passes. Slack covers a pass still in flight at the final whistle.
  test("passesAttempted ≈ passesCompleted + passesFailed, and through balls are not passes", () => {
    let throughBalls = 0;
    const off = gameBus.on("throughBallStarted", () => { throughBalls++; });
    const result = simulateMatch(loadSquad("33.json"), loadSquad("34.json"));
    off();

    for (const team of ["A", "B"] as const) {
      const t = result.teamStats[team];
      const unresolved = t.passesAttempted - t.passesCompleted - t.passesFailed;
      expect(unresolved).toBeGreaterThanOrEqual(0);
      expect(unresolved).toBeLessThanOrEqual(2);
    }
    // Sanity: the match did play through balls, so the check above is meaningful.
    expect(throughBalls).toBeGreaterThan(0);
  }, 30_000);
});

describe("simulateMatch knockout", () => {
  test("never ends level; decider is consistent with the score", () => {
    const squad = loadSquad("33.json");
    for (let i = 0; i < 6; i++) {
      // Same squad both sides → many level games after 90'.
      const r = simulateMatch(squad, squad, undefined, undefined, undefined, undefined, { knockout: true });
      const d = r.decider;
      if (!d) {
        expect(r.score.A).not.toBe(r.score.B);
        continue;
      }
      if (d.penalties) {
        expect(r.score.A).toBe(r.score.B);
        expect(d.penalties.A).not.toBe(d.penalties.B);
        expect(d.winner).toBe(d.penalties.A > d.penalties.B ? "A" : "B");
      } else {
        expect(r.score.A).not.toBe(r.score.B);
      }
      expect(r.teamStats.A.extraTimePlayed).toBe(1);
    }
  }, 120_000);

  test("league match reports no decider", () => {
    const r = simulateMatch(loadSquad("33.json"), loadSquad("34.json"));
    expect(r.decider).toBeNull();
  }, 30_000);
});
