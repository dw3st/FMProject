import { describe, expect, test } from "bun:test";
import { applyEspn } from "@/../scripts/espn/apply";
import { fixtureSnapshot, fixtureWorld } from "@/../scripts/espn/fixtures";
import { MIN_BY_ROLE, MIN_SQUAD } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { RosterPlayer } from "@/types/playerTypes";

const allWeights = () => ({ passing: 1, vision: 1, finishing: 1, dribbling: 1, speed: 1, acceleration: 1, tackling: 1, pressing: 1, stamina: 1, heading: 1, strength: 1, reflex: 1, jump: 1 });
const overall = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;
const opts = {
  leagueMap: [{ slug: "premier_league", code: "eng.1" }, { slug: "of_championship", code: "eng.2" }],
  clubOverrides: { "380": "39" }, playerOverrides: {}, boundaries: {},
  roleWeights: allWeights, overall,
};

describe("applyEspn (fixture)", () => {
  const r = applyEspn(fixtureWorld(), fixtureSnapshot(), opts);
  const members = (slug: string) => r.world.leagues.find((l) => l.slug === slug)!.standings.map((s) => s.squadId);
  const squad = (id: string) => [...r.world.squads.values()].flat().find((s) => s.id === id)!;

  test("league membership follows ESPN", () => {
    expect(members("premier_league")).toEqual(["33", "47", "of_cov"]);
    expect(members("of_championship")).toEqual(["39", "es_999", "of_hull"]);
    expect(r.report.removedClubs).toEqual(["of_bir"]);
  });

  test("a matched player keeps his id, moves club and ages", () => {
    const utd = squad("33");
    const wolvesStriker = utd.players.find((p) => p.id === "39_p5")!;
    expect(wolvesStriker.squadId).toBe("33");
    expect(wolvesStriker.age).toBe(27);
    expect(squad("39").players.some((p) => p.id === "39_p5")).toBe(false);
    const gk = utd.players.find((p) => p.id === "33_p0")!;
    expect(gk.age).toBe(22);
    expect(Object.values(gk.stats).reduce((a, b) => a + b, 0)).toBeGreaterThan(13 * 6);
  });

  test("new player and new club", () => {
    expect(squad("33").players.some((p) => p.id === "es_a3" && p.positions[0] === "Midfielder")).toBe(true);
    const wrexham = squad("es_999");
    expect(wrexham.name).toBe("Wrexham");
    expect(wrexham.colors).toEqual(["#aa0000", "#ffffff"]);
    expect(wrexham.coach!.name).toBe("New Coach");
    expect(wrexham.finances!.budget).toBeGreaterThan(0);
    expect(wrexham.source).toBe("espn");
  });

  test("every squad meets the minimums and ids are unique", () => {
    const ids = new Set<string>();
    for (const s of [...r.world.squads.values()].flat()) {
      expect(s.players.length).toBeGreaterThanOrEqual(MIN_SQUAD);
      for (const line of ["GK", "Defender", "Midfielder", "Forward"] as const)
        expect(s.players.filter((p) => getMainRole(p.positions[0]!) === line).length).toBeGreaterThanOrEqual(MIN_BY_ROLE[line]);
      for (const p of s.players) { expect(ids.has(p.id)).toBe(false); ids.add(p.id); expect(p.squadId).toBe(s.id); }
    }
  });

  test("season, pyramid zones and schedules", () => {
    expect(r.world.leagues.every((l) => l.season === "2026-27")).toBe(true);
    const ch = r.world.leagues.find((l) => l.slug === "of_championship")!;
    expect(ch.zones!.find((z) => z.id === "prom")).toEqual({ id: "prom", label: "Promotion", color: "green", from: 1, to: 1 });
    expect(r.world.leagues.find((l) => l.slug === "premier_league")!.zones!.some((z) => z.id === "ucl")).toBe(true);
  });

  test("ESPN crests and native leagues are reported", () => {
    expect(r.espnLogoOf.get("es_999")).toBe("999.png");
    expect(r.nativeLeagueOf.get("39")).toBe("premier_league");
  });

  test("deterministic", () => {
    const again = applyEspn(fixtureWorld(), fixtureSnapshot(), opts);
    expect(JSON.stringify([...again.world.squads])).toBe(JSON.stringify([...r.world.squads]));
  });

  test("refuses a world that was already converted", () => {
    const w = fixtureWorld();
    w.leagues[0]!.season = "2026-27";
    expect(() => applyEspn(w, fixtureSnapshot(), opts)).toThrow(/already/);
  });
});
