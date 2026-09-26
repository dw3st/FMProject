import { describe, expect, test } from "bun:test";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getPlayerStats, getTeamStats, initStats } from "@/GameEngine/Domain/Statistics";

describe("knockout stats", () => {
  test("penalties per player, extra time and shootout per team", () => {
    initStats([{ id: 1, team: "A" }, { id: 2, team: "B" }]);
    gameBus.emit("extraTimeStart", { score: { A: 1, B: 1 } });
    gameBus.emit("penaltyKick", { team: "A", takerId: 1, keeperId: 2, scored: true, chance: 0.75, score: { A: 1, B: 0 } });
    gameBus.emit("penaltyKick", { team: "B", takerId: 2, keeperId: 1, scored: false, chance: 0.75, score: { A: 1, B: 0 } });
    gameBus.emit("shootoutEnd", { winner: "A", score: { A: 1, B: 0 } });

    expect(getPlayerStats(1).penaltiesTaken).toBe(1);
    expect(getPlayerStats(1).penaltiesScored).toBe(1);
    expect(getPlayerStats(2).penaltiesScored).toBe(0);
    expect(getPlayerStats(1).goals).toBe(0); // shootout kicks are not goals
    expect(getTeamStats("A")).toMatchObject({ extraTimePlayed: 1, shootoutsWon: 1, penaltiesScored: 1 });
    expect(getTeamStats("B")).toMatchObject({ extraTimePlayed: 1, shootoutsWon: 0, penaltiesTaken: 1 });

    initStats([{ id: 1, team: "A" }]);
    expect(getTeamStats("A").extraTimePlayed).toBe(0);
  });
});
