/**
 * Crowd probe: where and why players bunch up on the pitch. Per live tick, the biggest group of outfield players (both
 * teams) inside `R` yards of one of them; for groups of `MIN`+, the situation (ball state, set-piece phase, zone,
 * distance to the ball) and what each player in the group is doing.
 *
 *   bun scripts/crowd-probe.ts [matches=60] [league=premier_league] [offset=0]
 */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { getBallPos, isLivePhase } from "@/GameEngine/Domain/gameState";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import type { GameState } from "@/GameEngine/types";
let goals = 0, shots = 0, headers = 0;

const R = Number(process.env.CROWD_R ?? 4);
const MIN = Number(process.env.CROWD_MIN ?? 5);
const matches = Number(process.argv[2] ?? 60);
const league = process.argv[3] ?? "premier_league";
const offset = Number(process.argv[4] ?? 0);

let ticks = 0;
const hist: number[] = Array(12).fill(0);
const situ: Record<string, number> = {};
const decs: Record<string, number> = {};
let crowdTicks = 0;
let episodes = 0;
let inEpisode = false;
let longest = 0, run = 0;
const runs: number[] = [];

function bump(o: Record<string, number>, k: string, n = 1) { o[k] = (o[k] ?? 0) + n; }

const away: Record<string, number> = {}; const roles: Record<string, number> = {}; const holderWhere: Record<string, number> = {};
let lastSp = -999;
function sample(s: GameState): void {
  if (!isLivePhase(s.matchPhase) || s.varReview) return;
  if (s.setPiece) { lastSp = s.matchTime; return; }
  if (s.matchTime < lastSp) lastSp = -999; // frozen restart layouts are drawn on purpose
  const out = s.players.filter((p) => p.role !== "GK");
  let best: typeof out = [];
  for (const p of out) {
    const g = out.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= R);
    if (g.length > best.length) best = g;
  }
  ticks++;
  hist[Math.min(11, best.length)]!++;
  if (best.length < MIN) {
    if (inEpisode) { runs.push(run); longest = Math.max(longest, run); }
    inEpisode = false; run = 0;
    return;
  }
  crowdTicks++;
  if (!inEpisode) { episodes++; inEpisode = true; }
  run++;
  const ball = getBallPos(s);
  const cx = best.reduce((a, p) => a + p.x, 0) / best.length;
  const cy = best.reduce((a, p) => a + p.y, 0) / best.length;
  const dBall = Math.hypot(cx - ball.x, cy - ball.y);
  const ballState = s.shot ? "shot" : s.pass ? `pass:${s.pass.kind ?? "normal"}` : s.looseBall ? `loose:${s.looseBall.source ?? "through"}` : "held";
  const phase = s.setPiecePhase ? `sp:${s.setPiecePhase.kind}` : "open";
  const inBox = (cx <= 18 || cx >= 97) && cy >= 15 && cy <= 59 ? "box" : "field";
  bump(situ, `${phase} | ${ballState} | ${inBox} | ${dBall <= 6 ? "on ball" : dBall <= 15 ? "near ball" : "away"}`);
  if (phase === "open" && ballState === "held" && dBall > 15) {
    const h = s.players.find((p) => p.id === s.ballHolderId)!;
    const fwd = (cx - h.x) * h.attackDir;                    // + = ahead of the ball
    const goalDist = h.attackDir > 0 ? 115 - cx : cx;        // crowd's distance to the goal the holder attacks
    const nAtt = best.filter((p) => p.team === h.team).length;
    const since = s.matchTime - lastSp;
    bump(away, `ahead ${fwd > 10 ? "yes" : fwd < -10 ? "behind" : "level"} | goalDist ${goalDist < 25 ? "<25" : goalDist < 45 ? "25-45" : ">45"} | y ${Math.abs(cy - 37) < 12 ? "centre" : "wide"} | att ${nAtt}/${best.length} | since restart ${since < 60 ? "<60s" : since < 180 ? "<180s" : "long"}`);
    bump(roles, best.map((p) => `${p.team === h.team ? "a" : "d"}${p.role}`).sort().join(" "));
    bump(holderWhere, `holder ${h.role} at x ${Math.round((h.attackDir > 0 ? h.x : 115 - h.x) / 10) * 10}`);
  }
  const holderTeam = s.players.find((p) => p.id === s.ballHolderId)?.team ?? null;
  for (const p of best) {
    const d = p.id === s.ballHolderId ? "holder" : (s.decisions[p.id]?.type ?? "none");
    const side = holderTeam ? (p.team === holderTeam ? "att" : "def") : "?";
    bump(decs, `${phase === "open" ? "open" : "sp"} ${side} ${d}${p.recoveryTime > 0 ? " (recovering)" : ""}`);
  }
}

const squads = loadLeagueAt88(league);
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, offset + m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const real = Math.random;
  Math.random = mulberry32(9100 + offset + m);
  try {
    const r = simulateMatch(home, away, fH, fA,
      autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
      { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, onTick: sample });
    for (const k of ["A", "B"] as const) { goals += r.teamStats[k].goals; shots += r.teamStats[k].shots; headers += r.teamStats[k].headerGoals; }
  } finally { Math.random = real; }
  if (inEpisode) { runs.push(run); inEpisode = false; run = 0; }
}

const pct = (n: number, d: number) => ((100 * n) / Math.max(1, d)).toFixed(1) + "%";
console.log(`${matches} matches, ${league}; group = outfield players within ${R} yd of one player; crowd = ${MIN}+`);
console.log(`ticks ${ticks} (${(ticks / matches).toFixed(0)} per match, 0.2 s each)`);
console.log("largest group per tick:", hist.map((n, i) => `${i}:${pct(n, ticks)}`).slice(1).join("  "));
console.log(`crowd ticks ${pct(crowdTicks, ticks)} = ${(crowdTicks * 0.2 / matches).toFixed(1)} real s per match; episodes ${(episodes / matches).toFixed(1)} per match; mean ${(runs.reduce((a, b) => a + b, 0) / Math.max(1, runs.length) * 0.2).toFixed(1)} s, longest ${(longest * 0.2).toFixed(1)} s`);
const top = (o: Record<string, number>, n: number, total: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${pct(v, total).padStart(6)}  ${k}`).join("\n");
console.log("situations (share of crowd ticks):\n" + top(situ, 18, crowdTicks));
const dTotal = Object.values(decs).reduce((a, b) => a + b, 0);
console.log("what the players in a crowd are doing:\n" + top(decs, 22, dTotal));
const aTotal = Object.values(away).reduce((a, b) => a + b, 0);
console.log("open play, ball held, crowd away from the ball:\n" + top(away, 14, aTotal));
console.log("who:\n" + top(roles, 12, aTotal));
console.log("holder:\n" + top(holderWhere, 10, aTotal));
console.log(`goals ${(goals / matches).toFixed(2)} shots ${(shots / matches).toFixed(2)} header goals ${(headers / matches).toFixed(2)}`);
