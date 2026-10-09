import { describe, expect, test } from "bun:test";
import { computeMatchSimulationLineups, resolveUserLineup, type MatchRegistration } from "@/Domain/advanceDay/matchSimulationLineups";
import { autoFillLineupWithFitness, replaceUnavailableStarters } from "@/Domain/lineupHelpers";
import { buildMatchEvent, buildQuickMatchEvent } from "@/Domain/advanceDay/matches";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import { mulberry32 } from "@/Domain/rng";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"];
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
const slots = getFormationSlots(formation as unknown as FormationShape, "attacking");
const DATE = "2027-03-01";

function squad(id: string, nat: (i: number) => string, starterLevel = 7): Squad {
  const mk = (pid: string, role: string, level: number, nationality: string): RosterPlayer => ({
    id: pid, name: `${id} ${pid}`, age: 25, squadId: id, preferredFoot: "right", positions: [role], nationality,
    stats: {
      passing: level, vision: level, finishing: level, dribbling: level, speed: level, acceleration: level,
      tackling: level, pressing: level, stamina: 7, heading: level, strength: level, reflex: level, jump: level,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  });
  const players = [
    ...ROLES.map((r, i) => mk(`${id}s${i}`, r, starterLevel, nat(i))),
    ...ROLES.map((r, i) => mk(`${id}b${i}`, r, 4, "Brazil")),
  ];
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

const regOf = (s: Squad, drop: string[] = [], rule = R.brazil!): MatchRegistration => ({
  ids: new Set(s.players.map((p) => p.id).filter((id) => !drop.includes(id))), rule, country: "Brazil",
});

describe("lineup helpers with registration", () => {
  test("an unregistered starter is swapped for the best registered bench player", () => {
    const s = squad("h", () => "Brazil");
    const lineup = s.players.slice(0, 11).map((p) => p.id);
    const registered = new Set(s.players.map((p) => p.id).filter((id) => id !== "hs9" && id !== "hb9"));
    const r = replaceUnavailableStarters(slots, lineup, s.players, DATE, registered);
    expect(r.replaced).toHaveLength(1);
    expect(r.replaced[0]!.reason).toBe("unregistered");
    expect(r.replaced[0]!.in).not.toBe("hb9");
    expect(registered.has(r.replaced[0]!.in)).toBe(true);
    // Without a set, nothing changes.
    expect(replaceUnavailableStarters(slots, lineup, s.players, DATE).replaced).toEqual([]);
  });
  test("auto-fill never picks an unregistered player", () => {
    const s = squad("h", () => "Brazil");
    const registered = new Set(s.players.map((p) => p.id).filter((id) => !id.startsWith("hs")));
    const xi = autoFillLineupWithFitness(slots, s.players, DATE, registered);
    expect(xi.every((id) => registered.has(id))).toBe(true);
  });
});

describe("resolveUserLineup with registration", () => {
  test("saved XI with an unregistered player → unregistered swap", () => {
    const s = squad("h", () => "Brazil");
    const saved = s.players.slice(0, 11).map((p) => p.id);
    const r = resolveUserLineup(s, formation, saved, DATE, undefined, regOf(s, ["hs3"]));
    expect(r.injuredReplaced.map((x) => x.reason)).toEqual(["unregistered"]);
    expect(r.lineup).not.toContain("hs3");
    expect(r.pool!.has("hs3")).toBe(false);
  });
  test("Brazil: 10 foreigners in the XI → one foreignLimit swap, ≤ 9 named", () => {
    const s = squad("h", (i) => (i < 10 ? "Argentina" : "Brazil"));
    const saved = s.players.slice(0, 11).map((p) => p.id);
    const r = resolveUserLineup(s, formation, saved, DATE, undefined, regOf(s));
    expect(r.injuredReplaced.filter((x) => x.reason === "foreignLimit")).toHaveLength(1);
    const foreign = [...r.pool!].filter((id) => s.players.find((p) => p.id === id)!.nationality !== "Brazil");
    expect(foreign.length).toBeLessThanOrEqual(9);
    expect(r.lineup.every((id) => r.pool!.has(id))).toBe(true);
  });
});

describe("match lineups with registration", () => {
  const fixture: Fixture = { id: "f1", date: DATE, home: "h", away: "a", competition: "brazil_serie_a", round: 1, played: false, result: null } as Fixture;
  test("AI × AI: both XIs inside the registered sets; no registration = as before", () => {
    const h = squad("h", () => "Brazil");
    const a = squad("a", () => "Brazil");
    const reg = { home: regOf(h, ["hs9", "hs5"]), away: regOf(a, ["as0"]) };
    const sim = computeMatchSimulationLineups(fixture, h, a, undefined, null, null, null, reg);
    expect(sim.homeLineup.every((id) => reg.home.ids.has(id))).toBe(true);
    expect(sim.awayLineup.every((id) => reg.away.ids.has(id))).toBe(true);
    expect(sim.pools.home!.has("hs9")).toBe(false);
    const plain = computeMatchSimulationLineups(fixture, h, a, undefined, null);
    expect(plain.pools).toEqual({});
    expect(plain.homeLineup).toContain("hs9");
  });
  test("engine and quickSim never field an unregistered player", () => {
    const h = squad("h", () => "Brazil");
    const a = squad("a", () => "Brazil");
    const drop = ["hs9", "hs5", "hb1", "hb2"];
    const reg = { home: regOf(h, drop), away: regOf(a) };
    const sim = computeMatchSimulationLineups(fixture, h, a, undefined, null, null, null, reg);
    const appsOf = (s: Squad, ids: string[]) => s.players.filter((p) => ids.includes(p.id)).map((p) => p.seasonLog?.appearances ?? 0);
    const quick = buildQuickMatchEvent(fixture, h, a, sim, mulberry32(3));
    expect(appsOf(quick.updatedHome, drop)).toEqual([0, 0, 0, 0]);
    expect(appsOf(quick.updatedHome, sim.homeLineup).every((n) => n === 1)).toBe(true);
    const full = buildMatchEvent(fixture, h, a, sim, mulberry32(4));
    expect(Object.keys(full.event.playerStats ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(full.event.playerStats ?? {}).some((id) => drop.includes(id))).toBe(false);
    expect(appsOf(full.updatedHome, drop)).toEqual([0, 0, 0, 0]);
  }, 60_000);
});
