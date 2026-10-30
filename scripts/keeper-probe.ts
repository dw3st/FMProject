// Balls the keeper could reach first but an attacker collects (tester report, 4.41.51).
// `bun scripts/keeper-probe.ts [matches=200] [league=premier_league] [seed=5000]`
// Episode = a through / high / cleared ball in flight or loose. At its first tick: who is faster to the point
// (sprint ETA, same formula as the engine's chasers), whether the defending keeper chases it, who collects it.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { mulberry32 } from "@/Domain/rng";
import { THROUGH_BALL_CONFIG } from "@/GameEngine/Configs/ThroughBallConfig";
import { KEEPER_CONFIG } from "@/GameEngine/Configs/KeeperConfig";
import type { GamePlayer, GameState, TeamId } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

const n = Number(process.argv[2] ?? 200);
const league = process.argv[3] ?? "premier_league";
const seedBase = Number(process.argv[4] ?? 5000);
if (process.env.KEEPER_OVERRIDES) Object.assign(KEEPER_CONFIG, JSON.parse(process.env.KEEPER_OVERRIDES));
const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads: Squad[] = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(dir + f, "utf8")));
const f = formationForSimId("4-3-3");
const lineups = squads.map(s => autoLineupForFormation(s, f, "2026-08-15"));

const sprint = (p: GamePlayer) => {
  const wb = p.runtimeStats.withoutBall;
  return wb.pressSpeed + wb.acceleration * THROUGH_BALL_CONFIG.SPRINT_ACCEL_BOOST + wb.speed * THROUGH_BALL_CONFIG.SPRINT_TOP_BOOST;
};
const eta = (p: GamePlayer, x: number, y: number) => Math.hypot(p.x - x, p.y - y) / Math.max(0.01, sprint(p));

interface Ep { kind: string; attTeam: TeamId; gkEta: number; attEta: number; defEta: number; depth: number; lat: number;
  gkChased: boolean; startT: number; sp: boolean; gkDist: number; done?: "att" | "def" | "gk" | "out"; shotAfter?: boolean; goalAfter?: boolean }
const eps: Ep[] = [];
const realRandom = Math.random;
let goals = 0, shots = 0, pens = 0;
for (let i = 0; i < n; i++) {
  const a = i % squads.length, b = (i * 7 + 3) % squads.length === a ? (a + 1) % squads.length : (i * 7 + 3) % squads.length;
  let cur: Ep | null = null;
  let follow: { ep: Ep; until: number; score: number } | null = null;
  const onTick = (s: GameState) => {
    if (follow) {
      if (s.shot) follow.ep.shotAfter = true;
      const sc = follow.ep.attTeam === "A" ? s.score.A : s.score.B;
      if (sc > follow.score) follow.ep.goalAfter = true;
      if (s.matchTime > follow.until || (s.ballHolderId !== null && s.players.find(p => p.id === s.ballHolderId)?.team !== follow.ep.attTeam)) follow = null;
    }
    const airborne = s.pass && s.pass.kind !== "regular" ? s.pass : null;
    const loose = s.looseBall;
    if (!airborne && !loose) {
      if (cur) {
        const h = s.players.find(p => p.id === s.ballHolderId);
        cur.done = !h ? "out" : h.team === cur.attTeam ? "att" : h.role === "GK" ? "gk" : "def";
        if (cur.done === "att") follow = { ep: cur, until: s.matchTime + 60, score: cur.attTeam === "A" ? s.score.A : s.score.B };
        cur = null;
      }
      return;
    }
    if (cur) {
      if (!cur.gkChased) {
        const gk = s.players.find(p => p.role === "GK" && p.team !== cur!.attTeam);
        if (gk?.decisionMemory?.decision?.type === "chase_loose_ball") cur.gkChased = true;
      }
      return;
    }
    const passer = s.players.find(p => p.id === (airborne ? airborne.fromId : loose!.fromPasserId));
    const attTeam: TeamId = airborne ? (passer?.team ?? "A") : loose!.fromTeamLastTouch;
    const x = airborne ? airborne.toX : loose!.x, y = airborne ? airborne.toY : loose!.y;
    const gk = s.players.find(p => p.role === "GK" && p.team !== attTeam);
    if (!gk) return;
    const goalX = gk.attackDir === 1 ? 0 : 115;
    const atts = s.players.filter(p => p.team === attTeam && p.role !== "GK" && p.id !== passer?.id);
    const defs = s.players.filter(p => p.team !== attTeam && p.role !== "GK");
    cur = {
      kind: airborne ? airborne.kind : `loose-${loose!.source ?? "through"}`, attTeam,
      gkEta: eta(gk, x, y), attEta: Math.min(...atts.map(p => eta(p, x, y))), defEta: Math.min(...defs.map(p => eta(p, x, y))),
      depth: Math.abs(x - goalX), lat: Math.abs(y - 37), startT: s.matchTime,
      gkChased: gk.decisionMemory?.decision?.type === "chase_loose_ball",
      sp: !!(airborne as { fromSetPiece?: boolean } | null)?.fromSetPiece, gkDist: Math.hypot(gk.x - x, gk.y - y),
    };
    eps.push(cur);
  };
  Math.random = mulberry32(seedBase + i);
  const r = simulateMatch(squads[a]!, squads[b]!, f, f, lineups[a]!, lineups[b]!, { onTick });
  goals += r.score.A + r.score.B;
  for (const t of [r.teamStats.A, r.teamStats.B]) { shots += t.shots ?? 0; pens += t.penaltiesAwarded ?? 0; }
  Math.random = realRandom;
}

// "Keeper's ball": in his half-zone (≤ 40 yd deep, ±26 wide), he is the fastest of everyone by ≥ 0.2 s.
const keeperBall = eps.filter(e => e.depth <= 40 && e.lat <= 26 && e.gkEta + 0.2 < e.attEta && e.gkEta <= e.defEta);
const per = (k: number) => (k / n).toFixed(2);
console.log(`${league}${process.env.KEEPER_OVERRIDES ? " " + process.env.KEEPER_OVERRIDES : ""}: ${n} matches, goals ${(goals / n).toFixed(3)}, shots ${(shots / n).toFixed(2)}, pens ${(pens / n).toFixed(3)}`);
console.log(`keeper's balls ${per(keeperBall.length)}/match; chased ${per(keeperBall.filter(e => e.gkChased).length)}; won by attackers ${per(keeperBall.filter(e => e.done === "att").length)} (shot after ${per(keeperBall.filter(e => e.done === "att" && e.shotAfter).length)}, goal after ${per(keeperBall.filter(e => e.done === "att" && e.goalAfter).length)})`);
type Row = [number, number, number, number];
const rows = new Map<string, Row>();
for (const e of keeperBall) {
  const depthBand = e.depth <= 6 ? "≤6" : e.depth <= 10 ? "6-10" : e.depth <= 14 ? "10-14" : e.depth <= 18 ? "14-18" : e.depth <= 30 ? "18-30" : "30-40";
  const k = `${(e.kind + (e.sp ? "-sp" : "")).padEnd(16)} ${depthBand.padEnd(6)} chased=${e.gkChased ? "y" : "n"}`;
  const r: Row = rows.get(k) ?? [0, 0, 0, 0];
  r[0]++; if (e.done === "att") r[1]++; if (e.done === "gk") r[2]++; if (e.done === "att" && e.shotAfter) r[3]++;
  rows.set(k, r);
}
console.log("kind             depth  chased   n/match  att-won  gk-won  att-shot");
for (const [k, r] of [...rows].sort((p, q) => q[1][0] - p[1][0])) console.log(`${k}  ${per(r[0]).padStart(6)}  ${per(r[1]).padStart(7)}  ${per(r[2]).padStart(6)}  ${per(r[3]).padStart(8)}`);
