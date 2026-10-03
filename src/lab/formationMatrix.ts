/**
 * Formation matrix (Etapa 19, #63): plays formation X against formation Y with the SAME squad on
 * both sides and collects, per side, the metrics used to diagnose formation balance — result,
 * goals/shots by zone, where goals come from, possession, final-third entries through the middle
 * vs the flanks, ball recoveries by zone and the defending shape while the opponent has the ball.
 *
 * Shared by `scripts/formation-matrix.ts` (CLI, workers) and the `/lab` "Formation matrix" view.
 * The collector subscribes to the game bus for one match at a time (the engine's stores are
 * process-global, so one collector per worker / per simulation loop).
 */
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { simulateMatch } from '@/GameEngine/Domain/SimulateMatch';
import { getBallPos, isLivePhase } from '@/GameEngine/Domain/gameState';
import { PITCH_LENGTH, PENALTY_AREA_DEPTH, PENALTY_AREA_Y_MIN, PENALTY_AREA_Y_MAX } from '@/GameEngine/Domain/pitch';
import type { Formation, GameState, TeamId } from '@/GameEngine/types';
import type { Squad } from '@/types/playerTypes';

/** Central corridor (y) used for shots, entries and the defending screen. */
export const CENTRAL_Y_MIN = 22;
export const CENTRAL_Y_MAX = 52;
const FINAL_THIRD = PITCH_LENGTH * (2 / 3);
/** A shot within this many ticks of a delivery is credited to that delivery. */
const DELIVERY_TICKS = 5;

export type Delivery = 'through' | 'cross' | 'pass' | 'solo';

export interface SideRaw {
  goals: number;
  shots: number;
  xg: number;
  /** Shots by zone: inside the box centrally, inside the box wide, outside the box. */
  shotsBoxC: number; shotsBoxW: number; shotsOut: number;
  goalsBoxC: number; goalsBoxW: number; goalsOut: number;
  /** Shots / goals by how the ball reached the shooter. */
  shotsBy: Record<Delivery, number>;
  goalsBy: Record<Delivery, number>;
  goalsHeader: number;
  goalsSetPiece: number;
  /** Live ticks with the ball held by this side. */
  possTicks: number;
  /** Ball carried/received into the final third, central vs wide channel. */
  entriesC: number; entriesW: number;
  crosses: number;
  throughBalls: number;
  throughBallsWon: number;
  passes: number;
  /** Ball won in open play, by third relative to the own goal (keeper pickups apart). */
  recovDef: number; recovMid: number; recovAtt: number; recovGK: number;
  /** Defending shape, sampled every live tick the opponent holds the ball. */
  defSamples: number;
  /** Outfield players goal-side of the ball (sum over samples). */
  defGoalSide: number;
  /** ... of which inside the central corridor. */
  defGoalSideC: number;
  /** Mean distance of the outfield from the own goal line (sum over samples). */
  defDepth: number;
  /** Samples with the ball in the own defensive third, and the goal-side central count there. */
  defThirdSamples: number;
  defThirdScreenC: number;
  /** At each opponent shot: outfield players goal-side, and nearest defender distance. */
  oppShotGoalSide: number;
  oppShotNearest: number;
}

export interface PairRaw {
  /** Tested formation and its opponent. */
  x: string;
  y: string;
  matches: number;
  wins: number; draws: number; losses: number;
  sideX: SideRaw;
  sideY: SideRaw;
}

export function emptySide(): SideRaw {
  return {
    goals: 0, shots: 0, xg: 0, shotsBoxC: 0, shotsBoxW: 0, shotsOut: 0, goalsBoxC: 0, goalsBoxW: 0, goalsOut: 0,
    shotsBy: { through: 0, cross: 0, pass: 0, solo: 0 }, goalsBy: { through: 0, cross: 0, pass: 0, solo: 0 },
    goalsHeader: 0, goalsSetPiece: 0, possTicks: 0, entriesC: 0, entriesW: 0, crosses: 0, throughBalls: 0,
    throughBallsWon: 0, passes: 0, recovDef: 0, recovMid: 0, recovAtt: 0, recovGK: 0, defSamples: 0, defGoalSide: 0,
    defGoalSideC: 0, defDepth: 0, defThirdSamples: 0, defThirdScreenC: 0, oppShotGoalSide: 0, oppShotNearest: 0,
  };
}

export function emptyPair(x: string, y: string): PairRaw {
  return { x, y, matches: 0, wins: 0, draws: 0, losses: 0, sideX: emptySide(), sideY: emptySide() };
}

function addSide(a: SideRaw, b: SideRaw): SideRaw {
  const out = emptySide();
  for (const k of Object.keys(out) as (keyof SideRaw)[]) {
    if (k === 'shotsBy' || k === 'goalsBy') {
      for (const d of Object.keys(out[k]) as Delivery[]) out[k][d] = a[k][d] + b[k][d];
    } else {
      (out[k] as number) = (a[k] as number) + (b[k] as number);
    }
  }
  return out;
}

export function addPair(a: PairRaw, b: PairRaw): PairRaw {
  return {
    x: a.x, y: a.y, matches: a.matches + b.matches, wins: a.wins + b.wins, draws: a.draws + b.draws,
    losses: a.losses + b.losses, sideX: addSide(a.sideX, b.sideX), sideY: addSide(a.sideY, b.sideY),
  };
}

/** The same pair seen from the other side (y vs x). */
export function flipPair(p: PairRaw): PairRaw {
  return { ...p, x: p.y, y: p.x, wins: p.losses, losses: p.wins, sideX: p.sideY, sideY: p.sideX };
}

const isCentral = (y: number) => y >= CENTRAL_Y_MIN && y <= CENTRAL_Y_MAX;
const ownGoalX = (dir: 1 | -1) => (dir === 1 ? 0 : PITCH_LENGTH);

/**
 * Plays one match X vs Y with the same squad, collecting both sides. `xHome` puts X on team A.
 * Lineups are supplied by the caller (the CLI and the lab use the game's auto selector).
 */
export function playMatrixMatch(
  squad: Squad,
  fX: Formation,
  fY: Formation,
  lineupFor: (squad: Squad, f: Formation) => string[],
  xHome: boolean,
  pair: PairRaw,
): void {
  const a: Squad = { ...squad, players: squad.players.map((p) => ({ ...p, id: `A-${p.id}` })) };
  const b: Squad = { ...squad, players: squad.players.map((p) => ({ ...p, id: `B-${p.id}` })) };
  const fA = xHome ? fX : fY;
  const fB = xHome ? fY : fX;
  const sides: Record<TeamId, SideRaw> = { A: emptySide(), B: emptySide() };

  let last: GameState | null = null;
  let tick = 0;
  const teamOf = new Map<number, TeamId>();
  const team = (id: number): TeamId | null => {
    let t = teamOf.get(id);
    if (t) return t;
    const p = last?.players.find((q) => q.id === id) ?? last?.benchA.find((q) => q.id === id) ?? last?.benchB.find((q) => q.id === id);
    if (!p) return null;
    teamOf.set(id, p.team);
    return p.team;
  };
  const delivery: Record<TeamId, { kind: Delivery; tick: number }> = { A: { kind: 'solo', tick: -99 }, B: { kind: 'solo', tick: -99 } };
  const pendingShot: Record<TeamId, { zone: 'C' | 'W' | 'O'; by: Delivery } | null> = { A: null, B: null };
  let prevPoss: { team: TeamId; relX: number } | null = null;
  const deliver = (id: number, kind: Delivery) => { const t = team(id); if (t) delivery[t] = { kind, tick }; };

  const offs = [
    gameBus.on('throughBallStarted', (e) => deliver(e.player, 'through')),
    gameBus.on('crossStarted', (e) => deliver(e.player, 'cross')),
    gameBus.on('passCompleted', (e) => deliver(e.player, 'pass')),
    gameBus.on('shot', (e) => {
      const t = team(e.player);
      const p = last?.players.find((q) => q.id === e.player);
      if (!t || !p || !last) return;
      const s = sides[t];
      const goalX = ownGoalX(p.attackDir === 1 ? -1 : 1);
      const inBox = Math.abs(p.x - goalX) <= PENALTY_AREA_DEPTH && p.y >= PENALTY_AREA_Y_MIN && p.y <= PENALTY_AREA_Y_MAX;
      const zone = !inBox ? 'O' : isCentral(p.y) ? 'C' : 'W';
      if (zone === 'C') s.shotsBoxC++; else if (zone === 'W') s.shotsBoxW++; else s.shotsOut++;
      const by: Delivery = tick - delivery[t].tick <= DELIVERY_TICKS ? delivery[t].kind : 'solo';
      s.shotsBy[by]++;
      pendingShot[t] = { zone, by };
      // Defending shape at the shot.
      const d = sides[t === 'A' ? 'B' : 'A'];
      const defenders = last.players.filter((q) => q.team !== t && q.role !== 'GK');
      const ogx = goalX;
      d.oppShotGoalSide += defenders.filter((q) => Math.abs(q.x - ogx) < Math.abs(p.x - ogx)).length;
      d.oppShotNearest += Math.min(...defenders.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    }),
    gameBus.on('goalScored', (e) => {
      const s = sides[e.team];
      const shot = pendingShot[e.team];
      if (e.header) s.goalsHeader++;
      if (e.setPiece) s.goalsSetPiece++;
      if (shot) {
        if (shot.zone === 'C') s.goalsBoxC++; else if (shot.zone === 'W') s.goalsBoxW++; else s.goalsOut++;
        s.goalsBy[shot.by]++;
      }
      pendingShot[e.team] = null;
      prevPoss = null;
    }),
  ];

  const onTick = (s: GameState) => {
    last = s;
    tick++;
    if (!isLivePhase(s.matchPhase) || s.setPiece || s.shot) { if (s.setPiece) prevPoss = null; return; }
    if (s.pass || s.looseBall) return;
    const holder = s.players.find((p) => p.id === s.ballHolderId);
    if (!holder) return;
    const t = holder.team;
    const ball = getBallPos(s);
    const relX = holder.attackDir === 1 ? ball.x : PITCH_LENGTH - ball.x;
    sides[t].possTicks++;
    if (prevPoss && prevPoss.team !== t) {
      const r = sides[t];
      if (holder.role === 'GK') r.recovGK++;
      else if (relX < PITCH_LENGTH / 3) r.recovDef++;
      else if (relX < FINAL_THIRD) r.recovMid++;
      else r.recovAtt++;
    } else if (prevPoss && prevPoss.relX < FINAL_THIRD && relX >= FINAL_THIRD) {
      if (isCentral(ball.y)) sides[t].entriesC++; else sides[t].entriesW++;
    }
    prevPoss = { team: t, relX };
    // Defending shape of the other side.
    const dt: TeamId = t === 'A' ? 'B' : 'A';
    const d = sides[dt];
    const defenders = s.players.filter((q) => q.team === dt && q.role !== 'GK');
    if (defenders.length === 0) return;
    const ogx = ownGoalX(defenders[0]!.attackDir);
    const goalSide = defenders.filter((q) => Math.abs(q.x - ogx) < Math.abs(ball.x - ogx));
    d.defSamples++;
    d.defGoalSide += goalSide.length;
    const screenC = goalSide.filter((q) => isCentral(q.y)).length;
    d.defGoalSideC += screenC;
    d.defDepth += defenders.reduce((acc, q) => acc + Math.abs(q.x - ogx), 0) / defenders.length;
    if (Math.abs(ball.x - ogx) < PITCH_LENGTH / 3) { d.defThirdSamples++; d.defThirdScreenC += screenC; }
  };

  let r;
  try {
    r = simulateMatch(a, b, fA, fB, lineupFor(a, fA), lineupFor(b, fB), {
      tactics: { A: { style: 'balanced' }, B: { style: 'balanced' } },
      onTick,
    });
  } finally {
    for (const off of offs) off();
  }
  for (const t of ['A', 'B'] as const) {
    const s = sides[t];
    const ts = r.teamStats[t];
    s.goals = r.score[t];
    s.shots = ts.shots;
    s.xg = ts.xg;
    s.crosses = ts.crosses;
    s.throughBalls = ts.throughBallsAttempted;
    s.throughBallsWon = ts.throughBallsCompleted;
    s.passes = ts.passesAttempted;
  }
  const sx = xHome ? sides.A : sides.B;
  const sy = xHome ? sides.B : sides.A;
  pair.matches++;
  if (sx.goals > sy.goals) pair.wins++; else if (sx.goals < sy.goals) pair.losses++; else pair.draws++;
  pair.sideX = addSide(pair.sideX, sx);
  pair.sideY = addSide(pair.sideY, sy);
}

// ── Aggregation (pure) ─────────────────────────────────────────────────────────

export interface FormationSummary {
  formation: string;
  /** Distinct opponents (mirror excluded). */
  opponents: number;
  matches: number;
  /** Mean over opponents of (win% − loss%), in percentage points. */
  edge: number;
  /** Per-opponent edge, in percentage points. */
  edges: Record<string, number>;
  goalsFor: number;
  goalsAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
}

/**
 * Edge of every formation against the mean of the others: each non-mirror pair counts for both of
 * its formations (once from each side), each opponent weighted equally whatever its match count.
 */
export function summarizeMatrix(pairs: PairRaw[]): FormationSummary[] {
  const merged = new Map<string, PairRaw>();
  for (const p of pairs) {
    if (p.x === p.y || p.matches === 0) continue;
    for (const q of [p, flipPair(p)]) {
      const k = `${q.x}|${q.y}`;
      merged.set(k, merged.has(k) ? addPair(merged.get(k)!, q) : q);
    }
  }
  const by = new Map<string, PairRaw[]>();
  for (const p of merged.values()) by.set(p.x, [...(by.get(p.x) ?? []), p]);
  return [...by.entries()].map(([formation, ps]) => {
    const edges: Record<string, number> = {};
    let m = 0, gf = 0, ga = 0, sf = 0, sa = 0;
    for (const p of ps) {
      edges[p.y] = (100 * (p.wins - p.losses)) / p.matches;
      m += p.matches;
      gf += p.sideX.goals / p.matches; ga += p.sideY.goals / p.matches;
      sf += p.sideX.shots / p.matches; sa += p.sideY.shots / p.matches;
    }
    const n = ps.length;
    const edge = Object.values(edges).reduce((a, b) => a + b, 0) / n;
    return { formation, opponents: n, matches: m, edge, edges, goalsFor: gf / n, goalsAgainst: ga / n, shotsFor: sf / n, shotsAgainst: sa / n };
  }).sort((a, b) => b.edge - a.edge);
}

/** Mirror pairs (x === y): goals per match, and the mean over formations. */
export function mirrorGoals(pairs: PairRaw[]): { formation: string; matches: number; goals: number; shots: number }[] {
  const merged = new Map<string, PairRaw>();
  for (const p of pairs) {
    if (p.x !== p.y || p.matches === 0) continue;
    merged.set(p.x, merged.has(p.x) ? addPair(merged.get(p.x)!, p) : p);
  }
  return [...merged.values()].map((p) => ({
    formation: p.x, matches: p.matches,
    goals: (p.sideX.goals + p.sideY.goals) / p.matches,
    shots: (p.sideX.shots + p.sideY.shots) / p.matches,
  })).sort((a, b) => b.goals - a.goals);
}
