/** Worker for `fm-targets.ts`: seeded full-engine matches (`simulateMatch(..., { seed })`) of one league with the FM target collector on every tick. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { FM_COUNT_KEYS, addShotEnd, addShotXg, emptyFmTargets, fmCountsOf, fmTargetCollector, type FmMatchCounts, type FmTargetTotals } from "@/lab/fmTargets";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";

interface Input { league: string; matches: number; offset: number; seed: number }
export interface FmWorkerOut { fm: FmTargetTotals; world: Record<string, number>; counts: FmMatchCounts; ms: number }

const WORLD_KEYS = ["goals", "shots", "xg", "passesAttempted", "passesCompleted", "tackles", "fouls", "interceptions", "crosses", "throughBallsAttempted", "throughBallsCompleted", "throughBallsLostInFlight", "throughBallsLostInRace", "throughBallsLostInDuel", "ballNearTicks", "ballCrowdTicks", "highlightsMain", "highlightsExtended", "highlightsFull", "highlightSecondsMain", "highlightSecondsExtended", "highlightSecondsFull", "aiSubstitutions", "tacticalSubstitutions", "aiSubMinuteSum", "aiSubConditionSum", "cutTouches", "cutControls", "cutClears", "cutDeflects", "cutMisses", "cutSpeedSum", "holderChoices", "holderStints", "holderCandidatesSum", "holderVetoedSum", "holderLapseChoices", "holderSprints", "holderBylines", "holderSpins", "holderFlagHolds", "shadowPresses", "zoneCovers", "shoulderRuns", "shoulderRunsEarly", "pressStateOwnS", "pressStateMidS", "pressStateFinalS", "crossesCompleted", "longBalls", "longBallsCompleted", "passHigh", "highBalls", "aerialDuels", "airCrosses", "airCrossMetAir", "airCrossMetLow", "airCrossUnmet", "airCrossOwn", "airCrossDef", "airCrossKeeper", "airCrossZSum", "headWonDef", "headWonMid", "headWonFwd", "headAttDef", "headAttMid", "headAttFwd", "keeperComeOuts", "keeperCollects", "keeperFeetWins", "boxHighBalls", "boxHighKeeper", "boxHighDef", "boxHighAtt", "keeperClaims", "keeperPunches"] as const;

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, matches, offset, seed } = e.data;
  const squads = loadLeagueAt88(league);
  const fm = emptyFmTargets();
  // Stage 6 (`xg.md`): every shot's xG (open play, headers, free kicks, penalties) for the median.
  gameBus.on("shot", ev => addShotXg(fm, ev.xg));
  // Stage 7 (`shot-and-save.md`): where each physical shot ended, by its distance.
  const shotDist = new Map<number, number>();
  gameBus.on("shotLaunched", ev => { shotDist.set(ev.player, ev.distance); });
  const end = (player: number, e: "goal" | "saved" | "blocked" | "off") => {
    const d = shotDist.get(player);
    if (d === undefined) return;
    shotDist.delete(player);
    addShotEnd(fm, d, e);
  };
  gameBus.on("shotBlocked", ev => end(ev.player, "blocked"));
  gameBus.on("shotResolved", ev => end(ev.player, ev.isGoal ? "goal" : ev.outcome === "saved" ? "saved" : "off"));
  const world: Record<string, number> = Object.fromEntries(WORLD_KEYS.map(k => [k, 0]));
  const counts = Object.fromEntries(FM_COUNT_KEYS.map(k => [k, 0])) as unknown as FmMatchCounts;
  let ms = 0;
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    const lH = autoLineupForFormationWithFitness(home, fH, date);
    const lA = autoLineupForFormationWithFitness(away, fA, date);
    const col = fmTargetCollector(fm);
    const t0 = performance.now();
    const r = simulateMatch(home, away, fH, fA, lH, lA, { seed: (seed + offset + m) >>> 0, tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, onTick: col.tick });
    ms += performance.now() - t0;
    col.finish();
    const c = fmCountsOf({ ...r.teamStats.A, goals: r.score.A }, { ...r.teamStats.B, goals: r.score.B });
    for (const k of FM_COUNT_KEYS) counts[k] = (counts[k] ?? 0) + (c[k] ?? 0);
    world.goals! += r.score.A + r.score.B;
    world.liveSeconds = (world.liveSeconds ?? 0) + r.liveSeconds;
    for (const side of [r.teamStats.A, r.teamStats.B]) {
      for (const k of WORLD_KEYS) if (k !== "goals") world[k]! += (side as unknown as Record<string, number>)[k] ?? 0;
    }
  }
  postMessage({ fm, world, counts, ms } satisfies FmWorkerOut);
};
