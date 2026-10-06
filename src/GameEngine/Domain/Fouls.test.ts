import { describe, expect, test } from 'bun:test';
import { foulChance, cardRoll, isClearChance, type FoulContext } from '@/GameEngine/Domain/Fouls';
import { FOUL_CONFIG as C } from '@/GameEngine/Configs/FoulConfig';

const base: FoulContext = {
  kind: 'tackle', angle: 'side', aggression: C.AGGRESSION_REF, tackling: 0.5,
  energy: 100, onYellow: false, tackleWon: false, inOwnBox: false,
};

describe('foulChance', () => {
  test('neutral side tackle equals the base', () => {
    expect(foulChance(base)).toBeCloseTo(C.TACKLE_BASE, 6);
  });
  test('front < side < behind', () => {
    const f = foulChance({ ...base, angle: 'front' });
    const s = foulChance(base);
    const b = foulChance({ ...base, angle: 'behind' });
    expect(f).toBeLessThan(s);
    expect(s).toBeLessThan(b);
  });
  test('higher tactical aggression fouls more', () => {
    expect(foulChance({ ...base, aggression: 0.65 })).toBeGreaterThan(foulChance({ ...base, aggression: 0.25 }));
  });
  test('poor tackling and low energy raise it; a yellow and a won tackle lower it', () => {
    expect(foulChance({ ...base, tackling: 0.1 })).toBeGreaterThan(foulChance(base));
    expect(foulChance({ ...base, energy: 30 })).toBeGreaterThan(foulChance(base));
    expect(foulChance({ ...base, energy: 90 })).toBeCloseTo(foulChance(base), 6);
    expect(foulChance({ ...base, onYellow: true })).toBeLessThan(foulChance(base));
    expect(foulChance({ ...base, tackleWon: true })).toBeLessThan(foulChance(base));
  });
  test('duels use their own base and defenders hold back in their own box', () => {
    expect(foulChance({ ...base, kind: 'duel' })).toBeCloseTo(C.DUEL_BASE, 6);
    expect(foulChance({ ...base, kind: 'aerial' })).toBeCloseTo(C.AERIAL_BASE, 6);
    expect(foulChance({ ...base, inOwnBox: true })).toBeCloseTo(C.TACKLE_BASE * C.IN_BOX_MULT, 6);
  });
  test('always a probability', () => {
    const p = foulChance({ ...base, angle: 'behind', aggression: 1, tackling: 0, energy: 0 });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(C.MAX_CHANCE);
  });
});

describe('cardRoll', () => {
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };
  test('red is rolled first, then yellow', () => {
    expect(cardRoll({ angle: 'side', clearChance: false, onYellow: false }, seq(0)).card).toBe('red');
    expect(cardRoll({ angle: 'side', clearChance: false, onYellow: false }, seq(0.5, 0.01)).card).toBe('yellow');
    expect(cardRoll({ angle: 'side', clearChance: false, onYellow: false }, seq(0.5, 0.99)).card).toBe('none');
  });
  test('behind and clear-chance fouls are more severe', () => {
    const plain = cardRoll({ angle: 'side', clearChance: false, onYellow: false }, seq(0.99, 0.99));
    const behind = cardRoll({ angle: 'behind', clearChance: false, onYellow: false }, seq(0.99, 0.99));
    const dogso = cardRoll({ angle: 'side', clearChance: true, onYellow: false }, seq(0.99, 0.99));
    expect(behind.yellowChance).toBeGreaterThan(plain.yellowChance);
    expect(behind.redChance).toBeGreaterThan(plain.redChance);
    expect(dogso.redChance).toBeGreaterThan(behind.redChance);
  });
  test('a player on a yellow is more likely to be booked', () => {
    const a = cardRoll({ angle: 'side', clearChance: false, onYellow: false }, seq(0.99));
    const b = cardRoll({ angle: 'side', clearChance: false, onYellow: true }, seq(0.99));
    expect(b.yellowChance).toBeGreaterThan(a.yellowChance);
  });
});

describe('isClearChance', () => {
  const fouled = { x: 90, y: 37, attackDir: 1 as const };
  test('no outfield defender ahead within range = clear chance', () => {
    expect(isClearChance(fouled, [{ x: 85, y: 37, role: 'CB' }, { x: 110, y: 37, role: 'GK' }])).toBe(true);
  });
  test('a defender ahead in the corridor blocks it', () => {
    expect(isClearChance(fouled, [{ x: 100, y: 40, role: 'CB' }])).toBe(false);
  });
  test('too far from goal is never a clear chance', () => {
    expect(isClearChance({ x: 50, y: 37, attackDir: 1 }, [])).toBe(false);
  });
});

describe('temperament (personality)', () => {
  test('t = 0 gives exactly the plain result; ±1 scales the foul chance by 1 ± 0.45', () => {
    const front = { ...base, angle: 'front' as const };
    expect(foulChance({ ...front, temperament: 0 })).toBe(foulChance(front));
    expect(foulChance({ ...front, temperament: 1 })).toBeCloseTo(foulChance(front) * 1.45, 9);
    expect(foulChance({ ...front, temperament: -1 })).toBeCloseTo(foulChance(front) * 0.55, 9);
  });
  test('cards: same draws, chances scaled', () => {
    const ctx = { angle: 'side' as const, clearChance: false, onYellow: false };
    const plain = cardRoll(ctx, () => 0.99);
    expect(cardRoll({ ...ctx, temperament: 0 }, () => 0.99)).toEqual(plain);
    const hot = cardRoll({ ...ctx, temperament: 1 }, () => 0.99);
    expect(hot.yellowChance).toBeCloseTo(plain.yellowChance * 1.2 / C.TEMPERAMENT_CARD_NORM, 9);
    expect(hot.redChance).toBeCloseTo(plain.redChance * 1.4 / C.TEMPERAMENT_CARD_NORM, 9);
    const calm = cardRoll({ ...ctx, temperament: -1 }, () => 0.99);
    expect(calm.yellowChance).toBeLessThan(plain.yellowChance);
  });
});
