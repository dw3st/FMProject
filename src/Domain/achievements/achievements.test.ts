import { describe, expect, test } from "bun:test";
import { applyAchievementDay, type AchievementDayInput } from "@/Domain/achievements/day";
import { availableBadges, availableFrames, parseDecor, parseProfile, shownProfile } from "@/Domain/achievements/items";
import { attributeBoost, attributeReduce, youthAttributeMult } from "@/Domain/achievements/managerAttributes";
import { matchFacts, type MatchFacts } from "@/Domain/achievements/matchFacts";
import {
  applyRollover, earnedPoints, emptyAchievements, ensureClub, normalizeAchievements, pointsBalance, recordMatch,
  trackValues,
} from "@/Domain/achievements/progress";
import { parseCreatedPlayer } from "@/Domain/achievements/shop";
import type { AchievementsState } from "@/types/achievementTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { ManagerRecord } from "@/types/managerTypes";

function facts(over: Partial<MatchFacts> = {}): MatchFacts {
  return {
    result: "W", gf: 2, ga: 0, home: true, league: true, shootoutWin: false, maxDeficit: 0, ownReds: 0,
    lastGasp: false, keeperGoal: false, derby: false, starters: [], ...over,
  };
}

function manager(over: Partial<ManagerRecord> = {}): ManagerRecord {
  return { id: "player", name: "Me", squadId: "club", isPlayer: true, points: 0, seasons: 0, titles: [], ...over };
}

function day(state: AchievementsState, over: Partial<AchievementDayInput> = {}) {
  return applyAchievementDay(state, {
    date: "2027-03-01", squadId: "club", arrival: { capacity: 30000, balance: 0, facilityLevels: {} }, matches: [], transfers: [],
    snapshot: { manager: manager(), rank: null, balanceGain: 0, extraSeats: 0, facilityLevels: 0 },
    awards: [], ...over,
  });
}

function event(over: Partial<MatchEvent> = {}): MatchEvent {
  return {
    kind: "match", fixtureId: "f", competition: "premier_league", round: 1, home: "club", away: "opp",
    score: { home: 3, away: 2 }, teamStats: {} as MatchEvent["teamStats"], playerStats: {}, playerRatings: { a: 7, b: 6, c: 6 },
    playerNames: {}, playerTeams: { a: "home", b: "home", c: "away" }, scorers: [], substitutions: [],
    developmentChanges: [], durationMs: 0, ...over,
  };
}

describe("manager attributes", () => {
  test("neutral at 10 and absent, ±5% at the extremes", () => {
    expect(attributeBoost(10)).toBe(1);
    expect(attributeBoost(undefined)).toBe(1);
    expect(attributeReduce(10)).toBe(1);
    expect(attributeBoost(20)).toBeCloseTo(1.05);
    expect(attributeReduce(20)).toBeCloseTo(0.95);
    expect(attributeBoost(1)).toBeCloseTo(0.955);
    expect(youthAttributeMult({ youth: 20 }, 22)).toBe(1);
    expect(youthAttributeMult({ youth: 20 }, 19)).toBeCloseTo(1.05);
  });
});

describe("matchFacts", () => {
  test("a comeback with a late winner after being two down", () => {
    const f = matchFacts(event({
      goals: [
        { playerId: "c", team: "away", minute: 10, header: false, distance: 10, outsideBox: false },
        { playerId: "c", team: "away", minute: 20, header: false, distance: 10, outsideBox: false },
        { playerId: "a", team: "home", minute: 50, header: false, distance: 10, outsideBox: false },
        { playerId: "b", team: "home", minute: 70, header: false, distance: 10, outsideBox: false },
        { playerId: "a", team: "home", minute: 93, header: false, distance: 10, outsideBox: false },
      ],
    }), "home", { league: true, derby: false, isKeeper: (id) => id === "b" });
    expect(f.result).toBe("W");
    expect(f.maxDeficit).toBe(2);
    expect(f.lastGasp).toBe(true);
    expect(f.keeperGoal).toBe(true);
    expect(f.starters.sort()).toEqual(["a", "b"]);
  });

  test("penalties decide W/L", () => {
    const f = matchFacts(event({ score: { home: 1, away: 1 }, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 4 } } }),
      "away", { league: false, derby: false, isKeeper: () => false });
    expect(f.result).toBe("W");
    expect(f.shootoutWin).toBe(true);
  });
});

describe("recordMatch", () => {
  test("streaks, thrashings and the match secrets", () => {
    let s = emptyAchievements();
    for (let i = 0; i < 5; i++) s = recordMatch(s, facts({ gf: 4, ga: 0 }), "2027-03-01");
    expect(s.counters.wins).toBe(5);
    expect(s.counters.bestWinStreak).toBe(5);
    expect(s.counters.thrashings).toBe(5);
    s = recordMatch(s, facts({ result: "L", gf: 0, ga: 5 }), "2027-03-02");
    expect(s.counters.winStreak).toBe(0);
    expect(s.counters.bestWinStreak).toBe(5);
    expect(s.unlocked["secret:humbled"]).toBe("2027-03-02");
    s = recordMatch(s, facts({ gf: 8, ga: 1, maxDeficit: 3, ownReds: 2 }), "2027-03-03");
    expect(s.unlocked["secret:seven_up"]).toBeTruthy();
    expect(s.unlocked["secret:great_escape"]).toBeTruthy();
    expect(s.unlocked["secret:nine_men"]).toBeTruthy();
    expect(s.counters.comebacks).toBe(1);
    expect(s.counters.tenMenWins).toBe(1);
  });

  test("five defeats in a row lower motivation and discipline", () => {
    let s = emptyAchievements();
    for (let i = 0; i < 5; i++) s = recordMatch(s, facts({ result: "L", gf: 0, ga: 1 }), "2027-03-01");
    expect(s.attributes.motivation).toBe(9.75);
    expect(s.attributes.discipline).toBe(9.75);
  });
});

describe("applyAchievementDay", () => {
  test("idempotent by day", () => {
    const s0 = emptyAchievements();
    const a = day(s0, { matches: [facts()] });
    const b = day(a.state, { matches: [facts()] });
    expect(b.state).toBe(a.state);
    expect(a.state.counters.wins).toBe(1);
  });

  test("tiers unlock with points and attribute gains", () => {
    const s0: AchievementsState = { ...emptyAchievements(), counters: { ...emptyAchievements().counters, wins: 49 } };
    const r = day(s0, { matches: [facts()] });
    expect(r.unlocked).toContain("wins:bronze");
    expect(earnedPoints(r.state)).toBe(10);
    expect(r.state.attributes.motivation).toBe(10.25);
  });

  test("titles: tactics gain, double and treble", () => {
    const m = manager({ titles: [
      { season: "2027", kind: "league", competition: "l", squadId: "club", points: 100 },
      { season: "2027", kind: "cup", competition: "c", squadId: "club", points: 50 },
      { season: "2027", kind: "continental", competition: "lib", squadId: "club", points: 150 },
    ] });
    const r = day(emptyAchievements(), { snapshot: { manager: m, rank: 1, balanceGain: 0, extraSeats: 0, facilityLevels: 0 } });
    expect(r.unlocked).toEqual(expect.arrayContaining(["secret:double", "secret:treble", "league_titles:bronze", "ranking:gold"]));
    // 0.5 + 0.25 + 0.5 titles, + 0.25 bronze league, + secrets 2 × 0.5, + cup bronze 0.25, continental bronze 0.25
    expect(r.state.attributes.tactics).toBe(10 + 1.25 + 0.25 + 1 + 0.25 + 0.25);
    expect(r.state.titlesSeen).toBe(3);
  });

  test("market: sale profit over what was paid, free signing starts", () => {
    let s = day(emptyAchievements(), {
      date: "2027-03-01",
      transfers: [
        { playerId: "x", from: "other", to: "club", fee: 4_000_000, kind: "transfer", date: "2027-03-01" },
        { playerId: "f", from: "", to: "club", fee: 0, kind: "free", date: "2027-03-01" },
      ],
      matches: [facts({ starters: ["f"] })],
    }).state;
    expect(s.counters.biggestSigning).toBe(4_000_000);
    expect(s.freeSignings.f).toBe(1);
    s = day(s, { date: "2027-03-02", transfers: [{ playerId: "x", from: "club", to: "rich", fee: 10_000_000, kind: "transfer", date: "2027-03-02" }] }).state;
    expect(s.counters.salesProfit).toBe(6_000_000);
    expect(s.unlocked["sales_profit:bronze"]).toBeTruthy();
  });

  test("perfect month judged on the first day of the next month", () => {
    let s = emptyAchievements();
    for (let d = 1; d <= 4; d++) s = day(s, { date: `2027-03-0${d}`, matches: [facts()] }).state;
    expect(s.unlocked["secret:perfect_month"]).toBeUndefined();
    s = day(s, { date: "2027-04-01" }).state;
    expect(s.unlocked["secret:perfect_month"]).toBe("2027-04-01");
  });

  test("sacked early", () => {
    const r = day(emptyAchievements(), { date: "2027-03-20", sacked: { hiredOn: "2027-03-01" } });
    expect(r.unlocked).toContain("secret:sacked_early");
  });
});

describe("rollover", () => {
  test("fortress, invincible season, one club", () => {
    let s = ensureClub(emptyAchievements(), "club", { capacity: 1000, balance: 0, facilityLevels: {} });
    s = { ...s, clubs: { club: { baseCapacity: 1000, baseBalance: 0, baseFacilityLevels: {}, seasons: 9 } } };
    for (let i = 0; i < 12; i++) s = recordMatch(s, facts({ result: i % 2 ? "D" : "W", home: i % 2 === 0 }), "2027-03-01");
    s = applyRollover(s, { squadId: "club", champion: true, cheapest: true, bounceBack: true, objectiveMet: true }, "2027-12-10");
    for (const k of ["secret:fortress", "secret:cheapest_champion", "secret:bounce_back", "league_unbeaten:gold", "secret:one_club"] as const) {
      expect(s.unlocked[k]).toBe("2027-12-10");
    }
    expect(s.season?.played).toBe(0);
    expect(s.counters.leagueUnbeaten).toBe(0);
  });
});

describe("items", () => {
  test("frames by points, badges by golds, validated profile", () => {
    let s = emptyAchievements();
    expect(availableFrames(s)).toEqual(["none"]);
    s = { ...s, unlocked: { "wins:gold": "d", "wins:silver": "d", "wins:bronze": "d", "secret:wall": "d" } };
    expect(earnedPoints(s)).toBe(125);
    expect(availableFrames(s)).toEqual(["none", "bronze"]);
    expect(availableBadges(s)).toEqual(["wins", "mystery"]);
    expect(parseProfile({ frame: "bronze", badges: ["wins"], title: "wins" }, s)).toEqual({ frame: "bronze", badges: ["wins"], title: "wins" });
    expect(() => parseProfile({ frame: "gold" }, s)).toThrow("locked");
    expect(() => parseProfile({ badges: ["titles"] }, s)).toThrow("locked");
    expect(() => parseDecor({ banner: true }, emptyAchievements())).toThrow("locked");
    expect(parseDecor({ banner: true }, s)).toEqual({ banner: true, flag: false, mosaic: false });
    const stale = { ...s, profile: { frame: "legend" as const, badges: ["titles" as const, "wins" as const], title: "comebacks" as const } };
    expect(shownProfile(stale)).toEqual({ frame: "none", badges: ["wins"], title: null });
    expect(pointsBalance({ ...s, spent: 100 })).toBe(25);
  });

  test("normalize fills missing fields", () => {
    const s = normalizeAchievements({ unlocked: { "wins:bronze": "d" } } as never);
    expect(s.attributes.youth).toBe(10);
    expect(trackValues(s, { manager: null, rank: null, balanceGain: 0, extraSeats: 0, facilityLevels: 0 }).wins).toBe(0);
  });
});

describe("shop", () => {
  test("created player body", () => {
    expect(parseCreatedPlayer({ name: "  João  Silva ", position: "ST", nationality: "Brazil", foot: "left" }))
      .toEqual({ name: "João Silva", position: "ST", nationality: "Brazil", foot: "left" });
    expect(() => parseCreatedPlayer({ name: "J", position: "ST", nationality: "Brazil", foot: "left" })).toThrow();
    expect(() => parseCreatedPlayer({ name: "Joe", position: "XX", nationality: "Brazil", foot: "left" })).toThrow();
    expect(() => parseCreatedPlayer({ name: "Joe", position: "ST", nationality: "Atlantis", foot: "left" })).toThrow();
  });
});
