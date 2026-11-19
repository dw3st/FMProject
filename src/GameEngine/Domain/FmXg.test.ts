import { describe, expect, test } from 'bun:test';
import { fmShotXG, fmXgFromFeatures, isChance, isClearChance, xgModelFor, type XgFeatures } from '@/GameEngine/Domain/FmXg';
import { XG_CONFIG } from '@/GameEngine/Configs/XgConfig';
import { M_PER_YD } from '@/GameEngine/Configs/KinematicsConfig';

/** FM's worked example: central shot, facing goal, keeper 1 m off the line as the only blocker, 90% visible. */
function keeperOnly(dM: number, fraction: number): XgFeatures {
  const t = Math.max(0, 1 - (dM - 1) / dM);
  return { distance: 1 - dM / 60, occluding: t * t, between: 1 / 22, angleLocation: 1, angleFacing: 1, height: 0, fraction };
}

describe('FM xG logistic models', () => {
  test('open-goal ground shots match the FM reference curve', () => {
    const ref: [number, number][] = [[6, 0.73], [11, 0.59], [16, 0.44], [20, 0.32], [25, 0.20], [30, 0.12]];
    for (const [d, xg] of ref) expect(Math.abs(fmXgFromFeatures('open_goal_regular', keeperOnly(d, 0.9)) - xg)).toBeLessThan(0.01);
  });

  test('a penalty is 0.827', () => {
    const z: XgFeatures = { distance: 0, occluding: 0, between: 0, angleLocation: 0, angleFacing: 0, height: 0, fraction: 0 };
    expect(fmXgFromFeatures('penalties', z)).toBeCloseTo(0.827, 3);
  });

  test('headers fall off much faster with distance than ground shots', () => {
    const at = (d: number) => fmXgFromFeatures('headers', keeperOnly(d, 0.5));
    expect(at(6)).toBeGreaterThan(at(11) * 3);
    expect(fmXgFromFeatures('regular', keeperOnly(11, 0.5))).toBeGreaterThan(at(11));
  });

  test('model picked by kind and visible fraction', () => {
    expect(xgModelFor('ground', 0.9)).toBe('open_goal_regular');
    expect(xgModelFor('ground', 0.5)).toBe('regular');
    expect(xgModelFor('ground', 0.1)).toBe('obscured_regular');
    expect(xgModelFor('volley', 0.8)).toBe('open_goal_volleys');
    expect(xgModelFor('header', 0.1)).toBe('obscured_headers');
    expect(xgModelFor('free_kick', 0.1)).toBe('free_kicks');
    expect(xgModelFor('penalty', 1)).toBe('penalties');
  });

  test('chance and clear-cut chance thresholds', () => {
    expect(isChance(0.149)).toBe(false);
    expect(isChance(XG_CONFIG.CHANCE)).toBe(true);
    expect(isClearChance(0.29)).toBe(false);
    expect(isClearChance(XG_CONFIG.CLEAR_CHANCE)).toBe(true);
  });
});

describe('FM xG features from the geometry', () => {
  test('central shot with nobody in the way', () => {
    const r = fmShotXG({ x: 103, y: 37, attackDir: 1, others: [], kind: 'ground' });
    expect(r.features.distance).toBeCloseTo(1 - (12 * M_PER_YD) / 60, 6);
    expect(r.features.angleLocation).toBe(1);
    expect(r.features.angleFacing).toBe(1);
    expect(r.features.fraction).toBe(1);
    expect(r.features.between).toBe(0);
    expect(r.model).toBe('open_goal_regular');
    expect(r.availableM).toBeCloseTo(7.32, 6);
  });

  test('the keeper on the line covers a 2 m segment, an outfield blocker 0.667 m', () => {
    const keeper = fmShotXG({ x: 103, y: 37, attackDir: 1, others: [{ x: 114, y: 37, keeper: true }], kind: 'ground' });
    const outfield = fmShotXG({ x: 103, y: 37, attackDir: 1, others: [{ x: 114, y: 37 }], kind: 'ground' });
    expect(keeper.inTriangle).toBe(1);
    expect(keeper.features.between).toBeCloseTo(1 / 22, 6);
    expect(keeper.coveredM).toBeGreaterThan(outfield.coveredM * 2.5);
    expect(keeper.xg).toBeLessThan(outfield.xg);
  });

  test('a blocker next to the shooter gives occluding near 1 and hides most of the goal', () => {
    const r = fmShotXG({ x: 100, y: 37, attackDir: 1, others: [{ x: 100.6, y: 37 }], kind: 'ground' });
    expect(r.features.occluding).toBeGreaterThan(0.9);
    expect(r.features.fraction).toBeLessThan(0.5);
    const clear = fmShotXG({ x: 100, y: 37, attackDir: 1, others: [], kind: 'ground' });
    expect(r.xg).toBeLessThan(clear.xg);
  });

  test('players outside the shooter–posts triangle do not count', () => {
    const r = fmShotXG({ x: 100, y: 37, attackDir: 1, others: [{ x: 108, y: 20 }, { x: 95, y: 37 }], kind: 'ground' });
    expect(r.inTriangle).toBe(0);
    expect(r.features.fraction).toBe(1);
  });

  test('wide angle and facing away lower the xG', () => {
    const central = fmShotXG({ x: 105, y: 37, attackDir: 1, others: [], kind: 'ground' }).xg;
    const wide = fmShotXG({ x: 110, y: 20, attackDir: 1, others: [], kind: 'ground' });
    expect(wide.features.angleLocation).toBeLessThan(0.3);
    expect(wide.xg).toBeLessThan(central);
    const away = fmShotXG({ x: 105, y: 37, attackDir: 1, others: [], facingDeg: 180, kind: 'ground' });
    expect(away.features.angleFacing).toBe(0);
    expect(away.xg).toBeLessThan(central);
  });

  test('mirrored for the other goal', () => {
    const a = fmShotXG({ x: 100, y: 30, attackDir: 1, others: [{ x: 112, y: 36, keeper: true }], kind: 'ground' });
    const b = fmShotXG({ x: 15, y: 30, attackDir: -1, others: [{ x: 3, y: 36, keeper: true }], kind: 'ground' });
    expect(b.xg).toBeCloseTo(a.xg, 9);
  });

  test('a ground shot with the ball off the ground is a volley', () => {
    expect(fmShotXG({ x: 103, y: 37, attackDir: 1, others: [], ballHeightM: 0.5, kind: 'ground' }).model).toBe('open_goal_volleys');
    expect(fmShotXG({ x: 103, y: 37, attackDir: 1, others: [], ballHeightM: 0.1, kind: 'ground' }).model).toBe('open_goal_regular');
  });

  test('long shots are small chances, close central ones clear-cut', () => {
    const far = fmShotXG({ x: 85, y: 37, attackDir: 1, others: [{ x: 114, y: 37, keeper: true }, { x: 100, y: 36 }], kind: 'ground' });
    expect(isChance(far.xg)).toBe(false);
    const close = fmShotXG({ x: 108, y: 37, attackDir: 1, others: [{ x: 114, y: 37, keeper: true }], kind: 'ground' });
    expect(isClearChance(close.xg)).toBe(true);
  });
});
