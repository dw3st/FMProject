import { describe, expect, test } from "bun:test";
import {
  autoFillLineup,
  autoFillLineupWithFitness,
} from "@/Domain/lineupHelpers";
import type { FormationSlot } from "@/types/formationSlots";
import type { RosterPlayer } from "@/types/playerTypes";

function makeSeasonLog(
  overrides: Partial<NonNullable<RosterPlayer["seasonLog"]>> = {},
): NonNullable<RosterPlayer["seasonLog"]> {
  return {
    appearances: 0, goals: 0, assists: 0, shots: 0,
    passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0,
    avgRating: 0, recentRatings: [], trainingSessions: 0, fitness: 100, morale: 70,
    ...overrides,
  };
}

const HIGH_STATS = {
  passing: 9, vision: 9, finishing: 9, dribbling: 9,
  speed: 9, acceleration: 9, tackling: 9, pressing: 9,
  stamina: 9, heading: 9, strength: 9, reflex: 9, jump: 9,
};

function statsAt(value: number): RosterPlayer["stats"] {
  return Object.fromEntries(Object.keys(HIGH_STATS).map((k) => [k, value])) as unknown as RosterPlayer["stats"];
}

function makePlayer(
  overrides: Partial<RosterPlayer> & Pick<RosterPlayer, "id" | "name" | "positions">,
): RosterPlayer {
  return {
    age: 26,
    squadId: "s1",
    preferredFoot: "right",
    stats: statsAt(6),
    profile: { summary: "", archetype: "test" },
    seasonLog: makeSeasonLog(),
    ...overrides,
  };
}

// A realistic 4-3-3 shape, used only for the "nobody tired" whole-lineup check.
const fullSlots: FormationSlot[] = [
  { role: "GK", x: 50, y: 95 },
  { role: "CB", x: 30, y: 75 },
  { role: "CB", x: 70, y: 75 },
  { role: "LB", x: 10, y: 75 },
  { role: "RB", x: 90, y: 75 },
  { role: "CM", x: 30, y: 50 },
  { role: "CM", x: 50, y: 50 },
  { role: "CDM", x: 70, y: 50 },
  { role: "LW", x: 15, y: 20 },
  { role: "ST", x: 50, y: 10 },
  { role: "RW", x: 85, y: 20 },
];

describe("autoFillLineupWithFitness — whole lineup", () => {
  test("nobody tired → identical to autoFillLineup", () => {
    const players = fullSlots.map((s, i) =>
      makePlayer({ id: `starter-${i}`, name: `Starter ${i}`, positions: [s.role], stats: statsAt(5 + i * 0.1) }),
    );
    const plain = autoFillLineup(fullSlots, players);
    const withFitness = autoFillLineupWithFitness(fullSlots, players);
    expect(withFitness).toEqual(plain);
  });
});

// Single-slot fixtures below isolate the swap rule from `autoFillLineup`'s cross-role candidate
// pooling (a slot's first pass also considers any player of the same *main* role, e.g. any
// forward for an ST slot — irrelevant to what's being tested here, so we keep only one slot).
const stSlot: FormationSlot[] = [{ role: "ST", x: 50, y: 10 }];

describe("autoFillLineupWithFitness — swap rule", () => {
  test("badly tired starter (fitness 10) with an equivalent-stat bench player → bench player starts", () => {
    // BENCH_SWAP_RATIO is now > 1 (the bench player must be BETTER, not merely close) — a starter
    // needs to be quite drained before an equal-stat bench player clears the bar.
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 10 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineup(stSlot, squad)).toEqual(["starter"]); // sanity: plain fill still starts them

    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["bench"]);
  });

  test("moderately tired starter (fitness 60) with an equivalent-stat bench player → starter stays", () => {
    // The softened fatigue curve means a merely-tired (not drained) starter barely loses value, so
    // an equal-stat bench player no longer clears the > 1.0 swap bar at this fitness.
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 60 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["starter"]);
  });

  test("tired but clearly superior starter still plays over a much weaker bench player", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(9),
      seasonLog: makeSeasonLog({ fitness: 60 }),
    });
    const weakBench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(3),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, weakBench];

    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["starter"]);
  });

  test("starter fitness at the tired threshold (75) is never swapped out, even for an equal bench player", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 75 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["starter"]);
  });

  test("no eligible bench player for the slot leaves the tired starter in place", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 50 }),
    });
    const otherPositionBench = makePlayer({
      id: "bench-gk", name: "Bench GK", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, otherPositionBench];

    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["starter"]);
  });

  test("high accumulated load discounts the starter enough to tip a marginal bench swap that fitness alone would not", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(7),
      seasonLog: makeSeasonLog({ fitness: 50, load: 0 }),
    });
    const marginalBench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100, load: 0 }),
    });
    const squad = [starter, marginalBench];

    // At load 0 the bench player falls short of the swap bar.
    expect(autoFillLineupWithFitness(stSlot, squad)).toEqual(["starter"]);

    // At LOAD_HIGH the starter's value is discounted further (drainMultiplier), tipping the swap.
    const loadedStarter = { ...starter, seasonLog: makeSeasonLog({ fitness: 50, load: 220 }) };
    const loadedSquad = [loadedStarter, marginalBench];
    expect(autoFillLineupWithFitness(stSlot, loadedSquad)).toEqual(["bench"]);
  });
});

// GK slot has its own, much stricter swap gate — see `autoFillLineupWithFitness` doc comment.
const gkSlot: FormationSlot[] = [{ role: "GK", x: 50, y: 95 }];

describe("autoFillLineupWithFitness — GK exemption", () => {
  test("GK starter below the outfield threshold (65) but above the GK threshold (60) is never swapped", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 65 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineupWithFitness(gkSlot, squad)).toEqual(["starter"]);
  });

  test("GK starter below 60 with a bench GK also under the 85 fitness floor is never swapped", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 40 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 80 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineupWithFitness(gkSlot, squad)).toEqual(["starter"]);
  });

  test("GK starter below 60 with a bench GK at/above 85 fitness can be swapped", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 10 }),
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["GK"], stats: statsAt(6),
      seasonLog: makeSeasonLog({ fitness: 100 }),
    });
    const squad = [starter, bench];

    expect(autoFillLineupWithFitness(gkSlot, squad)).toEqual(["bench"]);
  });
});
