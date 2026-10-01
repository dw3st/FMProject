import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { INJURY } from "@/Domain/injury/injuryConfig";
import { addOneDay } from "@/Domain/advanceDay/date";
import {
  autoLineupDefaultFormation,
  autoLineupDefaultFormationWithFitness,
  resolveUserLineup,
} from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Integration test for the fitness/load model end to end under fixture congestion
 * (`docs/superpowers/specs/2026-09-27-stamina-design.md` §1–2). An AI club (never the player's
 * own club) is forced to play 3 matches inside a 7-day window — day 0, day+3, day+6, via
 * synthetic `cup_*` fixtures written directly with `writeRound`/`writeDateIndex`, same technique
 * as `advanceDay.doubleBooking.test.ts` (a `cup_` prefix makes `advanceOneDay` treat the
 * competition as a knockout with no standings table to maintain).
 *
 * Since the club is never the player's club, every match here runs through quickSim, and quickSim
 * gets its XI from `computeMatchSimulationLineups` → `autoLineupDefaultFormationWithFitness` (the
 * function under test, wired up in Task 5). The plain `autoLineupDefaultFormation` (stat-only,
 * fitness-blind) is used purely as a stable reference lineup to measure the fitness/load trend
 * against — it never changes membership from fatigue on its own.
 */
describe("fitness/load model under fixture congestion", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("fitness drops and load rises match to match, and a starter is rested by the third match", async () => {
    // Injury draws (unseeded Math.random, interleaved across the day's async work) are the only
    // random input that changes this scenario: an injured starter is replaced by a fresh reserve
    // in BOTH selectors, so nobody is left to rest (issue #35). This test is about fitness/load,
    // so injuries are switched off for its duration; injuries have their own tests.
    // INJURY is a readonly const config; the test mutates it through a writable view.
    const injuryCfg = INJURY as { BASE: number; CONTACT_BASE: number; HEAVY_TRAINING_CHANCE: number };
    const savedInjury = { base: INJURY.BASE, contact: INJURY.CONTACT_BASE, training: INJURY.HEAVY_TRAINING_CHANCE };
    injuryCfg.BASE = 0;
    injuryCfg.CONTACT_BASE = 0;
    injuryCfg.HEAVY_TRAINING_CHANCE = 0;
    try {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const d0 = meta.currentDate!;
    const d1 = addOneDay(addOneDay(addOneDay(d0)));
    const d2 = addOneDay(addOneDay(addOneDay(d1)));
    const matchDates = [d0, d1, d2];

    const index = await saveService.getSquadIndex(saveId);

    // Avoid any of_championship club that already has a real fixture on any of our 3 forced
    // match dates — keeps the scenario to exactly 3 matches for clubX, no double-booking noise.
    const busy = new Set<string>();
    for (const date of matchDates) {
      for (const f of await saveService.getFixturesForDate(saveId, date)) {
        busy.add(f.home);
        busy.add(f.away);
      }
    }
    const free = index
      .inLeague("of_championship")
      .map((t) => t.squadId)
      .filter((id) => !busy.has(id));
    const [clubX, oppClub] = free;
    if (!clubX || !oppClub) {
      throw new Error("not enough free of_championship clubs for the test setup");
    }

    const competitions: [string, string][] = [
      ["cup_test_congestion_a", d0],
      ["cup_test_congestion_b", d1],
      ["cup_test_congestion_c", d2],
    ];
    for (const [competition, date] of competitions) {
      const fixture: Fixture = {
        id: `${competition}_f1`, date, competition, round: 1,
        home: clubX, away: oppClub, played: false, result: null,
      };
      await saveService.writeRound(saveId, competition, 1, { leagueSlug: competition, round: 1, fixtures: [fixture] });
      await saveService.writeDateIndex(saveId, competition, { [date]: [1] });
    }

    type Snapshot = { plainXi: string[]; fitnessXi: string[]; avgFitness: number; avgLoad: number; assistantRested: number };

    function snapshotOf(squad: Squad, date: string, playedPrev?: Set<string>): Snapshot {
      const plainXi = autoLineupDefaultFormation(squad, date);
      const fitnessXi = autoLineupDefaultFormationWithFitness(squad, date);
      const byId = new Map(squad.players.map((p) => [p.id, p]));
      const avgFitness =
        plainXi.reduce((sum, id) => sum + (byId.get(id)?.seasonLog?.fitness ?? 75), 0) / plainXi.length;
      // Load trend is measured over the available starters: reference-XI members who actually
      // played the previous match (a starter rested by rotation legitimately sheds load).
      const loadIds = playedPrev ? plainXi.filter((id) => playedPrev.has(id)) : plainXi;
      const avgLoad =
        loadIds.reduce((sum, id) => sum + (byId.get(id)?.seasonLog?.load ?? 0), 0) / Math.max(1, loadIds.length);
      // Human club with the rotation assistant ON and the stat-only XI saved as its lineup.
      const assisted = resolveUserLineup(
        squad, formationForSimId(DEFAULT_SIM_FORMATION_ID), plainXi, date, { assistantRotation: true },
      );
      return { plainXi, fitnessXi, avgFitness, avgLoad, assistantRested: assisted.rotationApplied.length };
    }

    const snapshots: Snapshot[] = [];
    // 7 calendar days: d0 (match 1) .. d0+6 == d2 (match 3).
    for (let day = 0; day < 7; day++) {
      const currentMeta = await saveService.getMeta(saveId);
      const currentDate = currentMeta!.currentDate!;
      if (matchDates.includes(currentDate)) {
        const squad = await saveService.getSquadById(saveId, clubX);
        if (!squad) throw new Error(`clubX squad ${clubX} not found before match day ${currentDate}`);
        const prev = snapshots[snapshots.length - 1];
        snapshots.push(snapshotOf(squad, currentDate, prev ? new Set(prev.fitnessXi) : undefined));
      }

      const outcome = await advanceOneDay(saveService, saveId);
      expect(outcome.ok).toBe(true);
    }

    expect(snapshots).toHaveLength(3);
    const [before1, before2, before3] = snapshots as [Snapshot, Snapshot, Snapshot];

    // Fitness of the stat-only reference XI drops from the fresh pre-congestion baseline (match 1)
    // to match 2 — the 3-day gap is not enough to fully recover from match 1's drain — and stays
    // below that fresh baseline through match 3. (The model's recovery is self-correcting — a
    // bigger fitness deficit recovers a bigger absolute amount per rest day — so match 3 is not
    // guaranteed to be strictly lower than match 2 on every run; what congestion guarantees is
    // that both congested matches sit clearly below the fresh, uncongested starting point.)
    expect(before2.avgFitness).toBeLessThan(before1.avgFitness);
    expect(before3.avgFitness).toBeLessThan(before1.avgFitness);

    // Accumulated load rises match to match (net of the half-life decay between matches) — nothing
    // in this scenario ever fully resets it back to 0.
    expect(before2.avgLoad).toBeGreaterThan(before1.avgLoad);
    expect(before3.avgLoad).toBeGreaterThan(before2.avgLoad);

    // By the third match, the fitness-aware selector rests at least one starter the plain,
    // stat-only selector would still start.
    const restedSomeone = before3.plainXi.some((id, i) => id !== before3.fitnessXi[i]);
    expect(restedSomeone).toBe(true);
    // Same for a human club with the assistant on: at least one starter rested by match 3.
    expect(before3.assistantRested).toBeGreaterThanOrEqual(1);
    } finally {
      injuryCfg.BASE = savedInjury.base;
      injuryCfg.CONTACT_BASE = savedInjury.contact;
      injuryCfg.HEAVY_TRAINING_CHANCE = savedInjury.training;
    }
  }, 90_000);
});
