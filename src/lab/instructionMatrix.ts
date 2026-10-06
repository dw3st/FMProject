/**
 * Instruction matrix (Etapa 27, `.claude/rules/game/player-instructions.md`): plays one formation
 * with the SAME club on both sides, side X with an instruction set and side Y with the default (or
 * the same set — mirror), full engine, balanced style, auto XI, fitness 88, and collects per side
 * the result, goals, shots and the counters of the slots the set changes (`instructionMatrixSummary`).
 *
 * Shared by `scripts/instruction-matrix.ts` (workers) and the lab's `/matrix` "Instructions" mode.
 */
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { simulateMatch, type TeamInstructions } from '@/GameEngine/Domain/SimulateMatch';
import { isLivePhase } from '@/GameEngine/Domain/gameState';
import { PITCH_LENGTH, PENALTY_AREA_DEPTH, PENALTY_AREA_Y_MIN, PENALTY_AREA_Y_MAX } from '@/GameEngine/Domain/pitch';
import { ROLE_VARIANTS, variantsForRole } from '@/GameEngine/Configs/RoleVariantConfig';
import { mainRoleOf } from '@/GameEngine/Domain/roleEngineData';
import { Player } from '@/Domain/Player';
import { mulberry32, seedFrom } from '@/Domain/rng';
import type { Formation, GameState, PlayerRole, TeamId } from '@/GameEngine/types';
import type { PressLevel, RoleVariantId, SlotInstruction } from '@/types/tacticsTypes';
import type { Squad } from '@/types/playerTypes';
import { emptySideAgg, type InstrPairRaw, type SideAgg, type SlotAgg } from '@/lab/instructionMatrixSummary';

export * from '@/lab/instructionMatrixSummary';

/** What side X plays with. */
export type InstrSetSpec =
  | { type: 'none' }
  | { type: 'variant'; variant: RoleVariantId }
  | { type: 'press'; level: PressLevel }
  | { type: 'random' }
  | { type: 'mark'; markers: 1 | 2; by?: 'mid' | 'cb' };

export interface InstrTask {
  league: string;
  key: string;
  formation: string;
  kind: InstrPairRaw['kind'];
  spec: InstrSetSpec;
  matches: number;
  offset: number;
}

/** Natural formation of each variant's roles (the formation the matrix measures it in). */
export function naturalFormation(variant: RoleVariantId): string {
  const role = ROLE_VARIANTS[variant].roles[0]!;
  if (role === 'CDM') return '4-2-3-1';
  if (role === 'LWB' || role === 'RWB') return '3-5-2';
  if (role === 'LM' || role === 'RM') return '4-4-2';
  return '4-3-3';
}

/** Formations of the random package (together they hold every role with variants). */
export const RANDOM_FORMATIONS = ['4-3-3', '4-2-3-1', '3-5-2', '4-4-2'];

const BACK_LINE = new Set<PlayerRole>(['CB', 'LB', 'RB', 'LWB', 'RWB']);

/** Instruction list (index = slot) + tracked slots of a set in a formation. */
function instructionsFor(
  spec: InstrSetSpec,
  formation: Formation,
  rng: () => number,
): { list: (SlotInstruction | null)[]; slots: number[] } {
  const roles = formation.attacking.map(s => s.role);
  if (spec.type === 'variant') {
    const slots = roles.flatMap((r, i) => (ROLE_VARIANTS[spec.variant].roles.includes(r) ? [i] : []));
    return { list: roles.map((_, i) => (slots.includes(i) ? { variant: spec.variant } : null)), slots };
  }
  if (spec.type === 'press') {
    const slots = roles.flatMap((r, i) => (r === 'GK' ? [] : [i]));
    return { list: roles.map((r) => (r === 'GK' ? null : { press: spec.level })), slots };
  }
  if (spec.type === 'random') {
    const list = roles.map((r) => {
      const options = variantsForRole(r);
      if (options.length === 0) return null;
      return { variant: options[Math.floor(rng() * options.length)]! };
    });
    return { list, slots: roles.flatMap((r, i) => (r === 'GK' ? [] : [i])) };
  }
  return { list: [], slots: [] };
}

/** The `n` best forwards of a lineup (by overall), as slots — the man-marking targets. */
function bestForwardSlots(squad: Squad, formation: Formation, lineup: string[], n: number): number[] {
  const byId = new Map(squad.players.map(p => [p.id, p]));
  return formation.attacking
    .map((s, i) => ({ i, role: s.role, p: byId.get(lineup[i] ?? '') }))
    .filter(e => e.p && mainRoleOf(e.role) === 'Forward')
    .sort((a, b) => Player.computeOverallAvg(b.p!) - Player.computeOverallAvg(a.p!))
    .slice(0, n)
    .map(e => e.i);
}

/** Marker slots: the central midfielders (CDM / CM) or the centre-backs, in slot order. */
function markerSlots(formation: Formation, n: number, by: 'mid' | 'cb' = 'mid'): number[] {
  const roles = by === 'cb' ? ['CB'] : ['CDM', 'CM'];
  return formation.attacking.flatMap((s, i) => (roles.includes(s.role) ? [i] : [])).slice(0, n);
}

const withFitness = (squad: Squad, tag: string): Squad => ({
  ...squad,
  players: squad.players.map(p => ({
    ...p,
    id: `${tag}-${p.id}`,
    seasonLog: { ...(p.seasonLog ?? {}), fitness: 88, load: 0 } as NonNullable<typeof p.seasonLog>,
  })),
});

/**
 * Plays one match: side X (`xHome` = team A) with `spec`, side Y default — or, for `kind:
 * 'mirror'`, both sides with `spec`; `base` = both default. Adds the result to `pair`.
 */
export function playInstructionMatch(
  squad: Squad,
  formation: Formation,
  lineupFor: (squad: Squad, f: Formation) => string[],
  spec: InstrSetSpec,
  kind: InstrPairRaw['kind'],
  xHome: boolean,
  seedKey: string,
  pair: InstrPairRaw,
): void {
  const rng = mulberry32(seedFrom(seedKey));
  const a = withFitness(squad, 'A');
  const b = withFitness(squad, 'B');
  const lineupA = lineupFor(a, formation);
  const lineupB = lineupFor(b, formation);
  const teamX: TeamId = xHome ? 'A' : 'B';
  const teamY: TeamId = xHome ? 'B' : 'A';

  const instrX = kind === 'base' ? { list: [], slots: [] } : instructionsFor(spec, formation, rng);
  const instrY = kind === 'mirror' ? instructionsFor(spec, formation, rng) : { list: [], slots: [] };
  const sideInstr: Record<TeamId, TeamInstructions> = { A: {}, B: {} };
  sideInstr[teamX] = { slotInstructions: instrX.list };
  sideInstr[teamY] = { slotInstructions: instrY.list };

  // Tracked slots: the changed slots on both sides (Y's same slots = the control).
  let slotsX = instrX.slots;
  let slotsY = instrX.slots;
  if (spec.type === 'mark' && kind !== 'base') {
    const lineupYSquad = teamY === 'A' ? a : b;
    const targets = bestForwardSlots(lineupYSquad, formation, teamY === 'A' ? lineupA : lineupB, spec.markers);
    const markers = markerSlots(formation, spec.markers, spec.by);
    sideInstr[teamX] = { manMarks: markers.map((slot, i) => ({ slot, targetSlot: targets[i]! })).filter(m => m.targetSlot !== undefined) };
    // Y's marked targets vs X's same (unmarked) slots in the same matches.
    slotsX = targets;
    slotsY = targets;
  }
  if (spec.type === 'none' || kind === 'base') { slotsX = []; slotsY = []; }

  const track: Record<TeamId, Set<number>> = { A: new Set(), B: new Set() };
  for (const s of slotsX) track[teamX].add(s);
  for (const s of slotsY) track[teamY].add(s);
  const agg: Record<TeamId, SlotAgg> = { A: emptySideAgg().slots, B: emptySideAgg().slots };

  // id → (team, slot) of every player seen on the pitch.
  const where = new Map<number, { team: TeamId; slot: number }>();
  const slotOf = (id: number) => {
    const w = where.get(id);
    return w && track[w.team].has(w.slot) ? agg[w.team] : null;
  };
  let last: GameState | null = null;

  const offs = [
    gameBus.on('passAttempted', e => { const s = slotOf(e.player); if (s) s.passes++; }),
    gameBus.on('passCompleted', e => { const s = slotOf(e.toId); if (s) s.passesReceived++; }),
    gameBus.on('crossStarted', e => { const s = slotOf(e.player); if (s) s.crosses++; }),
    gameBus.on('tackle', e => { if (!e.success) return; const s = slotOf(e.player); if (s) s.tackles++; }),
    gameBus.on('aerialDuel', e => {
      const w = slotOf(e.winnerId); if (w) w.aerialDuels++;
      const l = slotOf(e.loserId); if (l) l.aerialDuels++;
    }),
    gameBus.on('goalScored', e => { const s = slotOf(e.scorerId); if (s) s.goals++; }),
    gameBus.on('shot', e => {
      const s = slotOf(e.player);
      if (!s) return;
      s.shots++;
      const p = last?.players.find(q => q.id === e.player);
      if (!p) return;
      const goalX = p.attackDir === 1 ? PITCH_LENGTH : 0;
      if (Math.abs(p.x - goalX) <= PENALTY_AREA_DEPTH && p.y >= PENALTY_AREA_Y_MIN && p.y <= PENALTY_AREA_Y_MAX) s.shotsInBox++;
    }),
    gameBus.on('manMarkTick', e => {
      for (const id of e.targetIds) { const s = slotOf(id); if (s) s.markedMinutes += e.seconds / 60; }
    }),
  ];

  const onTick = (s: GameState) => {
    last = s;
    for (const p of s.players) if (p.slotIndex >= 0) where.set(p.id, { team: p.team, slot: p.slotIndex });
    if (!isLivePhase(s.matchPhase) || s.setPiece) return;
    const holder = s.players.find(p => p.id === s.ballHolderId);
    if (!holder || s.pass || s.looseBall) return;
    for (const p of s.players) {
      const st = track[p.team].has(p.slotIndex) ? agg[p.team] : null;
      if (!st) continue;
      const relX = p.attackDir === 1 ? p.x : PITCH_LENGTH - p.x;
      const dec = s.decisions[p.id];
      if (p.team === holder.team) {
        if (p.id === holder.id) { if (dec?.type === 'carry') st.carryTicks++; continue; }
        st.posXSum += relX;
        st.posWidthSum += Math.abs(p.y - 37);
        st.posSamples++;
      } else {
        if (dec?.type === 'press') st.pressTicks++;
        if (BACK_LINE.has(p.role)) {
          const others = s.players.filter(q => q.team === p.team && q.id !== p.id && BACK_LINE.has(q.role));
          if (others.length > 0) {
            const mean = others.reduce((acc, q) => acc + (q.attackDir === 1 ? q.x : PITCH_LENGTH - q.x), 0) / others.length;
            st.lineDeltaSum += relX - mean;
            st.lineSamples++;
          }
        }
      }
    }
  };

  let r;
  try {
    r = simulateMatch(a, b, formation, formation, lineupA, lineupB, {
      tactics: {
        A: { style: 'balanced', ...sideInstr.A },
        B: { style: 'balanced', ...sideInstr.B },
      },
      onTick,
    });
  } finally {
    for (const off of offs) off();
  }
  for (const p of r.players) {
    if (p.slotIndex < 0 || !track[p.team].has(p.slotIndex)) continue;
    agg[p.team].endEnergySum += p.energy;
    agg[p.team].endEnergyN++;
  }
  for (const [id, st] of r.playerStats) {
    const w = where.get(id);
    if (w && track[w.team].has(w.slot)) agg[w.team].markedShots += st.markedTargetShots;
  }
  const side = (t: TeamId): SideAgg => ({
    goals: r.score[t],
    shots: r.teamStats[t].shots,
    xg: r.teamStats[t].xg,
    slots: agg[t],
  });
  const sx = side(teamX);
  const sy = side(teamY);
  pair.matches++;
  if (sx.goals > sy.goals) pair.wins++; else if (sx.goals < sy.goals) pair.losses++; else pair.draws++;
  const add = (x: SideAgg, y: SideAgg): SideAgg => ({
    goals: x.goals + y.goals, shots: x.shots + y.shots, xg: x.xg + y.xg,
    slots: Object.fromEntries(Object.keys(x.slots).map(k => [k, x.slots[k as keyof SlotAgg] + y.slots[k as keyof SlotAgg]])) as unknown as SlotAgg,
  });
  pair.x = add(pair.x, sx);
  pair.y = add(pair.y, sy);
}
