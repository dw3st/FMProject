#!/usr/bin/env bun
/**
 * Passing-mix diagnostic — measures how ball holders of each line (GK/DEF/MID/FWD)
 * distribute their on-ball actions over headless full-engine matches.
 *
 * Usage:
 *   bun scripts/passing-mix-diagnostic.ts [league=premier_league] [matches=100] [--scores]
 *
 * Reports per match:
 *   - goals, shots, pass completion, through balls
 *   - per player of each line: regular passes, through balls, shots, dribbles
 *   - decision ticks by line (which action the holder was executing each tick)
 * With --scores (debug mode on; slower) it also reports the mean compressed action
 * scores (pass / through ball / carry / shoot / dribble) for holders of each line
 * and how often each action won.
 *
 * Runs the same loop as `simulateMatch`, but keeps the per-tick state so the
 * holder decision mix can be sampled.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tickState, createMatchState } from "@/GameEngine/Domain/gameState";
import { initStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import { initRatings } from "@/GameEngine/Domain/PlayerRating";
import { evaluateAiSubstitutions, shouldCheckAiSubs } from "@/GameEngine/Domain/AiSubstitution";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDebugMode } from "@/GameEngine/Suport/DebugLog";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";
import "@/GameEngine/Domain/Statistics";
import "@/GameEngine/Domain/PlayerRating";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const league = args[0] ?? "premier_league";
const MATCHES = Number(args[1] ?? 100);
const WITH_SCORES = process.argv.includes("--scores");

type Line = "GK" | "DEF" | "MID" | "FWD";
const LINES: Line[] = ["GK", "DEF", "MID", "FWD"];
const LINE_OF: Record<string, Line> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", DM: "MID", CM: "MID", CAM: "MID", AM: "MID", LM: "MID", RM: "MID",
  LW: "FWD", RW: "FWD", ST: "FWD", CF: "FWD",
};

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads: Squad[] = await Promise.all(files.map((f) => Bun.file(`${dir}${f}`).json() as Promise<Squad>));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

// ── Accumulators ─────────────────────────────────────────────────────────────
const perLine = <T>(f: () => T) => ({ GK: f(), DEF: f(), MID: f(), FWD: f() }) as Record<Line, T>;
const ev = perLine(() => ({ pass: 0, passDone: 0, tb: 0, tbDone: 0, shot: 0, dribble: 0, playerMatches: 0 }));
const decTicks = perLine(() => ({} as Record<string, number>));
const scoreSum = perLine(() => ({ n: 0, pass: 0, throughBall: 0, carry: 0, shoot: 0, dribble: 0, wins: {} as Record<string, number> }));
/** Mean raw components of the best pass / best carry lane / best TB cell (debug only). */
const rawSum = perLine(() => ({
  n: 0, passRaw: 0, lane: 0, progress: 0, space: 0, goal: 0, dist: 0, vis: 0, mod: 0,
  carryN: 0, carryRaw: 0, tbN: 0, tbRaw: 0,
}));
let goals = 0, shots = 0, passAtt = 0, passDone = 0, passFail = 0, tbs = 0, tbDone = 0;

let roleOf = new Map<number, Line>();
const lineOf = (id: number): Line | undefined => roleOf.get(id);

gameBus.on("passAttempted", (e) => { const l = lineOf(e.player); if (l) ev[l].pass++; });
/** Completed regular passes: passer line → receiver line. */
const passMatrix = perLine(() => perLine(() => 0));
gameBus.on("passCompleted", (e) => {
  const l = lineOf(e.player);
  if (l) ev[l].passDone++;
  const r = lineOf(e.toId);
  if (l && r) passMatrix[l][r]++;
});
gameBus.on("throughBallStarted", (e) => { const l = lineOf(e.player); if (l) ev[l].tb++; });
gameBus.on("throughBallCompleted", (e) => { const l = lineOf(e.player); if (l) ev[l].tbDone++; });
gameBus.on("shot", (e) => { const l = lineOf(e.player); if (l) ev[l].shot++; });
gameBus.on("dribble", (e) => { const l = lineOf(e.player); if (l) ev[l].dribble++; });
gameBus.on("playerSubstituted", () => { /* roleOf refreshed each tick below */ });
if (WITH_SCORES) {
  gameBus.on("decisionScores", (e) => {
    const l = lineOf(e.playerId);
    if (!l) return;
    const a = scoreSum[l];
    a.n++;
    a.pass += e.pass; a.throughBall += e.throughBall; a.carry += e.carry; a.shoot += e.shoot; a.dribble += e.dribble;
    a.wins[e.best] = (a.wins[e.best] ?? 0) + 1;
    const r = rawSum[l];
    const pb = e.breakdowns.pass;
    r.n++;
    r.passRaw += pb.rawScore; r.lane += pb.laneScore; r.progress += pb.progressScore; r.space += pb.receiverSpaceScore;
    r.goal += pb.goalProximityBonus; r.dist += pb.distancePenalty; r.vis += pb.visionRangePenalty; r.mod += pb.playerModifier;
    if (e.breakdowns.carry) { r.carryN++; r.carryRaw += e.breakdowns.carry.score; }
  });
  gameBus.on("throughBallScores", (e) => {
    const l = lineOf(e.playerId);
    if (!l || e.cells.length === 0) return;
    rawSum[l].tbN++; rawSum[l].tbRaw += e.bestScore;
  });
  setDebugMode(true);
}

const t0 = performance.now();
for (let m = 0; m < MATCHES; m++) {
  const home = squads[(m * 2) % squads.length]!;
  const away = squads[(m * 2 + 1 + Math.floor(m / squads.length)) % squads.length]!;
  const hl = autoLineupDefaultFormation(home);
  const al = autoLineupDefaultFormation(away);
  let s: GameState = {
    ...createMatchState(home.players, formation, away.players, formation, hl, al),
    matchPhase: "firstHalf",
    presentationCountdown: 0,
  };
  initStats(s.players.map((p) => ({ id: p.id, team: p.team })));
  initRatings(s.players.map((p) => p.id));
  roleOf = new Map(s.players.map((p) => [p.id, LINE_OF[p.role] ?? "MID"]));
  for (const p of s.players) ev[LINE_OF[p.role] ?? "MID"].playerMatches++;

  let ticks = 0;
  while (s.matchPhase !== "matchEnd" && ticks < 2_000_000) {
    if (s.presentationCountdown > 0) s = { ...s, presentationCountdown: 0 };
    if (s.matchPhase === "secondHalf" && shouldCheckAiSubs(s.matchTime, 0.2 * (2700 / 150))) {
      const subsA = evaluateAiSubstitutions(s, "A");
      if (subsA.length > 0) s = { ...s, pendingSubsA: [...s.pendingSubsA, ...subsA] };
    }
    s = tickState(s, 0.2).state;
    ticks++;
    for (const p of s.players) if (!roleOf.has(p.id)) roleOf.set(p.id, LINE_OF[p.role] ?? "MID");
    if (!s.pass && !s.shot && !s.looseBall && s.ballHolderId != null) {
      const holder = s.players.find((p) => p.id === s.ballHolderId);
      const dec = s.decisions[s.ballHolderId];
      if (holder && dec) {
        const l = LINE_OF[holder.role] ?? "MID";
        decTicks[l][dec.type] = (decTicks[l][dec.type] ?? 0) + 1;
      }
    }
  }
  goals += s.score.A + s.score.B;
  for (const t of ["A", "B"] as const) {
    const ts = getTeamStats(t);
    shots += ts.shots; passAtt += ts.passesAttempted; passDone += ts.passesCompleted; passFail += ts.passesFailed;
    tbs += ts.throughBallsAttempted; tbDone += ts.throughBallsCompleted;
  }
}
const secs = (performance.now() - t0) / 1000;

// ── Report ───────────────────────────────────────────────────────────────────
const f = (x: number, d = 2) => x.toFixed(d);
console.log(`\n${league}: ${MATCHES} matches in ${f(secs, 1)} s`);
console.log(`goals/match ${f(goals / MATCHES)}  shots/match ${f(shots / MATCHES)}  passes/match ${f(passAtt / MATCHES, 1)}  ` +
  `pass completion ${f((100 * passDone) / Math.max(1, passAtt), 1)}%  (failed ${f(passFail / MATCHES, 1)})  ` +
  `TB/match ${f(tbs / MATCHES, 1)}  TB completion ${f((100 * tbDone) / Math.max(1, tbs), 1)}%`);

console.log(`\nPer player per match (starters' slots):`);
console.log(`line   passes  pass%   TB     TB%    shots  dribbles`);
for (const l of LINES) {
  const e = ev[l];
  const n = Math.max(1, e.playerMatches);
  console.log(`${l.padEnd(5)}  ${f(e.pass / n).padStart(6)}  ${f((100 * e.passDone) / Math.max(1, e.pass), 0).padStart(4)}%  ` +
    `${f(e.tb / n).padStart(5)}  ${f((100 * e.tbDone) / Math.max(1, e.tb), 0).padStart(4)}%  ${f(e.shot / n).padStart(5)}  ${f(e.dribble / n).padStart(6)}`);
}

console.log(`\nCompleted passes per match, passer line (rows) → receiver line (cols):`);
console.log(`       ${LINES.map((l) => l.padStart(6)).join("")}`);
for (const l of LINES) console.log(`${l.padEnd(5)}  ${LINES.map((r) => f(passMatrix[l][r] / MATCHES).padStart(6)).join("")}`);

console.log(`\nHolder decision ticks (share of ball-held ticks per line):`);
for (const l of LINES) {
  const d = decTicks[l];
  const tot = Object.values(d).reduce((a, b) => a + b, 0) || 1;
  const parts = Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f((100 * v) / tot, 1)}%`);
  console.log(`${l.padEnd(5)} (${tot} ticks): ${parts.join("  ")}`);
}

if (WITH_SCORES) {
  console.log(`\nMean compressed action scores for holders (debug decisionScores):`);
  for (const l of LINES) {
    const a = scoreSum[l];
    const n = Math.max(1, a.n);
    const wins = Object.entries(a.wins).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${f((100 * v) / n, 1)}%`).join("  ");
    console.log(`${l.padEnd(5)} n=${a.n}  pass ${f(a.pass / n)}  tb ${f(a.throughBall / n)}  carry ${f(a.carry / n)}  ` +
      `shoot ${f(a.shoot / n)}  dribble ${f(a.dribble / n)}  | best: ${wins}`);
  }
  console.log(`
Mean RAW scores (pass = best receiver; carry/TB only when a candidate exists):`);
  for (const l of LINES) {
    const r = rawSum[l];
    const n = Math.max(1, r.n);
    console.log(`${l.padEnd(5)} pass raw ${f(r.passRaw / n)} [lane ${f(r.lane / n)} prog ${f(r.progress / n)} space ${f(r.space / n)} ` +
      `goal ${f(r.goal / n)} dist ${f(r.dist / n)} vis ${f(r.vis / n)} mod ${f(r.mod / n)}]  ` +
      `carry raw ${f(r.carryRaw / Math.max(1, r.carryN))} (${f((100 * r.carryN) / n, 0)}% avail)  ` +
      `TB raw ${f(r.tbRaw / Math.max(1, r.tbN))} (${f((100 * r.tbN) / n, 0)}% avail)`);
  }
}
