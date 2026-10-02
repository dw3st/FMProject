import { describe, expect, test } from "bun:test";
import { resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
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
