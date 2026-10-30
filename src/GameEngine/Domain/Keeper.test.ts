import { describe, expect, test } from 'bun:test';
import { TEST_SCENARIOS } from '@/GameEngine/Support/TestCases';
import {
  arcComeOut, attackingAdvance, isOneOnOne, isWideClaimZone, keeperAttackingTarget, keeperComesWide,
  keeperDefendingTarget, keeperPositionDeviation, rushComeOut, smotherBase, sweeperChases, wideClaimFactor,
} from '@/GameEngine/Domain/Keeper';
import { resolveAerialLanding, startThroughBall } from '@/GameEngine/Domain/gameState';
import { computeGKPositionQuality } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import type { GameState } from '@/GameEngine/types';

const scenario = (id: string): GameState => TEST_SCENARIOS.find(s => s.id === id)!.createState();
const byName = (s: GameState, name: string) => s.players.find(p => p.name === name)!;

describe('arc and rush distances', () => {
  test('near arc unchanged, far arc steps up to 6 yd', () => {
    expect(arcComeOut(0)).toBeCloseTo(6);
    expect(arcComeOut(20)).toBeCloseTo(0.5);
    expect(arcComeOut(40)).toBeCloseTo(3.25);
    expect(arcComeOut(80)).toBeCloseTo(6);
  });

  test('rush comes out to 10 yd, stopping short of the holder, never behind the arc', () => {
    expect(rushComeOut(22)).toBeCloseTo(10);
    expect(rushComeOut(8)).toBeCloseTo(6.5);
    expect(rushComeOut(1)).toBeCloseTo(arcComeOut(1));
  });
});

describe('1v1 rush', () => {
  test('a striker through on goal is a 1v1; a defender goal-side in his lane is not', () => {
    const s = scenario('keeper-one-on-one');
    const gk = byName(s, 'Kowalski');
    const st = byName(s, 'Santos');
    expect(isOneOnOne(gk, st, s.players)).toBe(true);
    const blocked = s.players.map(p => (p.name === 'Silva' ? { ...p, x: 100, y: 37 } : p));
    expect(isOneOnOne(gk, st, blocked)).toBe(false);
  });

  test('the keeper rushes to ~10 yd off his line and his position quality stays full', () => {
    const s = scenario('keeper-one-on-one');
    const gk = byName(s, 'Kowalski');
    const st = byName(s, 'Santos');
    const t = keeperDefendingTarget(gk, st, st, s.players);
    expect(t.rushing).toBe(true);
    expect(115 - t.x).toBeCloseTo(10, 0);
    expect(keeperPositionDeviation({ ...gk, x: t.x, y: t.y }, st)).toBeCloseTo(0);
    expect(computeGKPositionQuality({ ...gk, x: t.x, y: t.y }, st)).toBeCloseTo(1);
  });

  test('smother base grows with positioning and reflex', () => {
    const gk = byName(scenario('keeper-one-on-one'), 'Kowalski');
    const weak = { ...gk, runtimeStats: { ...gk.runtimeStats, withoutBall: { ...gk.runtimeStats.withoutBall, gkPositioning: 0, gkReflex: 0 } } };
    const elite = { ...gk, runtimeStats: { ...gk.runtimeStats, withoutBall: { ...gk.runtimeStats.withoutBall, gkPositioning: 1, gkReflex: 1 } } };
    expect(smotherBase(weak)).toBeCloseTo(0.25);
    expect(smotherBase(elite)).toBeCloseTo(0.55);
  });
});

describe('up with the play', () => {
  test('6 yd with the ball near his goal, penalty spot at halfway, edge of the box deep in their half', () => {
    expect(attackingAdvance(20)).toBe(6);
    expect(attackingAdvance(57.5)).toBeCloseTo(12);
    expect(attackingAdvance(100)).toBeCloseTo(18);
  });

  test('team B keeper with the ball 80 yd up the pitch stands ~15 yd out', () => {
    const s = scenario('keeper-attacking');
    const gk = byName(s, 'Kowalski');
    const t = keeperAttackingTarget(gk, { x: 35, y: 37 });
    expect(115 - t.x).toBeGreaterThan(13);
    expect(115 - t.x).toBeLessThan(18);
  });
});

describe('sweeper', () => {
  test('chases only inside his zone and when he wins the race with the margin', () => {
    const gk = byName(scenario('keeper-sweeper'), 'Kowalski');
    expect(sweeperChases(gk, 95, 37, 1.0, 2.0)).toBe(true);
    expect(sweeperChases(gk, 95, 37, 1.0, 1.02)).toBe(false);
    expect(sweeperChases(gk, 70, 37, 1.0, 5.0)).toBe(false);
    expect(sweeperChases(gk, 95, 2, 1.0, 5.0)).toBe(false);
  });

  test('a ball over the top 20 yd out: the keeper commits to the chase', () => {
    const s = scenario('keeper-sweeper');
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    const skilled = {
      ...s,
      players: s.players.map(p => (p.id === holder.id
        ? { ...p, runtimeStats: { ...p.runtimeStats, withBall: { ...p.runtimeStats.withBall, passingSkill: 1 } } }
        : p)),
    };
    const sorties: string[] = [];
    const off = gameBus.on('keeperSortie', e => sorties.push(e.kind));
    const out = startThroughBall(skilled, { cellX: 95, cellY: 37, intendedRunnerId: byName(s, 'Santos').id });
    off();
    expect(out.decisions[byName(s, 'Kowalski').id]?.type).toBe('chase_loose_ball');
    expect(sorties).toContain('sweep');
  });
});

describe('high balls beyond the small box', () => {
  test('zone ends 13 yd out (past the penalty spot) and near the goal width', () => {
    expect(isWideClaimZone(115 - 9, 37, 115)).toBe(true);
    expect(isWideClaimZone(115 - 12, 37, 115)).toBe(true);   // the penalty-spot cross
    expect(isWideClaimZone(115 - 4, 37, 115)).toBe(false);   // small box: the old rule
    expect(isWideClaimZone(115 - 14, 37, 115)).toBe(false);
    expect(isWideClaimZone(115 - 9, 52, 115)).toBe(false);
  });

  test('comes when close and not beaten to it; catching gets harder further out', () => {
    expect(keeperComesWide(8, true, 9)).toBe(true);
    expect(keeperComesWide(8, true, 7)).toBe(false);
    expect(keeperComesWide(13, true, 20)).toBe(false);
    expect(wideClaimFactor(6)).toBe(1);
    expect(wideClaimFactor(12)).toBeCloseTo(1 - 0.7 * 6 / 7);
  });

  test('a cross dropping 9 yd out: the keeper comes for it (claim, punch or a loose ball)', () => {
    const s = scenario('keeper-high-ball');
    const gk = byName(s, 'Kowalski');
    const crosser = s.players.find(p => p.id === s.ballHolderId)!;
    const point = { x: 106, y: 37 };
    const st: GameState = {
      ...s,
      players: s.players.map(p => (p.id === gk.id ? { ...p, x: 114.5, y: 37 } : p.name === 'Santos' ? { ...p, x: 98, y: 43 } : p)),
      pass: {
        fromId: crosser.id, toId: null, toX: point.x, toY: point.y, kind: 'cross', t: 1,
        distance: Math.hypot(point.x - crosser.x, point.y - crosser.y),
        receiverOffside: false, intendedRunnerId: null, aerialOffsideIds: [],
      },
    };
    const sorties: string[] = [];
    const off = gameBus.on('keeperSortie', e => sorties.push(e.kind));
    resolveAerialLanding(st, () => 0.99);
    off();
    expect(sorties).toEqual(['high']);
  });
});
