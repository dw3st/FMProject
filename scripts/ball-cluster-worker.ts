/** Worker for `ball-cluster.ts`: full-engine matches of one league, one mode, with the per-tick cluster sample. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { getBallPos, isLivePhase } from "@/GameEngine/Domain/gameState";
import { outfieldNearBall, defensiveHole } from "@/GameEngine/Domain/BallCluster";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { loadLeagueAt88, pairAt, type Mode } from "@/../scripts/ai-formation-goals-shared";
import { emptyClusterTotals, type ClusterTotals } from "@/../scripts/ball-cluster-shared";
import type { GameState, TeamId } from "@/GameEngine/types";

interface Input { league: string; mode: Mode; matches: number; offset: number }

function sample(t: ClusterTotals, s: GameState): void {
  if (!isLivePhase(s.matchPhase) || s.setPiece || s.varReview || s.shot) return;
  const holder = s.players.find((p) => p.id === s.ballHolderId);
  if (!holder) return;
  const att: TeamId = holder.team;
  const def: TeamId = att === "A" ? "B" : "A";
  const ball = getBallPos(s);
  const nd = outfieldNearBall(s.players, def, ball);
  const na = outfieldNearBall(s.players, att, ball);
  t.ticks++;
  t.defNear += nd.length; t.attNear += na.length;
  t.defHist[Math.min(6, nd.length)]!++;
  t.attHist[Math.min(6, na.length)]!++;
  if (s.looseBall || s.pass) {
    if (s.looseBall) t.looseTicks++;
    t.looseDefHist[Math.min(6, nd.length)]!++;
    let ch = 0;
    for (const p of s.players) if (s.decisions[p.id]?.type === "chase_loose_ball") ch++;
    t.chaseHist[Math.min(6, ch)]!++;
  } else {
    t.heldDefHist[Math.min(6, nd.length)]!++;
    let stale = 0;
    for (const p of s.players) if (s.decisions[p.id]?.type === "chase_loose_ball") stale++;
    t.staleHist[Math.min(6, stale)]!++;
    if (nd.length >= 3) for (const p of nd) {
      const k = `${p.role}:${s.decisions[p.id]?.type ?? "none"}`;
      t.heldDefDec[k] = (t.heldDefDec[k] ?? 0) + 1;
    }
  }
  const hole = defensiveHole(s.players, def, ball);
  t.gap += hole.maxGap; t.open += hole.openCells;
  const bucket = nd.length >= 4 ? "c4" : nd.length === 3 ? "c3" : "c0";
  t.gapBy[bucket].n++; t.gapBy[bucket].gap += hole.maxGap; t.gapBy[bucket].open += hole.openCells;
  if (nd.length >= 3) for (const p of nd) {
    const d = s.decisions[p.id]?.type ?? "none";
    const k = `${p.role}:${d}`;
    t.defDec[k] = (t.defDec[k] ?? 0) + 1;
    t.defDecType[d] = (t.defDecType[d] ?? 0) + 1;
  }
  if (na.length >= 3) for (const p of na) {
    const d = p.id === s.ballHolderId ? "holder" : (s.decisions[p.id]?.type ?? "none");
    t.attDecType[d] = (t.attDecType[d] ?? 0) + 1;
  }
  let presses = 0;
  for (const p of s.players) if (p.team === def && s.decisions[p.id]?.type === "press") presses++;
  t.pressHist[Math.min(5, presses)]!++;
}

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, mode, matches, offset } = e.data;
  const squads = loadLeagueAt88(league);
  const t = emptyClusterTotals();
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(home, away, date).formation;
    const fA = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(away, home, date).formation;
    const r = simulateMatch(home, away, fH, fA,
      autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
      { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, onTick: (s) => sample(t, s) });
    t.n++;
    for (const k of ["A", "B"] as const) {
      const ts = r.teamStats[k];
      t.goals += ts.goals; t.shots += ts.shots; t.passes += ts.passesAttempted; t.tackles += ts.tackles;
      t.fouls += ts.fouls; t.interceptions += ts.interceptions;
    }
  }
  postMessage(t);
};
