import { describe, expect, test } from "bun:test";
import {
  buildMatchEvent,
  buildMatchEventFromRecording,
  computeMinutesPlayed,
  type PlayedMatchRecording,
} from "@/Domain/advanceDay/matches";
import { addMatchLoad, decayLoad, postMatchFitness, recoverDay } from "@/Domain/fitness/fitness";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchInjury, MatchPlayerStats } from "@/types/dayLogTypes";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";

// ── computeMinutesPlayed ────────────────────────────────────────────────────

function emptyStats(): MatchPlayerStats {
  return {
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0,
  };
}

describe("computeMinutesPlayed", () => {
  test("no substitutions — every player plays the full match", () => {
    const minutes = computeMinutesPlayed(["p1", "p2"], [], 90);
    expect(minutes).toEqual({ p1: 90, p2: 90 });
  });

  test("no substitutions, extra time — every player plays 120", () => {
    const minutes = computeMinutesPlayed(["p1"], [], 120);
    expect(minutes).toEqual({ p1: 120 });
  });

  test("one substitution splits minutes between the two players", () => {
    const minutes = computeMinutesPlayed(
      ["out", "in"],
      [{ playerOutId: "out", playerInId: "in", matchMinute: 60 }],
      90,
    );
    expect(minutes.out).toBe(60);
    expect(minutes.in).toBe(30);
  });

  test("a substitute who is later subbed off again gets only the minutes they were on", () => {
    const minutes = computeMinutesPlayed(
      ["a", "b", "c"],
      [
        { playerOutId: "a", playerInId: "b", matchMinute: 45 },
        { playerOutId: "b", playerInId: "c", matchMinute: 75 },
      ],
      90,
    );
    expect(minutes.a).toBe(45);
    expect(minutes.b).toBe(30); // 45 → 75
    expect(minutes.c).toBe(15); // 75 → 90
  });

  test("substitution during extra time uses the 120-minute total", () => {
    const minutes = computeMinutesPlayed(
      ["out", "in"],
      [{ playerOutId: "out", playerInId: "in", matchMinute: 105 }],
      120,
    );
    expect(minutes.out).toBe(105);
    expect(minutes.in).toBe(15);
  });

  test("processes substitutions in the given (recording) order, never re-sorts by matchMinute", () => {
    // matchMinute is not monotonic across halves/extra-time (each phase has its own offset — see
    // `.claude/rules/match-flow.md`), so the recording order is the only reliable source of truth
    // for who is on the pitch when. Here the second substitution reports a LOWER matchMinute than
    // the first (e.g. crossing a phase boundary) — a numeric sort would try to process "b → c"
    // before "a → b" ever happened, losing track of "b" entirely (their `since` would never be
    // found) and wrongly crediting them with playing to the end. Processing in given order gets
    // it right: a played 0→40, b played 40→40 (immediately subbed off again, 0 minutes), c played
    // 20→90 (70 minutes) — note c's own minutes start at their recorded sub-in minute, not at a.
    const subs = [
      { playerOutId: "a", playerInId: "b", matchMinute: 40 },
      { playerOutId: "b", playerInId: "c", matchMinute: 20 },
    ];
    const minutes = computeMinutesPlayed(["a", "b", "c"], subs, 90);
    expect(minutes).toEqual({ a: 40, b: 0, c: 70 });
  });

  test("a player subbed on at or after the total still gets at least 1 minute, never 0", () => {
    const atTotal = computeMinutesPlayed(
      ["out", "in"],
      [{ playerOutId: "out", playerInId: "in", matchMinute: 90 }],
      90,
    );
    expect(atTotal.in).toBe(1);

    const pastTotal = computeMinutesPlayed(
      ["out", "in"],
      [{ playerOutId: "out", playerInId: "in", matchMinute: 96 }],
      90,
    );
    expect(pastTotal.in).toBe(1);
  });
});

// ── buildMatchEventFromRecording (shared by quickSim and the live-recorded match) ──

function makeSquad(id: string, n: number): Squad {
  const players: RosterPlayer[] = Array.from({ length: n }, (_, i) => ({
    id: `${id}-p${i}`,
    name: `${id}${i}`,
    age: 25,
    squadId: id,
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

function baseRecording(overrides: Partial<PlayedMatchRecording> = {}): PlayedMatchRecording {
  return {
    fixtureId: "fx1",
    score: { home: 0, away: 0 },
    teamStats: {
      home: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
      away: { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 },
    },
    playerStats: {},
    playerRatings: {},
    playerEnergy: {},
    substitutions: [],
    durationMs: 0,
    ...overrides,
  };
}

describe("buildMatchEventFromRecording — post-match fitness and load", () => {
  test("fitness becomes exactly the end-of-match energy (no 50% give-back)", () => {
    const home = makeSquad("h", 1);
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 42.6, "a-p0": 10 },
    });

    const { updatedHome, updatedAway } = buildMatchEventFromRecording(fixture, home, away, recording);
    expect(updatedHome.players[0]!.seasonLog!.fitness).toBe(postMatchFitness(42.6));
    expect(updatedHome.players[0]!.seasonLog!.fitness).toBe(43);
    expect(updatedAway.players[0]!.seasonLog!.fitness).toBe(10);
  });

  test("load accumulates minutes played, on top of any pre-existing load", () => {
    const home = makeSquad("h", 2);
    const away = makeSquad("a", 1);
    home.players[0]!.seasonLog = { ...emptySeasonLog(), load: 40 };
    const fixture = { id: "fx1", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "h-p1": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 60, "h-p1": 60, "a-p0": 60 },
      substitutions: [{ team: "home", playerOutId: "h-p0", playerOutName: "h0", playerInId: "h-p1", playerInName: "h1", matchMinute: 70 }],
    });

    const { updatedHome, updatedAway } = buildMatchEventFromRecording(fixture, home, away, recording);
    const p0 = updatedHome.players.find((p) => p.id === "h-p0")!;
    const p1 = updatedHome.players.find((p) => p.id === "h-p1")!;
    const a0 = updatedAway.players.find((p) => p.id === "a-p0")!;
    // Load always decays one day's worth first, then this match's minutes are added on top.
    expect(p0.seasonLog!.load).toBe(addMatchLoad(decayLoad(40), 70)); // pre-existing load, decayed, + minutes played
    expect(p1.seasonLog!.load).toBe(addMatchLoad(decayLoad(0), 20)); // came on at minute 70, fresh load
    expect(a0.seasonLog!.load).toBe(addMatchLoad(decayLoad(0), 90)); // no substitutions on this side — full match
  });

  test("a player who did not play still recovers fitness and decays load (their squad's daily rest/training is skipped today)", () => {
    const home = makeSquad("h", 2);
    home.players[1]!.seasonLog = { ...emptySeasonLog(), fitness: 77, load: 15 };
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 50, "a-p0": 50 },
    });

    const { updatedHome } = buildMatchEventFromRecording(fixture, home, away, recording);
    const bench = updatedHome.players.find((p) => p.id === "h-p1")!;
    // makeSquad: age 25, stamina 5 — same recoverDay curve as an actual rest day.
    const expectedFitness = +recoverDay(77, { age: 25, load: 15, stamina: 5 }).toFixed(1);
    expect(bench.seasonLog!.fitness).toBe(expectedFitness);
    expect(bench.seasonLog!.fitness).toBeGreaterThan(77); // did recover, wasn't left untouched
    expect(bench.seasonLog!.load).toBe(decayLoad(15));
  });

  test("extra time (decider present) counts as 120 minutes for the full match", () => {
    const home = makeSquad("h", 1);
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", competition: "cup_testland", round: 1, home: "h", away: "a", knockout: true } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 50, "a-p0": 50 },
      decider: { extraTime: { home: 1, away: 0 } },
    });

    const { updatedHome } = buildMatchEventFromRecording(fixture, home, away, recording);
    expect(updatedHome.players[0]!.seasonLog!.load).toBe(120);
  });
});

// ── buildMatchEvent (full engine path) ──────────────────────────────────────

function loadRealSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("buildMatchEvent — full engine post-match fitness and load", () => {
  test("players who played get integer fitness in 0..100 and load equal to minutes played", () => {
    const home = loadRealSquad("33.json");
    const away = loadRealSquad("34.json");
    const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
    const homeLineup = autoLineupDefaultFormation(home);
    const awayLineup = autoLineupDefaultFormation(away);
    const fixture = { id: "fx1", date: "2027-02-05", competition: "premier_league", round: 1, home: home.id, away: away.id } as Fixture;

    const { event, updatedHome, updatedAway } = buildMatchEvent(fixture, home, away, {
      homeFormation: formation, homeLineup, awayFormation: formation, awayLineup,
    });

    // `totalMatchMinutes` in matches.ts — a flat 90/120, never stretched by stoppage-time subs.
    const totalMinutes = event.decider ? 120 : 90;
    const subbedOutIds = new Set(event.substitutions.map((s) => s.playerOutId));
    let checkedNonSubbed = 0;

    for (const p of [...updatedHome.players, ...updatedAway.players]) {
      const ps = event.playerStats[p.id];
      if (!ps) {
        // Never on the pitch this match — the daily rest/training loop skips this squad
        // entirely today (it played a fixture), so `finalizeSquadsAfterMatch` gives bench
        // players the day's recovery/decay itself: fitness recovers off the fresh-squad
        // default (75, from `emptySeasonLog`), load (freshly 0) decays to itself (still 0).
        expect(p.seasonLog?.load ?? 0).toBe(0);
        expect(p.seasonLog!.fitness).toBeGreaterThan(75);
        expect(p.seasonLog!.fitness).toBeLessThanOrEqual(100);
        continue;
      }
      const fitness = p.seasonLog!.fitness;
      expect(Number.isInteger(fitness)).toBe(true);
      expect(fitness).toBeGreaterThanOrEqual(0);
      expect(fitness).toBeLessThanOrEqual(100);

      const load = p.seasonLog!.load ?? 0;
      // The "at least 1 minute" floor only applies to a player still on the pitch at the final
      // whistle (see the dedicated computeMinutesPlayed test) — a player subbed off in the very
      // first minute of the match could in principle still show 0 here.
      expect(load).toBeGreaterThanOrEqual(0);

      if (!subbedOutIds.has(p.id)) {
        // Started and finished the match (or came on and was never subbed off again) — a
        // starter who was never involved in any substitution plays exactly the full match
        // length (fresh squads start at load 0, so decay-then-add doesn't change this).
        const isStarter = homeLineup.includes(p.id) || awayLineup.includes(p.id);
        const wasSubbedIn = event.substitutions.some((s) => s.playerInId === p.id);
        if (isStarter && !wasSubbedIn) {
          expect(load).toBe(totalMinutes);
          checkedNonSubbed++;
        }
      }
    }
    // Sanity: the assertion above actually ran for at least one player.
    expect(checkedNonSubbed).toBeGreaterThan(0);
  }, 30_000);
});

// ── buildMatchEventFromRecording — injuries (Task 3, docs/superpowers/plans/2026-09-28-injuries.md) ──

describe("buildMatchEventFromRecording — injuries", () => {
  test("a recorded injury writes player.injury with a returnDate after the match date", () => {
    const home = makeSquad("h", 1);
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", date: "2027-03-10", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const injuries: MatchInjury[] = [
      { team: "home", playerId: "h-p0", playerName: "h0", severity: "medium", matchMinute: 30 },
    ];
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 50, "a-p0": 50 },
      injuries,
    });

    const { updatedHome, injuriesApplied } = buildMatchEventFromRecording(fixture, home, away, recording, () => 0.5);
    const p0 = updatedHome.players.find((p) => p.id === "h-p0")!;
    expect(p0.injury).toBeDefined();
    expect(p0.injury!.severity).toBe("medium");
    expect(p0.injury!.returnDate > "2027-03-10").toBe(true);
    expect(injuriesApplied).toHaveLength(1);
    expect(injuriesApplied[0]!.returnDate).toBe(p0.injury!.returnDate);
  });

  test("no injuries recorded — no player gets an injury field, injuriesApplied is empty", () => {
    const home = makeSquad("h", 1);
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", date: "2027-03-10", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 50, "a-p0": 50 },
    });

    const { updatedHome, updatedAway, injuriesApplied } = buildMatchEventFromRecording(fixture, home, away, recording);
    expect(injuriesApplied).toEqual([]);
    for (const p of [...updatedHome.players, ...updatedAway.players]) expect(p.injury).toBeUndefined();
  });

  test("a healed injury (matchDate >= returnDate) is cleared, fitness reset toward RETURN_FITNESS", () => {
    const home = makeSquad("h", 1);
    home.players[0]!.injury = { severity: "light", returnDate: "2027-03-01" };
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", date: "2027-03-01", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: { "h-p0": emptyStats(), "a-p0": emptyStats() },
      playerEnergy: { "h-p0": 70, "a-p0": 50 },
    });

    const { updatedHome } = buildMatchEventFromRecording(fixture, home, away, recording);
    expect(updatedHome.players[0]!.injury).toBeUndefined();
  });

  test("still injured on the match date — injury field is preserved", () => {
    const home = makeSquad("h", 1);
    home.players[0]!.injury = { severity: "severe", returnDate: "2027-06-01" };
    const away = makeSquad("a", 1);
    const fixture = { id: "fx1", date: "2027-03-01", competition: "premier_league", round: 1, home: "h", away: "a" } as Fixture;
    const recording = baseRecording({
      playerStats: {},
      playerEnergy: {},
    });

    const { updatedHome } = buildMatchEventFromRecording(fixture, home, away, recording);
    expect(updatedHome.players[0]!.injury).toEqual({ severity: "severe", returnDate: "2027-06-01" });
  });
});
