import { describe, expect, test } from "bun:test";
import { buildQuickMatchEvent } from "@/Domain/advanceDay/matches";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(id: string): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}-p${i}`, name: `${id}${i}`, age: 25, squadId: id, preferredFoot: "right",
    positions: [role],
    stats: {
      passing: 4, vision: 4, finishing: 4, dribbling: 4, speed: 4, acceleration: 4,
      tackling: 4, pressing: 4, stamina: 4, heading: 4, strength: 4, reflex: 4, jump: 4,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

describe("buildQuickMatchEvent", () => {
  test("gera evento compacto e atualiza seasonLog dos escalados", () => {
    const home = makeSquad("h");
    const away = makeSquad("a");
    const fixture = { id: "fx1", competition: "la_liga", round: 1, home: "h", away: "a" } as Fixture;
    const sim = { homeLineup: home.players.map((p) => p.id), awayLineup: away.players.map((p) => p.id) };

    // Seed 5 produces at least one goal for this fixed 11v11 setup — verified rather than
    // assumed, so the scorer-map assertions below always exercise a non-empty scorers array.
    const r = buildQuickMatchEvent(fixture, home, away, sim, mulberry32(5));
    expect(r.event.score.home + r.event.score.away).toBeGreaterThan(0);

    expect(r.event.compact).toBe(true);
    expect(r.event.playerStats).toEqual({});
    expect(r.event.playerRatings).toEqual({});
    expect(r.event.developmentChanges).toEqual([]);
    expect(r.event.fixtureId).toBe("fx1");
    const scorerGoals = r.event.scorers.reduce((acc, s) => acc + s.goals, 0);
    expect(scorerGoals).toBe(r.event.score.home + r.event.score.away);
    for (const p of r.updatedHome.players) expect(p.seasonLog!.appearances).toBe(1);
    for (const p of r.updatedAway.players) expect(p.seasonLog!.appearances).toBe(1);

    // Compact event still identifies who scored, without full per-player stats/ratings.
    const scorerIds = r.event.scorers.map((s) => s.playerId).sort();
    expect(Object.keys(r.event.playerNames).sort()).toEqual(scorerIds);
    for (const s of r.event.scorers) {
      expect(r.event.playerTeams[s.playerId]).toBe(s.team);
    }

    // Energy/fitness pipeline actually ran — post-match fitness must move off the fresh-squad default.
    const startFitness = emptySeasonLog().fitness;
    const allPlayers = [...r.updatedHome.players, ...r.updatedAway.players];
    expect(allPlayers.some((p) => p.seasonLog!.fitness !== startFitness)).toBe(true);

    // Team stats are populated and consistent with the scoreline (shots include every goal).
    expect(r.event.teamStats.home).toBeDefined();
    expect(r.event.teamStats.away).toBeDefined();
    expect(r.event.teamStats.home.shots).toBeGreaterThanOrEqual(r.event.score.home);
    expect(r.event.teamStats.away.shots).toBeGreaterThanOrEqual(r.event.score.away);
  });
});

describe("cup fixtures", () => {
  // Same stats on every roster slot (see makeSquad) → home and away are exactly equal in
  // force, so any scoreline asymmetry below comes only from the venue flags under test.
  const home = makeSquad("h");
  const away = makeSquad("a");
  const fixture = { id: "fx1", competition: "la_liga", round: 1, home: "h", away: "a" } as Fixture;
  const sim = { homeLineup: home.players.map((p) => p.id), awayLineup: away.players.map((p) => p.id) };

  test("knockout fixture never ends level and carries the decider on the event", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const knockoutFixture = { ...fixture, knockout: true as const };
      const { event } = buildQuickMatchEvent(knockoutFixture, home, away, sim, mulberry32(seed));
      const pens = event.decider?.penalties;
      const level = event.score.home === event.score.away;
      expect(level ? !!pens && pens.home !== pens.away : true).toBe(true);
    }
  });

  test("neutral fixture removes home advantage", () => {
    // A single pass at "average diff over N independent seeds" is noisy: quickSim's per-match
    // score variance dwarfs the home-advantage signal (~0.05 goals/match) at any N that still
    // runs fast, so an independent-sample test is either loose enough to pass regardless of a
    // regression, or tight enough to flake. Instead, each seed drives BOTH a normal and a
    // neutral fixture — same rng stream, so the shared randomness (dominance noise, the exact
    // Bernoulli draws inside sampleGoals) mostly cancels out and only the effect of the venue
    // flag on expected goals remains. Calibrated empirically: paired mean ~0.045, paired SE
    // ~0.005 at n=2000 — a >8-sigma signal, so 0.02 is a safe, non-flaky threshold while still
    // failing hard if `neutral` stops suppressing home advantage.
    const n = 2000;
    let diffSum = 0;
    let neutralMarginSum = 0;
    for (let seed = 1; seed <= n; seed++) {
      const normal = buildQuickMatchEvent(fixture, home, away, sim, mulberry32(seed));
      const neutral = buildQuickMatchEvent({ ...fixture, neutral: true as const }, home, away, sim, mulberry32(seed));
      const normalMargin = normal.event.score.home - normal.event.score.away;
      const neutralMargin = neutral.event.score.home - neutral.event.score.away;
      diffSum += normalMargin - neutralMargin;
      neutralMarginSum += neutralMargin;
    }
    // Paired mean margin lost by removing home advantage — must be clearly positive.
    expect(diffSum / n).toBeGreaterThan(0.02);
    // With home and away exactly equal in force (see makeSquad), a neutral fixture on its own
    // should have no systematic home/away bias — the mean margin should sit close to 0.
    expect(Math.abs(neutralMarginSum / n)).toBeLessThan(0.08);
  });

  test("cup ties also count in seasonLog.cup; league ties don't", () => {
    const cupFixture = { ...fixture, competition: "cup_testland", knockout: true as const };
    const afterCup = buildQuickMatchEvent(cupFixture, home, away, sim, mulberry32(1));
    const playedCup = afterCup.updatedHome.players.find((p) => (p.seasonLog?.appearances ?? 0) > 0)!;
    expect(playedCup.seasonLog!.cup?.appearances).toBe(1);

    const afterLeague = buildQuickMatchEvent(fixture, home, away, sim, mulberry32(1));
    const playedLeague = afterLeague.updatedHome.players.find((p) => (p.seasonLog?.appearances ?? 0) > 0)!;
    expect(playedLeague.seasonLog!.cup?.appearances ?? 0).toBe(0);
    // League appearances/goals/assists are never routed into the cup sub-log.
    expect(playedLeague.seasonLog!.appearances).toBe(1);
  });

  test("second leg with a first-leg aggregate decides on aggregate, not the 90' score alone", () => {
    // First leg: away won 1-0 (home:0, away:1) — from THIS second-leg fixture's home/away
    // point of view. Level on aggregate requires this leg's home - away === 1.
    let deciderCount = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const secondLeg = { ...fixture, knockout: true as const, aggregate: { home: 0, away: 1 } };
      const { event } = buildQuickMatchEvent(secondLeg, home, away, sim, mulberry32(seed));
      const diffAfter90 =
        event.score.home - (event.decider?.extraTime.home ?? 0) -
        (event.score.away - (event.decider?.extraTime.away ?? 0));
      if (event.decider) {
        deciderCount++;
        expect(diffAfter90).toBe(1); // level on aggregate after 90'
      } else {
        expect(event.score.home - event.score.away).not.toBe(1); // otherwise decided in 90'
      }
      if (event.decider?.penalties) {
        expect(event.score.home - event.score.away).toBe(1); // still level on aggregate after ET
      }
    }
    expect(deciderCount).toBeGreaterThan(0);
  });
});
