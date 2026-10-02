#!/usr/bin/env bun
/**
 * Byline diagnostic (#42) — how often the ball carrier sits on the goal line
 * (within 3 yds of the end line he attacks) outside the posts' y-range, and how
 * many of those ticks the carrier moved mostly along the line.
 *
 * Usage: bun scripts/byline-diagnostic.ts [league=premier_league] [matches=100]
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tickState, createMatchState } from "@/GameEngine/Domain/gameState";
import { initStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import { initRatings } from "@/GameEngine/Domain/PlayerRating";
import { evaluateAiSubstitutions, shouldCheckAiSubs } from "@/GameEngine/Domain/AiSubstitution";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import { PITCH_LENGTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import "@/GameEngine/Domain/Statistics";
import "@/GameEngine/Domain/PlayerRating";

const args = process.argv.slice(2);
const league = args[0] ?? "premier_league";
const MATCHES = Number(args[1] ?? 100);
const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const squads: Squad[] = await Promise.all(files.map((f) => Bun.file(dir + f).json()));
const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);

let goals = 0, shots = 0, onLine = 0, slide = 0, holderTicks = 0;
const byDec: Record<string, number> = {};
// Shots by distance from the end line (shooter position at the kick).
const shotBins: Record<string, { n: number; g: number; xg: number }> = {};
let lastShot: { fromX: number; dir: number } | null = null;
gameBus.on("shotResolved", (e) => {
  if (!lastShot) return;
  const d = lastShot.dir === 1 ? PITCH_LENGTH - lastShot.fromX : lastShot.fromX;
  const k = d < 3 ? "<3" : d < 8 ? "3-8" : d < 18 ? "8-18" : "18+";
  const b = (shotBins[k] ??= { n: 0, g: 0, xg: 0 });
  b.n++; b.xg += e.xg; if (e.isGoal) b.g++;
});
const t0 = performance.now();
for (let m = 0; m < MATCHES; m++) {
  const home = squads[(m * 2) % squads.length]!;
  const away = squads[(m * 2 + 1 + Math.floor(m / squads.length)) % squads.length]!;
  let s: GameState = {
    ...createMatchState(home.players, formation, away.players, formation,
      autoLineupForFormation(home, formation), autoLineupForFormation(away, formation)),
    matchPhase: "firstHalf", presentationCountdown: 0,
  };
  initStats(s.players.map((p) => ({ id: p.id, team: p.team })));
  initRatings(s.players.map((p) => p.id));
  let ticks = 0;
  while (s.matchPhase !== "matchEnd" && ticks < 2_000_000) {
    if (s.presentationCountdown > 0) s = { ...s, presentationCountdown: 0 };
    if (s.matchPhase === "secondHalf" && shouldCheckAiSubs(s.matchTime, 0.2 * (2700 / 150))) {
      const subsA = evaluateAiSubstitutions(s, "A");
      if (subsA.length > 0) s = { ...s, pendingSubsA: [...s.pendingSubsA, ...subsA] };
    }
    const prev = s;
    s = tickState(s, 0.2).state;
    ticks++;
    if (s.shot && !prev.shot) lastShot = { fromX: s.shot.fromX, dir: s.players.find((p) => p.id === s.shot!.shooterId)!.attackDir };
    if (s.pass || s.shot || s.looseBall || s.ballHolderId == null) continue;
    const h = s.players.find((p) => p.id === s.ballHolderId)!;
    holderTicks++;
    const endX = h.attackDir === 1 ? PITCH_LENGTH : 0;
    const d = (endX - h.x) * h.attackDir;
    if (d < 3 && (h.y < GOAL_Y_MIN || h.y > GOAL_Y_MAX)) {
      onLine++;
      const t = prev.decisions[h.id]?.type ?? "none";
      byDec[t] = (byDec[t] ?? 0) + 1;
      const ph = prev.players.find((p) => p.id === h.id);
      if (ph && prev.ballHolderId === h.id && Math.abs(h.y - ph.y) > 2 * Math.abs(h.x - ph.x) && Math.abs(h.y - ph.y) > 0.05) slide++;
    }
  }
  goals += s.score.A + s.score.B;
  for (const t of ["A", "B"] as const) shots += getTeamStats(t).shots;
}
const f = (x: number, d = 2) => x.toFixed(d);
console.log(`${league}: ${MATCHES} matches in ${f((performance.now() - t0) / 1000, 1)} s`);
console.log(`goals/match ${f(goals / MATCHES)}  shots/match ${f(shots / MATCHES)}`);
console.log(`on-line holder ticks/match ${f(onLine / MATCHES)}  sliding ticks/match ${f(slide / MATCHES)}  (holder ticks/match ${f(holderTicks / MATCHES, 0)})`);
console.log("decision driving on-line ticks:", Object.fromEntries(Object.entries(byDec).map(([k, v]) => [k, f(v / MATCHES)])));
console.log("shots by yds from end line (per match n / goals / mean xG):", Object.fromEntries(Object.entries(shotBins).map(([k, b]) => [k, `${f(b.n / MATCHES)} / ${f(b.g / MATCHES)} / ${f(b.xg / Math.max(1, b.n))}`])));
