import { describe, expect, test } from "bun:test";
import { computeMatchSimulationLineups, computeSeatedMatchLineups, resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import { axesFor, type TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { TacticLogEntry } from "@/types/studyTypes";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { getFormationSlots } from "@/types/formationSlots";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"];

function squadOf11(): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    age: 25,
    squadId: "s",
    preferredFoot: "right",
    positions: [role],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 7, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id: "s", name: "s", colors: ["#000", "#fff"], money: 0, players };
}

describe("resolveUserLineup", () => {
  const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const slots = getFormationSlots(formation as unknown as Parameters<typeof getFormationSlots>[0], "attacking");

  test("empty saved lineup falls back to the same fitness-aware auto-fill the AI uses", () => {
    const squad = squadOf11();
    const { lineup, injuredReplaced } = resolveUserLineup(squad, formation, []);
    expect(lineup).toEqual(autoFillLineupWithFitness(slots, squad.players));
    expect(lineup).toHaveLength(11);
    expect(lineup.every((id) => id !== "")).toBe(true);
    expect(injuredReplaced).toEqual([]);
  });

  test("a full saved lineup is used as-is (aligned by slot)", () => {
    const squad = squadOf11();
    const saved = squad.players.map((p) => p.id);
    const { lineup, injuredReplaced } = resolveUserLineup(squad, formation, saved);
    expect(lineup).toEqual(saved);
    expect(injuredReplaced).toEqual([]);
  });

  test("a corrupted (non-empty, wrong-length) saved lineup still resolves to 11 ids", () => {
    const squad = squadOf11();
    const { lineup } = resolveUserLineup(squad, formation, ["p0", "p1"]);
    expect(lineup).toHaveLength(11);
    expect(new Set(lineup).size).toBe(11);
  });

  test("a player injured on the match date is excluded from an empty-lineup auto-fill, and eligible again on returnDate", () => {
    const squad = squadOf11();
    // p9 is the ST slot.
    squad.players = squad.players.map((p) =>
      p.id === "p9" ? { ...p, injury: { severity: "light" as const, returnDate: "2027-04-10" } } : p,
    );
    // Add a bench ST so the slot can still be filled.
    squad.players = [
      ...squad.players,
      { ...squadOf11().players[9]!, id: "bench-st", name: "Bench ST" },
    ];

    const before = resolveUserLineup(squad, formation, [], "2027-04-05");
    expect(before.lineup).not.toContain("p9");
    expect(before.lineup).toContain("bench-st");

    const onReturn = resolveUserLineup(squad, formation, [], "2027-04-10");
    expect(onReturn.lineup).toContain("p9");
  });

  test("a saved lineup with an injured starter is auto-replaced for the match, and reported in injuredReplaced", () => {
    const squad = squadOf11();
    squad.players = squad.players.map((p) =>
      p.id === "p9" ? { ...p, injury: { severity: "medium" as const, returnDate: "2027-04-10" } } : p,
    );
    squad.players = [
      ...squad.players,
      { ...squadOf11().players[9]!, id: "bench-st", name: "Bench ST" },
    ];
    const saved = squadOf11().players.map((p) => p.id); // includes "p9"

    const before = resolveUserLineup(squad, formation, saved, "2027-04-05");
    expect(before.lineup).not.toContain("p9");
    expect(before.lineup).toContain("bench-st");
    expect(before.injuredReplaced).toEqual([{ out: "p9", in: "bench-st", reason: "injured" }]);

    // On returnDate, the saved lineup plays as originally saved — no replacement needed.
    const onReturn = resolveUserLineup(squad, formation, saved, "2027-04-10");
    expect(onReturn.lineup).toContain("p9");
    expect(onReturn.injuredReplaced).toEqual([]);
  });
});

describe("resolveUserLineup — rotation", () => {
  const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const DATE = "2027-04-05";

  function tiredSquad(): { squad: Squad; saved: string[] } {
    const squad = squadOf11();
    squad.players = squad.players.map((p) =>
      p.id === "p9" ? { ...p, seasonLog: { ...emptySeasonLog(), fitness: 10 } } : p,
    );
    squad.players.push({
      ...squadOf11().players[9]!, id: "bench-st", name: "Bench ST",
      seasonLog: { ...emptySeasonLog(), fitness: 100 },
    });
    return { squad, saved: squadOf11().players.map((p) => p.id) };
  }

  test("default: suggested but not applied", () => {
    const { squad, saved } = tiredSquad();
    const r = resolveUserLineup(squad, formation, saved, DATE);
    expect(r.lineup).toEqual(saved);
    expect(r.rotationSuggestion).toEqual([{ out: "p9", in: "bench-st" }]);
    expect(r.rotationApplied).toEqual([]);
  });

  test("assistant on: applied automatically", () => {
    const { squad, saved } = tiredSquad();
    const r = resolveUserLineup(squad, formation, saved, DATE, { assistantRotation: true });
    expect(r.lineup).toContain("bench-st");
    expect(r.lineup).not.toContain("p9");
    expect(r.rotationApplied).toEqual([{ out: "p9", in: "bench-st" }]);
    expect(r.rotationSuggestion).toEqual([]);
  });

  test("override applies only on its date", () => {
    const { squad, saved } = tiredSquad();
    const override = { date: DATE, swaps: [{ out: "p9", in: "bench-st" }] };
    expect(resolveUserLineup(squad, formation, saved, DATE, { override }).lineup).toContain("bench-st");
    const other = resolveUserLineup(squad, formation, saved, "2027-04-06", { override });
    expect(other.lineup).toEqual(saved);
  });

  test("optOut undoes the assistant for that date", () => {
    const { squad, saved } = tiredSquad();
    const override = { date: DATE, swaps: [], optOut: true };
    const r = resolveUserLineup(squad, formation, saved, DATE, { assistantRotation: true, override });
    expect(r.lineup).toEqual(saved);
    expect(r.rotationApplied).toEqual([]);
  });
});

describe("AI study plan (`.claude/rules/game/study.md`)", () => {
  const fixture = { id: "f1", date: "2027-03-20", home: "h", away: "a", competition: "l", round: 1, played: false } as unknown as Fixture;
  const club = (id: string): Squad => {
    const s = squadOf11();
    return { ...s, id, name: id, players: s.players.map((p) => ({ ...p, id: `${id}-${p.id}`, squadId: id })) };
  };
  const log: TacticLogEntry[] = Array.from({ length: 5 }, (_, i) => ({
    date: `2027-03-0${i + 1}`, fixtureId: `g${i}`, formation: "4-3-3", style: "high_press" as const, axes: axesFor("high_press"),
  }));
  const tactics: TacticsSave = { formation: "4-3-3", tactical_style: "high_press", lineup: [] };

  test("AI against AI is unchanged, with or without a log", () => {
    const base = computeMatchSimulationLineups(fixture, club("h"), club("a"), undefined, null);
    const withLog = computeMatchSimulationLineups(fixture, club("h"), club("a"), undefined, null, null, null, undefined, log);
    expect(withLog).toEqual(base);
    expect(base.study).toBeUndefined();
    expect(base.tactics.A).toEqual({ style: "balanced", familiarity: aiFamiliarity("balanced") });
    expect(base.tactics.B).toEqual(base.tactics.A);
  });

  test("human against AI without a log: the AI plays balanced as before", () => {
    const sim = computeMatchSimulationLineups(fixture, club("h"), club("a"), "h", tactics);
    expect(sim.tactics.B).toEqual({ style: "balanced", familiarity: aiFamiliarity("balanced") });
    expect(sim.study).toBeUndefined();
  });

  test("human against AI with a high read: the AI gets the counter style and a man-mark", () => {
    const sim = computeMatchSimulationLineups(fixture, club("h"), club("a"), "h", tactics, null, null, undefined, log);
    expect(sim.tactics.B.style).toBe("counter_attack");
    expect(sim.tactics.B.familiarity).toEqual(aiFamiliarity("counter_attack"));
    expect(sim.tactics.B.study).toEqual({ level: "high", style: "counter_attack" });
    expect(sim.tactics.B.manMarks).toHaveLength(1);
    const mark = sim.tactics.B.manMarks![0]!;
    expect(sim.homeLineup).toContain(mark.targetRosterId!);
    expect(sim.study).toEqual({ side: "away", level: "high", style: "counter_attack", marked: expect.any(String) });
    // The human side is untouched.
    expect(sim.tactics.A.style).toBe("high_press");
    expect(sim.tactics.A.manMarks).toBeUndefined();
  });

  test("the human away: the plan is the home side's", () => {
    const sim = computeMatchSimulationLineups(fixture, club("h"), club("a"), "a", tactics, null, null, undefined, log.slice(0, 3));
    expect(sim.tactics.A.style).toBe("counter_attack");
    expect(sim.tactics.A.manMarks).toBeUndefined();
    expect(sim.study).toEqual({ side: "home", level: "medium", style: "counter_attack" });
  });

  test("two seats: nobody reads the other's log", () => {
    const side = { tactics, tacticLog: log };
    const sim = computeSeatedMatchLineups(fixture, club("h"), club("a"), { home: side, away: side });
    expect(sim.study).toBeUndefined();
    expect(sim.tactics.A.style).toBe("high_press");
    expect(sim.tactics.B.style).toBe("high_press");
    expect(sim.tactics.A.manMarks).toBeUndefined();
    expect(sim.tactics.B.manMarks).toBeUndefined();
    // One seat: its log reaches the AI side.
    expect(computeSeatedMatchLineups(fixture, club("h"), club("a"), { home: side }).study?.side).toBe("away");
  });
});
