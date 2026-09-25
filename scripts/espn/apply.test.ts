import { describe, expect, test } from "bun:test";
import { applyEspn, type World } from "@/../scripts/espn/apply";
import { buildAthlete, buildPlayer, buildSquad, buildTeam, fixtureSnapshot, fixtureWorld } from "@/../scripts/espn/fixtures";
import type { EspnSnapshot } from "@/../scripts/espn/types";
import { MIN_BY_ROLE, MIN_SQUAD } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { RosterPlayer } from "@/types/playerTypes";
import type { SquadFile } from "@/../scripts/world/types";

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

  test("a club demoted/promoted across pyramid tiers has broadcasting/commercial rescaled by the tier ratio", () => {
    // Wolves ("39") is demoted premier_league (tier 1) → of_championship (tier 2) via clubOverrides;
    // Coventry ("of_cov") is promoted the other way — both are genuine `lineup.moves` entries.
    expect(r.report.movedClubs).toContainEqual({ squadId: "39", from: "premier_league", to: "of_championship" });
    expect(r.report.movedClubs).toContainEqual({ squadId: "of_cov", from: "of_championship", to: "premier_league" });
    const wolves = squad("39");
    expect(wolves.finances!.broadcasting).toBe(1750000); // 5,000,000 × (0.35 / 1)
    expect(wolves.finances!.commercial).toBe(1750000);
    expect(wolves.finances!.total).toBe(3500000);
    const cov = squad("of_cov");
    expect(cov.finances!.broadcasting).toBe(11428571); // 4,000,000 × (1 / 0.35), rounded
    expect(cov.finances!.commercial).toBe(11428571);
    expect(cov.finances!.total).toBe(cov.finances!.broadcasting + cov.finances!.commercial);
  });

  test("a club that keeps its tier keeps its finances untouched", () => {
    expect(squad("33").finances!.broadcasting).toBe(6000000); // unchanged — stays in premier_league
    expect(squad("of_hull").finances!.broadcasting).toBe(4000000); // unchanged — stays in of_championship
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

  test("reports overallByAgeMatched, typicalGap and the age gap histogram", () => {
    expect(r.report.overallByAgeMatched.length).toBe(5);
    expect(r.report.overallByAgeMatched.some((b) => b.after > 0)).toBe(true);
    expect(r.report.typicalGap).toBe(2);
    expect(r.report.ageGapHistogram[2]).toBeGreaterThan(0);
    expect(r.report.playersRemoved.trimmed).toBeGreaterThanOrEqual(0);
    expect(r.report.duplicateAthletes).toEqual([]);
  });
});

describe("applyEspn — ages the world consistently even outside ESPN's coverage", () => {
  test("a league ESPN doesn't cover still advances in time, and cross-club poaching still works", () => {
    // Same fixture as above, but the leagueMap only covers premier_league — of_championship (and
    // whatever drops into it) must still age by the same typicalGap so the whole world advances
    // in time consistently, not just the ESPN-covered leagues.
    const restrictedOpts = { ...opts, leagueMap: [opts.leagueMap[0]!] };
    const r2 = applyEspn(fixtureWorld(), fixtureSnapshot(), restrictedOpts);
    const squads = [...r2.world.squads.values()].flat();
    const wolves = squads.find((s) => s.id === "39")!;
    const untouched = wolves.players.find((p) => p.id === "39_p0")!;
    expect(untouched.age).toBe(22); // 20 + typicalGap(2) — Wolves is now a non-covered leftover club
    expect(wolves.players.some((p) => p.id === "39_p5")).toBe(false); // still poached to Man Utd
    const utd = squads.find((s) => s.id === "33")!;
    expect(utd.players.some((p) => p.id === "39_p5")).toBe(true);
    expect(r2.report.typicalGap).toBe(2);
  });
});

describe("applyEspn — duplicate ESPN athletes", () => {
  test("an athlete listed at a club and its reserve side is deduped to the first team", () => {
    const world: World = {
      leagues: [{ slug: "test_league", name: "Test League", country: "Testland", season: "2024-25", standings: [
        { squadId: "clubA", slug: "clubA", name: "Club Alpha", colors: ["#111111", "#ffffff"], country: "Testland" },
        { squadId: "clubA_res", slug: "clubA_res", name: "Club Alpha II", colors: ["#111111", "#ffffff"], country: "Testland" },
      ] }],
      squads: new Map([["test_league", [
        { id: "clubA", slug: "clubA", name: "Club Alpha", colors: ["#111111", "#ffffff"], country: "Testland",
          venue: { name: "Alpha Park", city: null, capacity: 10000, surface: "grass" }, coach: { id: 1, name: "Coach" },
          finances: { broadcasting: 1e6, commercial: 1e6, total: 2e6, budget: 1e6, followers: 1e5 },
          players: [{ id: "clubA_gk", name: "Club Alpha Keeper", age: 24, squadId: "clubA", preferredFoot: "right", positions: ["GK"], stats: { passing: 4, vision: 4, finishing: 4, dribbling: 4, speed: 4, acceleration: 4, tackling: 4, pressing: 4, stamina: 4, heading: 4, strength: 4, reflex: 4, jump: 4 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" }] },
        { id: "clubA_res", slug: "clubA_res", name: "Club Alpha II", colors: ["#111111", "#ffffff"], country: "Testland",
          venue: { name: "Alpha Res Park", city: null, capacity: 3000, surface: "grass" }, coach: { id: 1, name: "Coach" },
          finances: { broadcasting: 2e5, commercial: 2e5, total: 4e5, budget: 2e5, followers: 2e4 },
          players: [
            { id: "clubA_res_gk", name: "Club Alpha II Keeper", age: 20, squadId: "clubA_res", preferredFoot: "right", positions: ["GK"], stats: { passing: 2, vision: 2, finishing: 2, dribbling: 2, speed: 2, acceleration: 2, tackling: 2, pressing: 2, stamina: 2, heading: 2, strength: 2, reflex: 2, jump: 2 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            // Role diversity so the global fallback in estimate.ts (used to pad youth) always has a line to fall back to.
            { id: "clubA_res_def", name: "Club Alpha II Back", age: 21, squadId: "clubA_res", preferredFoot: "right", positions: ["Defender"], stats: { passing: 2, vision: 2, finishing: 2, dribbling: 2, speed: 2, acceleration: 2, tackling: 2, pressing: 2, stamina: 2, heading: 2, strength: 2, reflex: 2, jump: 2 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            { id: "clubA_res_mid", name: "Club Alpha II Mid", age: 22, squadId: "clubA_res", preferredFoot: "right", positions: ["Midfielder"], stats: { passing: 2, vision: 2, finishing: 2, dribbling: 2, speed: 2, acceleration: 2, tackling: 2, pressing: 2, stamina: 2, heading: 2, strength: 2, reflex: 2, jump: 2 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            { id: "clubA_res_fwd", name: "Club Alpha II Fwd", age: 23, squadId: "clubA_res", preferredFoot: "right", positions: ["Forward"], stats: { passing: 2, vision: 2, finishing: 2, dribbling: 2, speed: 2, acceleration: 2, tackling: 2, pressing: 2, stamina: 2, heading: 2, strength: 2, reflex: 2, jump: 2 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
          ] },
      ]]]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "test_league", code: "tst.1", name: "Test League", season: "2026-27", teams: [
        buildTeam("E1", "Club Alpha", [buildAthlete("dup1", "Loan Star", 24, "F", "Testland")]),
        buildTeam("E2", "Club Alpha II", [buildAthlete("dup1", "Loan Star", 24, "F", "Testland")]),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "test_league", code: "tst.1" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r3 = applyEspn(world, snap, testOpts);

    expect(r3.report.duplicateAthletes).toEqual([{ athleteId: "dup1", keptTeam: "Club Alpha", droppedTeam: "Club Alpha II" }]);
    const squads = [...r3.world.squads.values()].flat();
    const clubA = squads.find((s) => s.id === "clubA")!;
    const clubARes = squads.find((s) => s.id === "clubA_res")!;
    expect(clubA.players.some((p) => p.id === "es_dup1")).toBe(true);
    expect(clubARes.players.some((p) => p.id === "es_dup1")).toBe(false);
  });
});

describe("applyEspn — suspect new clubs and fuzzy club matches", () => {
  test("a new club that mostly poached a removed club's roster is flagged, and a prefix match is reported as fuzzy", () => {
    const world: World = {
      leagues: [{ slug: "prem_test", name: "Premier Test", country: "Russia", season: "2024-25", standings: [
        { squadId: "zen1", slug: "zen1", name: "Zenit", colors: ["#111111", "#ffffff"], country: "Russia" },
        { squadId: "spartak1", slug: "spartak1", name: "Spartak Moscow", colors: ["#111111", "#ffffff"], country: "Russia" },
      ] }],
      squads: new Map([["prem_test", [
        { id: "zen1", slug: "zen1", name: "Zenit", colors: ["#111111", "#ffffff"], country: "Russia",
          venue: { name: "Zenit Park", city: null, capacity: 30000, surface: "grass" }, coach: { id: 1, name: "Coach" },
          finances: { broadcasting: 6e6, commercial: 6e6, total: 12e6, budget: 6e6, followers: 6e5 },
          players: [
            { id: "zen1_gk", name: "Zenit Keeper", age: 24, squadId: "zen1", preferredFoot: "right", positions: ["GK"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Russia" },
            { id: "zen1_st", name: "Zenit Striker", age: 26, squadId: "zen1", preferredFoot: "right", positions: ["Forward"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Russia" },
            // Also matched below (poached to es_T_new too), so the world keeps GK/DEF/MID/FWD
            // diversity among MATCHED players — estimate.ts's worldBase fallback only looks at
            // matched players once at least one match exists anywhere.
            { id: "zen1_def", name: "Zenit Back", age: 25, squadId: "zen1", preferredFoot: "right", positions: ["Defender"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Russia" },
            { id: "zen1_mid", name: "Zenit Mid", age: 27, squadId: "zen1", preferredFoot: "right", positions: ["Midfielder"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Russia" },
          ] },
        { id: "spartak1", slug: "spartak1", name: "Spartak Moscow", colors: ["#111111", "#ffffff"], country: "Russia",
          venue: { name: "Spartak Park", city: null, capacity: 25000, surface: "grass" }, coach: { id: 1, name: "Coach" },
          finances: { broadcasting: 5e6, commercial: 5e6, total: 10e6, budget: 5e6, followers: 5e5 },
          players: [{ id: "spartak1_gk", name: "Spartak Keeper", age: 25, squadId: "spartak1", preferredFoot: "right", positions: ["GK"], stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 }, profile: { archetype: "x", summary: "x" }, nationality: "Russia" }] },
      ]]]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "prem_test", code: "rus.1", name: "Premier Test", season: "2026-27", teams: [
        buildTeam("T_new", "St Petersburg FC", [
          buildAthlete("zp1", "Zenit Keeper", 26, "G", "Russia"),
          buildAthlete("zp2", "Zenit Striker", 28, "F", "Russia"),
          buildAthlete("zp3", "Zenit Back", 27, "D", "Russia"),
          buildAthlete("zp4", "Zenit Mid", 29, "M", "Russia"),
        ], { location: "St Petersburg" }),
        buildTeam("T_spartak", "Spartak", [], { location: "Moscow" }),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "prem_test", code: "rus.1" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r4 = applyEspn(world, snap, testOpts);

    expect(r4.report.suspectNewClubs).toEqual([
      { newId: "es_T_new", espnName: "St Petersburg FC", league: "prem_test", fromSquadId: "zen1", fromName: "Zenit", share: 1 },
    ]);
    expect(r4.report.fuzzyClubs).toEqual([
      { espnId: "T_spartak", espnName: "Spartak", squadId: "spartak1", worldName: "Spartak Moscow", league: "prem_test", via: "prefix" },
    ]);
    // Spartak's original keeper was never listed by ESPN under Spartak → unmatched in a covered club.
    expect(r4.report.playersRemoved.unmatchedInCoveredClubs).toBe(1);
    // Zenit's whole original roster (4 players) belonged to a club removed from the world this run.
    expect(r4.report.playersRemoved.inRemovedClubs).toBe(4);
  });

  test("a new club with no peers in its own league falls back to the country median, never zero", () => {
    const world: World = {
      leagues: [
        { slug: "top_test", name: "Top Test", country: "Testland", season: "2024-25", standings: [
          { squadId: "big1", slug: "big1", name: "Big One", colors: ["#111111", "#ffffff"], country: "Testland" },
        ] },
        { slug: "second_test", name: "Second Test", country: "Testland", season: "2024-25", standings: [] },
      ],
      squads: new Map([
        ["top_test", [{ id: "big1", slug: "big1", name: "Big One", colors: ["#111111", "#ffffff"], country: "Testland",
          venue: { name: "Big Park", city: null, capacity: 40000, surface: "grass" }, coach: { id: 1, name: "Coach" },
          finances: { broadcasting: 8e6, commercial: 8e6, total: 16e6, budget: 8e6, followers: 8e5 },
          players: [
            { id: "big1_gk", name: "Big One Keeper", age: 24, squadId: "big1", preferredFoot: "right", positions: ["GK"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            { id: "big1_def", name: "Big One Back", age: 25, squadId: "big1", preferredFoot: "right", positions: ["Defender"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            { id: "big1_mid", name: "Big One Mid", age: 26, squadId: "big1", preferredFoot: "right", positions: ["Midfielder"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
            { id: "big1_fwd", name: "Big One Fwd", age: 27, squadId: "big1", preferredFoot: "right", positions: ["Forward"], stats: { passing: 6, vision: 6, finishing: 6, dribbling: 6, speed: 6, acceleration: 6, tackling: 6, pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 6, jump: 6 }, profile: { archetype: "x", summary: "x" }, nationality: "Testland" },
          ] }]],
        ["second_test", []],
      ]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [
        { slug: "top_test", code: "tst.1", name: "Top Test", season: "2026-27", teams: [buildTeam("B1", "Big One", [])] },
        { slug: "second_test", code: "tst.2", name: "Second Test", season: "2026-27", teams: [buildTeam("N1", "Brand New FC", [], { location: "Newtown" })] },
      ],
    };
    const testOpts = { leagueMap: [{ slug: "top_test", code: "tst.1" }, { slug: "second_test", code: "tst.2" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r5 = applyEspn(world, snap, testOpts);

    const newClub = [...r5.world.squads.values()].flat().find((s) => s.id === "es_N1")!;
    expect(newClub.finances!.budget).toBe(8e6); // falls back to the country median (Big One), not 0
    expect(newClub.venue!.capacity).toBe(40000);
  });
});

const mkSquad = (id: string, name: string, country: string, players: RosterPlayer[]): SquadFile => ({
  id, slug: id, name, colors: ["#111111", "#ffffff"], country,
  venue: { name: `${name} Park`, city: null, capacity: 10000, surface: "grass" }, coach: { id: 1, name: "Coach" },
  finances: { broadcasting: 1e6, commercial: 1e6, total: 2e6, budget: 1e6, followers: 1e5 },
  players,
});

describe("applyEspn — suspectNewClubs needs at least MIN_SUSPECT_MATCHED players", () => {
  test("2/2 poached players from a removed club is not enough to flag; 3/4 is", () => {
    const world: World = {
      leagues: [{ slug: "test3_league", name: "Test3 League", country: "Testland3", season: "2024-25", standings: [
        { squadId: "src2", slug: "src2", name: "Alpha Club", colors: ["#111111", "#ffffff"], country: "Testland3" },
        { squadId: "src4", slug: "src4", name: "Beta Club", colors: ["#111111", "#ffffff"], country: "Testland3" },
        { squadId: "srcOther", slug: "srcOther", name: "Gamma Club", colors: ["#111111", "#ffffff"], country: "Testland3" },
      ] }],
      squads: new Map([["test3_league", [
        mkSquad("src2", "Alpha Club", "Testland3", [
          buildPlayer("src2_gk", "Alpha Keeper", 24, "GK", "src2", 5, "Testland3"),
          buildPlayer("src2_fw", "Alpha Striker", 24, "Forward", "src2", 5, "Testland3"),
        ]),
        mkSquad("src4", "Beta Club", "Testland3", [
          buildPlayer("src4_gk", "Beta Keeper", 24, "GK", "src4", 5, "Testland3"),
          buildPlayer("src4_def", "Beta Back", 24, "Defender", "src4", 5, "Testland3"),
          buildPlayer("src4_mid", "Beta Mid", 24, "Midfielder", "src4", 5, "Testland3"),
          buildPlayer("src4_fw", "Beta Front", 24, "Forward", "src4", 5, "Testland3"),
        ]),
        mkSquad("srcOther", "Gamma Club", "Testland3", [
          buildPlayer("other_mid", "Gamma Mid", 24, "Midfielder", "srcOther", 5, "Testland3"),
        ]),
      ]]]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "test3_league", code: "t3.1", name: "Test3 League", season: "2026-27", teams: [
        buildTeam("New2FC", "Brand New Two FC", [
          buildAthlete("a1", "Alpha Keeper", 26, "G", "Testland3"),
          buildAthlete("a2", "Alpha Striker", 26, "F", "Testland3"),
        ]),
        buildTeam("New4FC", "Brand New Four FC", [
          buildAthlete("a3", "Beta Keeper", 26, "G", "Testland3"),
          buildAthlete("a4", "Beta Back", 26, "D", "Testland3"),
          buildAthlete("a5", "Beta Mid", 26, "M", "Testland3"),
          buildAthlete("a6", "Gamma Mid", 26, "M", "Testland3"),
        ]),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "test3_league", code: "t3.1" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r6 = applyEspn(world, snap, testOpts);

    // src2, src4 and srcOther all leave the (single-tier) world this run.
    expect(r6.report.removedClubs).toEqual(["src2", "src4", "srcOther"]);
    const suspectIds = r6.report.suspectNewClubs.map((s) => s.newId);
    expect(suspectIds).not.toContain("es_New2FC"); // 2/2 matched — below MIN_SUSPECT_MATCHED
    expect(suspectIds).toContain("es_New4FC"); // 3/4 matched — meets both thresholds
    const four = r6.report.suspectNewClubs.find((s) => s.newId === "es_New4FC")!;
    expect(four.fromSquadId).toBe("src4");
    expect(four.share).toBe(0.75);
  });
});

describe("applyEspn — reserve-team detection requires the stripped name to exist as another team", () => {
  test("\"Real Sociedad II\" is a reserve side because \"Real Sociedad\" is also a team", () => {
    const world: World = {
      leagues: [{ slug: "resv_league", name: "Resv League", country: "Spainland", season: "2024-25", standings: [
        { squadId: "rs1", slug: "rs1", name: "Real Sociedad", colors: ["#111111", "#ffffff"], country: "Spainland" },
        { squadId: "rs2", slug: "rs2", name: "Real Sociedad II", colors: ["#111111", "#ffffff"], country: "Spainland" },
      ] }],
      squads: new Map([["resv_league", [
        mkSquad("rs1", "Real Sociedad", "Spainland", [
          buildPlayer("rs1_gk", "Sociedad One Keeper", 24, "GK", "rs1", 5, "Spainland"),
          buildPlayer("rs1_def", "Sociedad One Back", 24, "Defender", "rs1", 5, "Spainland"),
          buildPlayer("rs1_mid", "Sociedad One Mid", 24, "Midfielder", "rs1", 5, "Spainland"),
          buildPlayer("rs1_fwd", "Sociedad One Fwd", 24, "Forward", "rs1", 5, "Spainland"),
        ]),
        mkSquad("rs2", "Real Sociedad II", "Spainland", [buildPlayer("rs2_gk", "Sociedad Two Keeper", 20, "GK", "rs2", 3, "Spainland")]),
      ]]]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "resv_league", code: "sp.9", name: "Resv League", season: "2026-27", teams: [
        buildTeam("RS1", "Real Sociedad", [buildAthlete("dupRS", "Loan Player", 24, "F", "Spainland")]),
        buildTeam("RS2", "Real Sociedad II", [buildAthlete("dupRS", "Loan Player", 24, "F", "Spainland")]),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "resv_league", code: "sp.9" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r7 = applyEspn(world, snap, testOpts);
    expect(r7.report.duplicateAthletes).toEqual([{ athleteId: "dupRS", keptTeam: "Real Sociedad", droppedTeam: "Real Sociedad II" }]);
  });

  test("\"Willem II\" is not a reserve side — no team named just \"Willem\" exists", () => {
    const world: World = {
      leagues: [{ slug: "resv_league2", name: "Resv League 2", country: "Dutchland", season: "2024-25", standings: [
        { squadId: "w1", slug: "w1", name: "Willem II", colors: ["#111111", "#ffffff"], country: "Dutchland" },
        { squadId: "w2", slug: "w2", name: "Some Rival", colors: ["#111111", "#ffffff"], country: "Dutchland" },
      ] }],
      squads: new Map([["resv_league2", [
        mkSquad("w1", "Willem II", "Dutchland", [
          buildPlayer("w1_gk", "Willem Keeper", 24, "GK", "w1", 5, "Dutchland"),
          buildPlayer("w1_def", "Willem Back", 24, "Defender", "w1", 5, "Dutchland"),
          buildPlayer("w1_mid", "Willem Mid", 24, "Midfielder", "w1", 5, "Dutchland"),
          buildPlayer("w1_fwd", "Willem Fwd", 24, "Forward", "w1", 5, "Dutchland"),
        ]),
        mkSquad("w2", "Some Rival", "Dutchland", [buildPlayer("w2_gk", "Rival Keeper", 24, "GK", "w2", 5, "Dutchland")]),
      ]]]),
      schedules: [],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "resv_league2", code: "nl.9", name: "Resv League 2", season: "2026-27", teams: [
        buildTeam("W1", "Willem II", [buildAthlete("dupW", "Loan Two", 24, "F", "Dutchland")]),
        buildTeam("W2", "Some Rival", [buildAthlete("dupW", "Loan Two", 24, "F", "Dutchland")]),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "resv_league2", code: "nl.9" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r8 = applyEspn(world, snap, testOpts);
    // Neither team is reserve (no plain "Willem" team exists) → falls to the tier/id tiebreak,
    // where "W1" (Willem II) wins on the lower team id — proving "Willem II" was NOT penalised
    // just for ending in "II".
    expect(r8.report.duplicateAthletes).toEqual([{ athleteId: "dupW", keptTeam: "Willem II", droppedTeam: "Some Rival" }]);
  });
});

describe("applyEspn — non-covered clubs drop any cached overallAvg when aged", () => {
  test("a player left in a non-covered league loses its stale overallAvg cache after aging", () => {
    const w = fixtureWorld();
    const wolves = w.squads.get("premier_league")!.find((s) => s.id === "39")!;
    (wolves.players[0] as RosterPlayer).overallAvg = 5.5;
    const restrictedOpts = { ...opts, leagueMap: [opts.leagueMap[0]!] }; // only premier_league covered
    const r9 = applyEspn(w, fixtureSnapshot(), restrictedOpts);
    const outWolves = [...r9.world.squads.values()].flat().find((s) => s.id === "39")!;
    const p0 = outWolves.players.find((p) => p.id === "39_p0")!;
    expect(p0.age).toBe(22); // 20 + typicalGap(2), same as before
    expect(p0.overallAvg).toBeUndefined();
  });
});

describe("applyEspn — tier finance change only fires on an actual tier change", () => {
  test("a genuine move between two same-tier leagues (no pyramid entry — both default to tier 1) leaves finances unchanged", () => {
    const world: World = {
      leagues: [
        { slug: "sideA", name: "Side A", country: "Sideland", season: "2024-25", standings: [
          { squadId: "swapClub", slug: "swapClub", name: "Swap Club", colors: ["#111111", "#ffffff"], country: "Sideland" },
        ] },
        { slug: "sideB", name: "Side B", country: "Sideland", season: "2024-25", standings: [] },
      ],
      squads: new Map([
        ["sideA", [mkSquad("swapClub", "Swap Club", "Sideland", [
          buildPlayer("swap_gk", "Swap Keeper", 24, "GK", "swapClub", 5, "Sideland"),
          buildPlayer("swap_def", "Swap Back", 24, "Defender", "swapClub", 5, "Sideland"),
          buildPlayer("swap_mid", "Swap Mid", 24, "Midfielder", "swapClub", 5, "Sideland"),
          buildPlayer("swap_fwd", "Swap Fwd", 24, "Forward", "swapClub", 5, "Sideland"),
        ])]],
        ["sideB", []],
      ]),
      schedules: [],
      pyramids: {}, // no pyramid entries for Sideland → pyramidTier() defaults both leagues to tier 1
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [
        { slug: "sideA", code: "sd.1", name: "Side A", season: "2026-27", teams: [] },
        { slug: "sideB", code: "sd.2", name: "Side B", season: "2026-27", teams: [buildTeam("SB1", "Swap Club", [])] },
      ],
    };
    const testOpts = { leagueMap: [{ slug: "sideA", code: "sd.1" }, { slug: "sideB", code: "sd.2" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r10 = applyEspn(world, snap, testOpts);
    expect(r10.report.movedClubs).toEqual([{ squadId: "swapClub", from: "sideA", to: "sideB" }]);
    const out = [...r10.world.squads.values()].flat().find((s) => s.id === "swapClub")!;
    expect(out.finances!.broadcasting).toBe(1e6); // unchanged — same (default) tier on both sides
    expect(out.finances!.commercial).toBe(1e6);
  });
});

describe("applyEspn — schedule matchDays", () => {
  test("an unchanged club count keeps a hand-authored 3-day schedule untouched", () => {
    const world: World = {
      leagues: [{ slug: "steady_league", name: "Steady League", country: "Steadyland", season: "2024-25", standings: [
        { squadId: "st1", slug: "st1", name: "Steady One", colors: ["#111111", "#ffffff"], country: "Steadyland" },
        { squadId: "st2", slug: "st2", name: "Steady Two", colors: ["#111111", "#ffffff"], country: "Steadyland" },
      ] }],
      squads: new Map([["steady_league", [
        buildSquad("st1", "Steady One", 5, { country: "Steadyland" }),
        buildSquad("st2", "Steady Two", 5, { country: "Steadyland" }),
      ]]]),
      schedules: [{ slug: "steady_league", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [5, 6, 0], baseWeekOffset: 0 }],
      pyramids: {},
    };
    const snap: EspnSnapshot = {
      fetchedAt: "2026-09-25",
      leagues: [{ slug: "steady_league", code: "sl.1", name: "Steady League", season: "2026-27", teams: [
        buildTeam("SL1", "Steady One", []),
        buildTeam("SL2", "Steady Two", []),
      ] }],
    };
    const testOpts = { leagueMap: [{ slug: "steady_league", code: "sl.1" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r11 = applyEspn(world, snap, testOpts);
    expect(r11.world.schedules.find((s) => s.slug === "steady_league")!.matchDays).toEqual([5, 6, 0]);
  });

  test("a club count that grows past 40 rounds gains a third match day", () => {
    const N = 20;
    const clubs = Array.from({ length: N }, (_, i) => buildSquad(`grow${i + 1}`, `Grow FC ${i + 1}`, 5, { country: "Growland" }));
    const world: World = {
      leagues: [{ slug: "grow_league", name: "Grow League", country: "Growland", season: "2024-25", standings: clubs.map((s) => ({ squadId: s.id, slug: s.slug, name: s.name, colors: s.colors, country: "Growland" })) }],
      squads: new Map([["grow_league", clubs]]),
      schedules: [{ slug: "grow_league", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6, 0], baseWeekOffset: 0 }],
      pyramids: {},
    };
    const teams = clubs.map((s) => buildTeam(`E_${s.id}`, s.name, []));
    teams.push(buildTeam("E_new", "Grow FC 21", []));
    const snap: EspnSnapshot = { fetchedAt: "2026-09-25", leagues: [{ slug: "grow_league", code: "gl.1", name: "Grow League", season: "2026-27", teams }] };
    const testOpts = { leagueMap: [{ slug: "grow_league", code: "gl.1" }], clubOverrides: {}, playerOverrides: {}, boundaries: {}, roleWeights: allWeights, overall };
    const r12 = applyEspn(world, snap, testOpts);
    const finalLeague = r12.world.leagues.find((l) => l.slug === "grow_league")!;
    expect(finalLeague.standings.length).toBe(21);
    expect(r12.world.schedules.find((s) => s.slug === "grow_league")!.matchDays).toEqual([3, 6, 0]);
  });
});
