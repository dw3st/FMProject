import { describe, expect, test } from "bun:test";
import {
  buildMatchEvent,
  buildMatchEventFromRecording,
  computeMinutesPlayed,
  type PlayedMatchRecording,
} from "@/Domain/advanceDay/matches";
import { addMatchLoad, postMatchFitness } from "@/Domain/fitness/fitness";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchPlayerStats } from "@/types/dayLogTypes";
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

  test("unordered substitution input is sorted before processing", () => {
    const minutes = computeMinutesPlayed(
      ["a", "b", "c"],
      [
        { playerOutId: "b", playerInId: "c", matchMinute: 75 },
        { playerOutId: "a", playerInId: "b", matchMinute: 45 },
      ],
      90,
    );
    expect(minutes).toEqual({ a: 45, b: 30, c: 15 });
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
    expect(p0.seasonLog!.load).toBe(addMatchLoad(40, 70)); // pre-existing load + minutes played
    expect(p1.seasonLog!.load).toBe(20); // came on at minute 70, fresh load
    expect(a0.seasonLog!.load).toBe(90); // no substitutions on this side — full match
  });

  test("a player who did not play keeps fitness and load untouched", () => {
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
    expect(bench.seasonLog!.fitness).toBe(77);
    expect(bench.seasonLog!.load).toBe(15);
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
    const fixture = { id: "fx1", competition: "premier_league", round: 1, home: home.id, away: away.id } as Fixture;

    const { event, updatedHome, updatedAway } = buildMatchEvent(fixture, home, away, {
      homeFormation: formation, homeLineup, awayFormation: formation, awayLineup,
    });

    // Mirrors `totalMatchMinutes` in matches.ts — stoppage-time substitutions push the real
    // match length past 90/120.
    const totalMinutes = event.substitutions.reduce(
      (m, s) => Math.max(m, s.matchMinute),
      event.decider ? 120 : 90,
    );
    const subbedOutIds = new Set(event.substitutions.map((s) => s.playerOutId));
    let checkedNonSubbed = 0;

    for (const p of [...updatedHome.players, ...updatedAway.players]) {
      const ps = event.playerStats[p.id];
      if (!ps) {
        // Never on the pitch — untouched by the match.
        expect(p.seasonLog?.load ?? 0).toBe(0);
        continue;
      }
      const fitness = p.seasonLog!.fitness;
      expect(Number.isInteger(fitness)).toBe(true);
      expect(fitness).toBeGreaterThanOrEqual(0);
      expect(fitness).toBeLessThanOrEqual(100);

      const load = p.seasonLog!.load ?? 0;
      // A player subbed on in the very last instant of the match can legitimately play 0 minutes.
      expect(load).toBeGreaterThanOrEqual(0);
      expect(load).toBeLessThanOrEqual(totalMinutes);

      if (!subbedOutIds.has(p.id)) {
        // Started and finished the match (or came on and was never subbed off again) — a
        // starter who was never substituted plays the full match length.
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
