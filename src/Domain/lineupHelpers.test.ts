import { describe, expect, test } from "bun:test";
import {
  autoFillLineup,
  autoFillLineupWithFitness,
  buildSlotAlignedLineup,
  replaceInjuredStarters,
  suggestRotation,
} from "@/Domain/lineupHelpers";
import { aptitudeFor, slotValue } from "@/Domain/positions/positionAptitude";
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

describe("injured players are never picked", () => {
  test("autoFillLineup skips an injured starter for a healthy bench player of the same slot", () => {
    const injured = makePlayer({
      id: "injured", name: "Injured", positions: ["ST"], stats: statsAt(9),
      injury: { severity: "medium", returnDate: "2027-04-10" },
    });
    const healthy = makePlayer({
      id: "healthy", name: "Healthy", positions: ["ST"], stats: statsAt(4),
    });
    const squad = [injured, healthy];

    expect(autoFillLineup(stSlot, squad, "2027-04-01")).toEqual(["healthy"]);
    // Without a date, injuries are not filtered (context-free comparisons keep old behaviour).
    expect(autoFillLineup(stSlot, squad)).toEqual(["injured"]);
  });

  test("autoFillLineup includes the player again once returnDate is reached", () => {
    const player = makePlayer({
      id: "p", name: "P", positions: ["ST"], stats: statsAt(6),
      injury: { severity: "light", returnDate: "2027-04-10" },
    });
    const squad = [player];

    expect(autoFillLineup(stSlot, squad, "2027-04-09")).toEqual([""]);
    expect(autoFillLineup(stSlot, squad, "2027-04-10")).toEqual(["p"]);
  });

  test("autoFillLineupWithFitness never selects an injured starter or bench player", () => {
    const injuredStarter = makePlayer({
      id: "injured-starter", name: "Injured Starter", positions: ["ST"], stats: statsAt(9),
      injury: { severity: "severe", returnDate: "2027-06-01" },
    });
    const injuredBench = makePlayer({
      id: "injured-bench", name: "Injured Bench", positions: ["ST"], stats: statsAt(8),
      injury: { severity: "light", returnDate: "2027-04-05" },
    });
    const healthyBench = makePlayer({
      id: "healthy-bench", name: "Healthy Bench", positions: ["ST"], stats: statsAt(5),
    });
    const squad = [injuredStarter, injuredBench, healthyBench];

    expect(autoFillLineupWithFitness(stSlot, squad, "2027-04-01")).toEqual(["healthy-bench"]);
  });

  test("replaceInjuredStarters swaps out a saved-lineup starter injured on the match date", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(7),
      injury: { severity: "medium", returnDate: "2027-05-01" },
    });
    const bench = makePlayer({
      id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(5),
    });
    const squad = [starter, bench];
    const savedLineup = ["starter"];

    const { lineup, replaced } = replaceInjuredStarters(stSlot, savedLineup, squad, "2027-04-15");
    expect(lineup).toEqual(["bench"]);
    expect(replaced).toEqual([{ out: "starter", in: "bench" }]);
  });

  test("replaceInjuredStarters leaves a healthy saved lineup untouched", () => {
    const starter = makePlayer({ id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(7) });
    const bench = makePlayer({ id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(5) });
    const squad = [starter, bench];
    const savedLineup = ["starter"];

    const { lineup, replaced } = replaceInjuredStarters(stSlot, savedLineup, squad, "2027-04-15");
    expect(lineup).toEqual(["starter"]);
    expect(replaced).toEqual([]);
  });

  test("replaceInjuredStarters becomes eligible again exactly on returnDate", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(7),
      injury: { severity: "light", returnDate: "2027-04-10" },
    });
    const bench = makePlayer({ id: "bench", name: "Bench", positions: ["ST"], stats: statsAt(5) });
    const squad = [starter, bench];
    const savedLineup = ["starter"];

    expect(replaceInjuredStarters(stSlot, savedLineup, squad, "2027-04-09").lineup).toEqual(["bench"]);
    expect(replaceInjuredStarters(stSlot, savedLineup, squad, "2027-04-10").lineup).toEqual(["starter"]);
  });

  test("replaceInjuredStarters leaves the injured player in place when no eligible replacement exists", () => {
    const starter = makePlayer({
      id: "starter", name: "Starter", positions: ["ST"], stats: statsAt(7),
      injury: { severity: "severe", returnDate: "2027-06-01" },
    });
    const squad = [starter];
    const savedLineup = ["starter"];

    const { lineup, replaced } = replaceInjuredStarters(stSlot, savedLineup, squad, "2027-04-15");
    expect(lineup).toEqual(["starter"]);
    expect(replaced).toEqual([]);
  });

  test("buildSlotAlignedLineup + replaceInjuredStarters round-trip: full saved lineup, one injured", () => {
    const players = fullSlots.map((s, i) =>
      makePlayer({ id: `starter-${i}`, name: `Starter ${i}`, positions: [s.role], stats: statsAt(6) }),
    );
    // Injure the ST (index 9).
    players[9] = { ...players[9]!, injury: { severity: "medium", returnDate: "2027-05-01" } };
    const benchForward = makePlayer({ id: "bench-fwd", name: "Bench Fwd", positions: ["ST"], stats: statsAt(4) });
    const squad = [...players, benchForward];
    const saved = players.map((p) => p.id);

    const aligned = buildSlotAlignedLineup(squad, saved).map((p) => p?.id ?? "");
    const { lineup, replaced } = replaceInjuredStarters(fullSlots, aligned, squad, "2027-04-15");

    expect(lineup[9]).toBe("bench-fwd");
    expect(replaced).toEqual([{ out: "starter-9", in: "bench-fwd" }]);
    // Every other slot is untouched.
    for (let i = 0; i < fullSlots.length; i++) {
      if (i === 9) continue;
      expect(lineup[i]).toBe(aligned[i]);
    }
  });
});

describe("suggestRotation", () => {
  const tired = (id: string, pos = "ST") =>
    makePlayer({ id, name: id, positions: [pos], seasonLog: makeSeasonLog({ fitness: 10 }) });
  const fresh = (id: string, pos = "ST", extra: Partial<RosterPlayer> = {}) =>
    makePlayer({ id, name: id, positions: [pos], seasonLog: makeSeasonLog({ fitness: 100 }), ...extra });

  test("tired starter is swapped for a fresh bench player", () => {
    expect(suggestRotation(stSlot, ["s"], [tired("s"), fresh("b")])).toEqual([{ out: "s", in: "b" }]);
  });

  test("GK exempt above 60 and without a bench keeper at 85+", () => {
    const mid = makePlayer({ id: "g", name: "g", positions: ["GK"], seasonLog: makeSeasonLog({ fitness: 65 }) });
    expect(suggestRotation(gkSlot, ["g"], [mid, fresh("gb", "GK")])).toEqual([]);
    const low = makePlayer({ id: "g", name: "g", positions: ["GK"], seasonLog: makeSeasonLog({ fitness: 40 }) });
    const weakBench = makePlayer({ id: "gb", name: "gb", positions: ["GK"], seasonLog: makeSeasonLog({ fitness: 80 }) });
    expect(suggestRotation(gkSlot, ["g"], [low, weakBench])).toEqual([]);
  });

  test("no clearly better bench player gives empty", () => {
    const s = makePlayer({ id: "s", name: "s", positions: ["ST"], stats: statsAt(9), seasonLog: makeSeasonLog({ fitness: 70 }) });
    const b = fresh("b", "ST", { stats: statsAt(5) });
    expect(suggestRotation(stSlot, ["s"], [s, b])).toEqual([]);
  });

  test("injured bench player never comes in", () => {
    const inj = fresh("b", "ST", { injury: { severity: "medium", returnDate: "2027-05-01" } });
    expect(suggestRotation(stSlot, ["s"], [tired("s"), inj], "2027-04-01")).toEqual([]);
  });

  test("a bench player is used only once", () => {
    const slots: FormationSlot[] = [
      { role: "ST", x: 40, y: 10 },
      { role: "ST", x: 60, y: 10 },
    ];
    const swaps = suggestRotation(slots, ["s1", "s2"], [tired("s1"), tired("s2"), fresh("b")]);
    expect(swaps).toEqual([{ out: "s1", in: "b" }]);
  });
});

describe("autoFillLineup — scarcest slot first", () => {
  test("a left-footed full-back is kept for LB instead of being used at CB", () => {
    const base = { passing: 5, vision: 5, finishing: 2, stamina: 6, reflex: 0, jump: 0 };
    const fullBack = makePlayer({
      id: "fb", name: "Left Back", positions: ["Defender"], preferredFoot: "left",
      stats: { ...base, tackling: 9, heading: 8, strength: 8, pressing: 8, speed: 9, acceleration: 9, dribbling: 8 } as unknown as RosterPlayer["stats"],
    });
    const centreBack = makePlayer({
      id: "cb", name: "Centre Back", positions: ["Defender"], preferredFoot: "right",
      stats: { ...base, tackling: 7, heading: 8, strength: 8, pressing: 7, speed: 2, acceleration: 2, dribbling: 2 } as unknown as RosterPlayer["stats"],
    });
    expect(["natural", "apt"]).toContain(aptitudeFor(fullBack, "LB"));
    expect(aptitudeFor(centreBack, "CB")).toBe("natural");
    expect(["training", "unsuitable"]).toContain(aptitudeFor(centreBack, "LB"));
    // Premise: ranked slot by slot, the full-back would out-value the natural CB at CB.
    expect(slotValue(fullBack, "CB")).toBeGreaterThan(slotValue(centreBack, "CB"));

    const slots: FormationSlot[] = [
      { role: "CB", x: 50, y: 75 },
      { role: "LB", x: 10, y: 75 },
    ];
    expect(autoFillLineup(slots, [fullBack, centreBack])).toEqual(["cb", "fb"]);
  });
});
