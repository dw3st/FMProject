/** Stage 11: FM's keeper (`keeper.md` → "Stage 11", flag `FM_KEEPER`). */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { setDecisionFlags } from '@/GameEngine/Configs/DecisionConfig';
import { TEST_SCENARIOS } from '@/GameEngine/Support/TestCases';
import { fmClaimDepth, fmKeeperComesForHigh, fmKeeperOffLineM, fmKeeperTarget } from '@/GameEngine/Domain/Keeper';
import { computeDefensivePosition } from '@/GameEngine/Domain/DefensivePositioning';
import { startAerialBall, startThroughBall } from '@/GameEngine/Domain/gameState';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import type { GamePlayer, GameState } from '@/GameEngine/types';

beforeAll(() => setDecisionFlags({ FM_KEEPER: true }));
afterAll(() => setDecisionFlags());

const scenario = (id: string): GameState => TEST_SCENARIOS.find(s => s.id === id)!.createState();
const byName = (s: GameState, name: string) => s.players.find(p => p.name === name)!;
const M = 1.0936;
const withCommand = (gk: GamePlayer, v: number): GamePlayer => ({
  ...gk, runtimeStats: { ...gk.runtimeStats, withoutBall: { ...gk.runtimeStats.withoutBall, gkPositioning: v, jump: v } },
});

describe('FM keeper position', () => {
  test('on his line with the opponent on the ball within 35 m; FM band medians further away', () => {
    expect(fmKeeperOffLineM(10, false)).toBe(0);
    expect(fmKeeperOffLineM(35, false)).toBe(0);
    expect(fmKeeperOffLineM(43.75, false)).toBeCloseTo(2.7);
    expect(fmKeeperOffLineM(61.25, false)).toBeCloseTo(6.0);
    expect(fmKeeperOffLineM(85, false)).toBeCloseTo(10.5);
    expect(fmKeeperOffLineM(100, false)).toBeCloseTo(10.5);
    // His own team's ball: further up (R8 / R9).
    expect(fmKeeperOffLineM(61.25, true)).toBeCloseTo(11);
    expect(fmKeeperOffLineM(95, true)).toBeCloseTo(18.5);
  });

  test('sideways he follows 0.18 of the ball offset; never rushes a 1 v 1', () => {
    const s = scenario('keeper-one-on-one');
    const gk = byName(s, 'Kowalski');
    const st = byName(s, 'Santos');
    const t = fmKeeperTarget(gk, st, false);
    expect(115 - t.x).toBeLessThan(0.5);   // on the line (defends x = 115)
    const wide = fmKeeperTarget(gk, { x: 100, y: 57 }, false);
    expect(wide.y - 37).toBeCloseTo(0.18 * 20, 5);
    // The defensive positioning gives the same point: no rush at the striker through on goal.
    const pos = computeDefensivePosition(gk, st, s.players, s.formationB, st.id, undefined, undefined);
    expect(115 - pos.x).toBeLessThan(0.5);
  });
});

describe('FM keeper on high balls', () => {
  test('claim depth grows with command, capped at 16 m', () => {
    const gk = byName(scenario('keeper-six-yard-cross'), 'Kowalski');
    expect(fmClaimDepth(withCommand(gk, 0))).toBeCloseTo(3);
    expect(fmClaimDepth(withCommand(gk, 1))).toBeCloseTo(11);
    expect(fmClaimDepth(withCommand(gk, 1))).toBeLessThanOrEqual(16 * M);
  });

  test('comes only in his box, within his depth, first and in time', () => {
    const gk = withCommand(byName(scenario('keeper-six-yard-cross'), 'Kowalski'), 0.5);   // depth 7 yd, goal x = 115
    expect(fmKeeperComesForHigh(gk, 111, 37, 0.8, 1.0, 1.0)).toBe(true);
    expect(fmKeeperComesForHigh(gk, 103, 37, 0.8, 1.0, 1.0)).toBe(false);   // 12 yd out: past his depth
    expect(fmKeeperComesForHigh(gk, 111, 37, 1.1, 1.0, 1.5)).toBe(false);   // an outfield player gets there first
    expect(fmKeeperComesForHigh(gk, 111, 37, 1.5, 2.0, 1.0)).toBe(false);   // too late for the ball
    expect(fmKeeperComesForHigh(gk, 111, 37, 1.5, 2.0)).toBe(true);         // no flight time: no time check
  });

  test('a cross into the six-yard box: he comes for it (first to it, inside his depth)', () => {
    const s = scenario('keeper-six-yard-cross');
    const outs: string[] = [];
    const off = gameBus.on('keeperComeOut', e => outs.push(e.kind));
    const out = startAerialBall(s, 'cross', { x: 112, y: 37 }, byName(s, 'Santos').id, () => 0.5);
    off();
    expect(out.decisions[byName(s, 'Kowalski').id]?.type).toBe('chase_loose_ball');
    expect(outs).toContain('high');
  });

  test('a cross to the penalty spot: he holds his line', () => {
    const s = scenario('keeper-high-ball');
    const outs: string[] = [];
    const off = gameBus.on('keeperComeOut', e => outs.push(e.kind));
    const out = startAerialBall(s, 'cross', { x: 103, y: 37 }, byName(s, 'Santos').id, () => 0.5);
    off();
    expect(out.decisions[byName(s, 'Kowalski').id]?.type).not.toBe('chase_loose_ball');
    expect(outs).not.toContain('high');
  });

  test('a ball over the top outside his box: no sweeper chase', () => {
    const s = scenario('keeper-sweeper');
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    const skilled = {
      ...s,
      players: s.players.map(p => (p.id === holder.id
        ? { ...p, runtimeStats: { ...p.runtimeStats, withBall: { ...p.runtimeStats.withBall, passingSkill: 1 } } }
        : p)),
    };
    const outs: string[] = [];
    const off = gameBus.on('keeperComeOut', e => outs.push(e.kind));
    const out = startThroughBall(skilled, { cellX: 95, cellY: 37, intendedRunnerId: byName(s, 'Santos').id });
    off();
    expect(out.decisions[byName(s, 'Kowalski').id]?.type).not.toBe('chase_loose_ball');
    expect(outs).not.toContain('sweep');
  });
});
