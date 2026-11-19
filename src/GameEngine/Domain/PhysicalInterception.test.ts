import { describe, expect, test } from 'bun:test';
import { interceptPoint, resolveTouch, touchChances, type PathPoint } from '@/GameEngine/Domain/PhysicalInterception';

/** A ball rolling along +x at `v` yd/s from x0, sampled every 0.1 s. */
const path = (v: number, x0 = 0, y = 0, z = 0, n = 30): PathPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + v * (i + 1) * 0.1, y, z, t: (i + 1) * 0.1 }));

const base = { speed: 7, reach: 1.5, reaction: 0.25, maxZ: 2.4 };

describe('interceptPoint', () => {
  test('a defender on the line takes it where the ball reaches him', () => {
    const p = interceptPoint(path(15), { ...base, x: 10, y: 0 });
    expect(p).not.toBeNull();
    expect(p!.x).toBeGreaterThan(7);
    expect(p!.x).toBeLessThan(10.5);
  });

  test('too far from the line: he never gets there in time', () => {
    expect(interceptPoint(path(20, 0, 0, 0, 10), { ...base, x: 10, y: 15 })).toBeNull();
  });

  test('a slower ball gives him time to cover more ground', () => {
    const fast = interceptPoint(path(25), { ...base, x: 12, y: 6 });
    const slow = interceptPoint(path(8), { ...base, x: 12, y: 6 });
    expect(fast).toBeNull();
    expect(slow).not.toBeNull();
    expect(slow!.margin).toBeGreaterThanOrEqual(0);
  });

  test('a ball above his reach is not his', () => {
    expect(interceptPoint(path(15, 0, 0, 3), { ...base, x: 10, y: 0 })).toBeNull();
  });

  test('nothing after the cutoff (the receiver takes it first)', () => {
    expect(interceptPoint(path(15), { ...base, x: 20, y: 0 }, 0.5)).toBeNull();
  });

  test('reaction only matters when he has to move', () => {
    const p = interceptPoint(path(15), { ...base, reaction: 5, x: 1.5, y: 0.5 });
    expect(p).not.toBeNull();
  });
});

describe('touchChances', () => {
  const t = { touch: 0.6, offset: 0.2, speedMs: 12, z: 0, keeperHands: false, fromOwnGoal: 60 };

  test('the shares sum to 1', () => {
    for (const c of [touchChances(t), touchChances({ ...t, fromOwnGoal: 10 }), touchChances({ ...t, keeperHands: true })]) {
      expect(c.control + c.clear + c.deflect + c.miss).toBeCloseTo(1, 9);
    }
  });

  test('a better first touch, a ball at his feet and a slower ball control more', () => {
    expect(touchChances({ ...t, touch: 0.9 }).control).toBeGreaterThan(touchChances(t).control);
    expect(touchChances({ ...t, offset: 0 }).control).toBeGreaterThan(touchChances({ ...t, offset: 1 }).control);
    expect(touchChances({ ...t, speedMs: 8 }).control).toBeGreaterThan(touchChances({ ...t, speedMs: 25 }).control);
    expect(touchChances({ ...t, z: 1.5 }).control).toBeLessThan(touchChances(t).control);
  });

  test('at the edge of his reach more balls run past him', () => {
    expect(touchChances({ ...t, offset: 1 }).miss).toBeGreaterThan(touchChances({ ...t, offset: 0.1 }).miss);
    expect(touchChances({ ...t, offset: 0 }).miss).toBe(0);
  });

  test('near his own goal he clears what he does not control; upfield he deflects it', () => {
    const own = touchChances({ ...t, fromOwnGoal: 15 });
    expect(own.clear).toBeGreaterThan(0);
    expect(own.deflect).toBe(0);
    const up = touchChances(t);
    expect(up.clear).toBe(0);
    expect(up.deflect).toBeGreaterThan(0);
  });

  test('resolveTouch follows the shares', () => {
    const c = { control: 0.5, clear: 0.2, deflect: 0.2, miss: 0.1 };
    expect(resolveTouch(c, () => 0.1)).toBe('control');
    expect(resolveTouch(c, () => 0.6)).toBe('clear');
    expect(resolveTouch(c, () => 0.85)).toBe('deflect');
    expect(resolveTouch(c, () => 0.95)).toBe('miss');
  });
});
