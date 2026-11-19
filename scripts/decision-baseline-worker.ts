/** Worker for `decision-baseline.ts`: seeded full-engine matches of one league with the decision telemetry listening. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import { gameBus, type DecisionTelemetryEvent } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionTelemetry } from "@/GameEngine/Domain/Statistics";
import { DECISION_TELEMETRY } from "@/GameEngine/Configs/DecisionConfig";

interface Input { league: string; matches: number; offset: number; seed: number; off: boolean; mental?: { A?: number; B?: number }; same?: boolean }

export const HIST_BIN = 0.5;
export const HIST_BINS = 400;

type Family = DecisionTelemetryEvent["family"];
export interface FamilyTally {
  n: number;
  nearTies: number;
  offArgmax: number;
  mix: Record<string, number>;
  /** bucket → action → count. */
  buckets: Record<string, number>[];
}
export interface BaselineTotals {
  n: number;
  goals: number;
  shots: number;
  ms: number;
  families: Record<Family, FamilyTally>;
  /** Histograms (bin HIST_BIN) of the holder pressure at decisions and at shots; last bin = overflow. */
  holderHist: number[];
  shotHist: number[];
  /** Sum over teams and matches of the per-match bucket-weighted entropy (Statistics), and of the team count. */
  statEntropy: Record<Family, number>;
  teams: number;
  /** Holder mind tallies (team stats summed) and the outcome counters. */
  mind: Record<MindKey, number>;
  xg: number;
  passesAttempted: number;
  passesCompleted: number;
  turnovers: number;
  /** Release-gate rate by pressure bucket (pN deciles): decisions and releases. */
  relByP: number[];
  decByP: number[];
  lapseDecisions?: number;
  releasedPick?: Record<string, number>;
}
export const MIND_KEYS = ["holderMindDecisions", "holderOffArgmax", "holderWindows", "holderLapses", "holderReleases",
  "holderHighPressure", "holderReleasesHigh", "holderPanics", "holderSimple",
  "moveShield", "moveShieldHeld", "moveCutInside", "moveLayOff", "moveChip", "moveChipGoals", "moveRound", "moveRoundWon"] as const;
export type MindKey = (typeof MIND_KEYS)[number];

const emptyFamily = (): FamilyTally => ({ n: 0, nearTies: 0, offArgmax: 0, mix: {}, buckets: Array.from({ length: 12 }, () => ({})) });

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, matches, offset, seed, off, mental, same } = e.data;
  const squads = loadLeagueAt88(league);
  const t: BaselineTotals = {
    n: 0, goals: 0, shots: 0, ms: 0,
    families: { holder: emptyFamily(), offBall: emptyFamily(), defense: emptyFamily() },
    holderHist: new Array(HIST_BINS + 1).fill(0), shotHist: new Array(HIST_BINS + 1).fill(0),
    statEntropy: { holder: 0, offBall: 0, defense: 0 }, teams: 0,
    mind: Object.fromEntries(MIND_KEYS.map(k => [k, 0])) as Record<MindKey, number>,
    xg: 0, passesAttempted: 0, passesCompleted: 0, turnovers: 0,
    relByP: new Array(8).fill(0), decByP: new Array(8).fill(0),
  };
  const wins = { A: 0, D: 0, B: 0 };
  (t as BaselineTotals & { wins?: typeof wins }).wins = wins;
  const bin = (p: number) => Math.min(HIST_BINS, Math.floor(p / HIST_BIN));
  let lastHolder: { id: number; p: number } | null = null;
  const unsubs: (() => void)[] = [];
  setDecisionTelemetry(!off);
  if (!off) {
    const onDec = (ev: DecisionTelemetryEvent) => {
      const f = t.families[ev.family];
      f.n++;
      if (ev.margin < DECISION_TELEMETRY.NEAR_TIE) f.nearTies++;
      if (ev.argmax !== ev.chosen) f.offArgmax++;
      f.mix[ev.chosen] = (f.mix[ev.chosen] ?? 0) + 1;
      const b = f.buckets[ev.bucket]!;
      b[ev.chosen] = (b[ev.chosen] ?? 0) + 1;
      if (ev.family === "holder") { t.holderHist[bin(ev.pressure)]!++; lastHolder = { id: ev.playerId, p: ev.pressure }; }
    };
    unsubs.push(gameBus.on("holderDecision", onDec), gameBus.on("offBallDecision", onDec), gameBus.on("defensiveDecision", onDec));
    unsubs.push(gameBus.on("shot", (s) => { if (lastHolder && lastHolder.id === s.player) t.shotHist[bin(lastHolder.p)]!++; lastHolder = null; }));
    unsubs.push(gameBus.on("foul", () => { lastHolder = null; }));
  }
  unsubs.push(gameBus.on("holderMind", (m) => {
    // Raw-P bands 0–9, 10–19, 20–29, 30–39, 40–79, ≥80 (FM27 calibration), then n = 0 and n ≥ 1 open options.
    const i = m.pressure < 10 ? 0 : m.pressure < 20 ? 1 : m.pressure < 30 ? 2 : m.pressure < 40 ? 3 : m.pressure < 80 ? 4 : 5;
    const j = m.openOptions === 0 ? 6 : 7;
    for (const k of [i, j]) { t.decByP[k]!++; if (m.release) t.relByP[k]!++; }
    t.lapseDecisions = (t.lapseDecisions ?? 0) + (m.lapse ? 1 : 0);
    if (m.release) { t.releasedPick = t.releasedPick ?? {}; t.releasedPick[m.picked] = (t.releasedPick[m.picked] ?? 0) + 1; }
  }));
  const realRandom = Math.random;
  for (let m = 0; m < matches; m++) {
    const pair = pairAt(squads, offset + m);
    const home = pair.home;
    const away = same ? pair.home : pair.away;
    const date = pair.date;
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    const lH = autoLineupForFormationWithFitness(home, fH, date);
    const lA = autoLineupForFormationWithFitness(away, fA, date);
    Math.random = mulberry32(seed + offset + m);
    const t0 = performance.now();
    // Same club both sides (M4): the mental override swaps sides every other match so home advantage cancels.
    const flip = same && (offset + m) % 2 === 1;
    const mo = mental ? (flip ? { A: mental.B, B: mental.A } : mental) : undefined;
    const r = simulateMatch(home, away, fH, fA, lH, lA, { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, ...(mo ? { mental: mo } : {}) });
    t.ms += performance.now() - t0;
    Math.random = realRandom;
    t.n++;
    t.goals += r.score.A + r.score.B;
    {
      const [gx, gy] = flip ? [r.score.B, r.score.A] : [r.score.A, r.score.B];
      if (gx > gy) wins.A++; else if (gx < gy) wins.B++; else wins.D++;
    }
    for (const [side, opp] of [[r.teamStats.A, r.teamStats.B], [r.teamStats.B, r.teamStats.A]] as const) {
      for (const k of MIND_KEYS) t.mind[k] += side[k] ?? 0;
      t.xg += side.xg;
      t.passesAttempted += side.passesAttempted;
      t.passesCompleted += side.passesCompleted;
      t.turnovers += side.passesFailed + side.dribblesLost + side.throughBallsLostInFlight + side.throughBallsLostInRace
        + side.throughBallsLostInDuel + opp.tackles + opp.interceptions;
    }
    for (const side of [r.teamStats.A, r.teamStats.B]) {
      t.shots += side.shots;
      t.statEntropy.holder += side.holderEntropy;
      t.statEntropy.offBall += side.offBallEntropy;
      t.statEntropy.defense += side.defenseEntropy;
      t.teams++;
    }
  }
  for (const u of unsubs) u();
  postMessage(t);
};
