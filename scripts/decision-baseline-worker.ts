/** Worker for `decision-baseline.ts`: seeded full-engine matches of one league with the decision telemetry listening. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import { gameBus, type DecisionTelemetryEvent } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionTelemetry } from "@/GameEngine/Domain/Statistics";
import { DECISION_TELEMETRY } from "@/GameEngine/Configs/DecisionConfig";

interface Input { league: string; matches: number; offset: number; seed: number; off: boolean }

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
}

const emptyFamily = (): FamilyTally => ({ n: 0, nearTies: 0, offArgmax: 0, mix: {}, buckets: Array.from({ length: 12 }, () => ({})) });

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, matches, offset, seed, off } = e.data;
  const squads = loadLeagueAt88(league);
  const t: BaselineTotals = {
    n: 0, goals: 0, shots: 0, ms: 0,
    families: { holder: emptyFamily(), offBall: emptyFamily(), defense: emptyFamily() },
    holderHist: new Array(HIST_BINS + 1).fill(0), shotHist: new Array(HIST_BINS + 1).fill(0),
    statEntropy: { holder: 0, offBall: 0, defense: 0 }, teams: 0,
  };
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
  const realRandom = Math.random;
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    const lH = autoLineupForFormationWithFitness(home, fH, date);
    const lA = autoLineupForFormationWithFitness(away, fA, date);
    Math.random = mulberry32(seed + offset + m);
    const t0 = performance.now();
    const r = simulateMatch(home, away, fH, fA, lH, lA, { tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
    t.ms += performance.now() - t0;
    Math.random = realRandom;
    t.n++;
    t.goals += r.score.A + r.score.B;
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
