import { describe, expect, test } from "bun:test";
import {
  applyMatchToSquad,
  applyRestDays,
  avgAppearanceEnergy,
  fullEngineAppearances,
  quickSimAppearances,
  totalMatchMinutes,
} from "@/lab/fitnessCarry";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { GamePlayer, SubstitutionRecord } from "@/GameEngine/types";
import { EMPTY_DECISION_MEMORY } from "@/GameEngine/Domain/DecisionTree";

function player(id: string, overrides: Partial<Squad["players"][number]> = {}): Squad["players"][number] {
  return {
    id,
    name: id,
    age: 25,
    squadId: "s",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 7, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
    ...overrides,
  };
}

function squadOf(ids: string[]): Squad {
  return { id: "s", name: "s", colors: ["#000", "#fff"], money: 0, players: ids.map((id) => player(id)) };
}

function gamePlayer(id: string, team: "A" | "B", energy: number): GamePlayer {
  return {
    id: 1, rosterId: id, name: id, team, role: "CM", attackDir: 1, x: 0, y: 0,
    baseStats: {} as GamePlayer["baseStats"], runtimeStats: {} as GamePlayer["runtimeStats"],
    energy, startEnergy: 100, stamina: 7, ballSupportScale: 1, slotIndex: 0,
    basePosition: { x: 0, y: 0 }, targetPosition: { x: 0, y: 0 },
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    recoveryTime: 0, justReceivedTicks: 0,
    decisionMemory: EMPTY_DECISION_MEMORY,
  };
}

describe("totalMatchMinutes", () => {
  test("90 without extra time, 120 with", () => {
    expect(totalMatchMinutes(false)).toBe(90);
    expect(totalMatchMinutes(true)).toBe(120);
  });
});

describe("fullEngineAppearances", () => {
  test("a player still on the pitch at full time plays the whole match", () => {
    const players = [gamePlayer("p0", "A", 55)];
    const map = fullEngineAppearances(players, [], "A", false);
    expect(map.get("p0")).toEqual({ endEnergy: 55, minutes: 90 });
  });

  test("subbed-off player's minutes stop at their sub minute; the sub gets the remainder", () => {
    const players = [gamePlayer("p1", "A", 70)]; // p1 = the substitute, still on the pitch
    const substitutions: SubstitutionRecord[] = [{
      team: "A",
      playerOutId: 1, playerOutName: "p0", playerOutRosterId: "p0", playerOutEnergy: 40,
      playerInId: 2, playerInName: "p1", playerInRosterId: "p1",
      matchMinute: 60,
    }];
    const map = fullEngineAppearances(players, substitutions, "A", false);
    expect(map.get("p0")).toEqual({ endEnergy: 40, minutes: 60 });
    expect(map.get("p1")).toEqual({ endEnergy: 70, minutes: 30 });
  });

  test("other team's substitutions are ignored", () => {
    const substitutions: SubstitutionRecord[] = [{
      team: "B",
      playerOutId: 1, playerOutName: "x", playerOutRosterId: "bx", playerOutEnergy: 10,
      playerInId: 2, playerInName: "y", playerInRosterId: "by",
      matchMinute: 10,
    }];
    const map = fullEngineAppearances([], substitutions, "A", false);
    expect(map.size).toBe(0);
  });
});

describe("quickSimAppearances", () => {
  test("every id on the given side plays the full match, no subs", () => {
    const map = quickSimAppearances(
      { playerEnergy: { "A-p0": 80, "B-p0": 60 }, decider: undefined },
      (id) => id.startsWith("A-"),
    );
    expect(map.get("A-p0")).toEqual({ endEnergy: 80, minutes: 90 });
    expect(map.has("B-p0")).toBe(false);
  });

  test("extra time bumps minutes to 120", () => {
    const map = quickSimAppearances(
      { playerEnergy: { "A-p0": 50 }, decider: { extraTime: { home: 1, away: 0 } } },
      (id) => id.startsWith("A-"),
    );
    expect(map.get("A-p0")?.minutes).toBe(120);
  });
});

describe("avgAppearanceEnergy", () => {
  test("averages every entry, 0 when empty", () => {
    const map = new Map([["a", { endEnergy: 40, minutes: 90 }], ["b", { endEnergy: 60, minutes: 90 }]]);
    expect(avgAppearanceEnergy(map)).toBe(50);
    expect(avgAppearanceEnergy(new Map())).toBe(0);
  });
});

describe("applyMatchToSquad", () => {
  test("a player who appeared gets postMatchFitness + addMatchLoad", () => {
    const squad = squadOf(["p0"]);
    const updated = applyMatchToSquad(squad, new Map([["p0", { endEnergy: 65, minutes: 90 }]]));
    const log = updated.players[0]!.seasonLog!;
    expect(log.fitness).toBe(65);
    expect(log.load).toBe(90); // starts at load 0, decays to 0, +90 minutes
  });

  test("a player who did not appear recovers one day's worth instead", () => {
    const squad: Squad = {
      ...squadOf(["p0"]),
      players: [player("p0", { seasonLog: { ...emptySeasonLog(), fitness: 50, load: 0 } })],
    };
    const updated = applyMatchToSquad(squad, new Map());
    const log = updated.players[0]!.seasonLog!;
    expect(log.fitness).toBeGreaterThan(50);
    expect(log.fitness).toBeLessThan(100);
    expect(log.load).toBe(0);
  });
});

describe("applyRestDays", () => {
  test("0 days is a no-op (same squad reference)", () => {
    const squad = squadOf(["p0"]);
    expect(applyRestDays(squad, 0)).toBe(squad);
  });

  test("fitness recovers toward 100 and load decays over multiple days", () => {
    const squad: Squad = {
      ...squadOf(["p0"]),
      players: [player("p0", { seasonLog: { ...emptySeasonLog(), fitness: 40, load: 100 } })],
    };
    const updated = applyRestDays(squad, 3);
    const log = updated.players[0]!.seasonLog!;
    expect(log.fitness).toBeGreaterThan(40);
    expect(log.fitness).toBeLessThanOrEqual(100);
    expect(log.load).toBeLessThan(100);
    expect(log.load).toBeGreaterThanOrEqual(0);
  });
});
