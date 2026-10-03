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
import { addSide, emptySide, type Delivery, type PairRaw, type SideRaw } from '@/lab/formationMatrixSummary';

export * from '@/lab/formationMatrixSummary';

/** Central corridor (y) used for shots, entries and the defending screen. */
export const CENTRAL_Y_MIN = 22;
export const CENTRAL_Y_MAX = 52;
const FINAL_THIRD = PITCH_LENGTH * (2 / 3);
/** A shot within this many ticks of a delivery is credited to that delivery. */
const DELIVERY_TICKS = 5;

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

