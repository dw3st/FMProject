import { describe, expect, test } from 'bun:test';
import { emptyPair, mirrorGoals, summarizeMatrix, type PairRaw } from '@/lab/formationMatrix';

function pair(x: string, y: string, w: number, d: number, l: number, gx = 0, gy = 0): PairRaw {
  const p = emptyPair(x, y);
  p.matches = w + d + l; p.wins = w; p.draws = d; p.losses = l;
  p.sideX.goals = gx; p.sideY.goals = gy;
  return p;
}

describe('summarizeMatrix', () => {
  test('a pair counts for both formations, mirrored', () => {
    const s = summarizeMatrix([pair('A', 'B', 6, 2, 2, 10, 5)]);
    const a = s.find((r) => r.formation === 'A')!;
    const b = s.find((r) => r.formation === 'B')!;
    expect(a.edge).toBeCloseTo(40);
    expect(b.edge).toBeCloseTo(-40);
    expect(a.goalsFor).toBeCloseTo(1);
    expect(b.goalsFor).toBeCloseTo(0.5);
  });

  test('both orientations of a pair are merged, opponents weighted equally', () => {
    const s = summarizeMatrix([
      pair('A', 'B', 5, 0, 5), pair('B', 'A', 0, 0, 10), // A vs B: 15-0-5 over 20 → +50
      pair('A', 'C', 0, 10, 0),                          // A vs C: 0
    ]);
    const a = s.find((r) => r.formation === 'A')!;
    expect(a.opponents).toBe(2);
    expect(a.edges.B).toBeCloseTo(50);
    expect(a.edge).toBeCloseTo(25);
  });

  test('mirror pairs are left out of the edge and summed in mirrorGoals', () => {
    const pairs = [pair('A', 'A', 1, 1, 1, 3, 3), pair('A', 'A', 0, 1, 0, 1, 1), pair('A', 'B', 1, 0, 0)];
    expect(summarizeMatrix(pairs).find((r) => r.formation === 'A')!.opponents).toBe(1);
    const m = mirrorGoals(pairs);
    expect(m).toHaveLength(1);
    expect(m[0]!.matches).toBe(4);
    expect(m[0]!.goals).toBeCloseTo(2);
  });
});

describe('buildMatrixTasks', () => {
  test('reference pairs are played once, mirrors only on request, matches split in chunks', async () => {
    const { buildMatrixTasks } = await import('@/lab/formationMatrixPool');
    const tasks = buildMatrixTasks({ league: 'l', rows: ['A', 'B', 'C'], refs: ['A', 'B'], matches: 60, mirror: false });
    const keys = [...new Set(tasks.map((t) => [t.x, t.y].sort().join('|')))].sort();
    expect(keys).toEqual(['A|B', 'A|C', 'B|C']);
    expect(tasks.filter((t) => t.x === 'A' && t.y === 'B').map((t) => t.matches)).toEqual([25, 25, 10]);
    const withMirror = buildMatrixTasks({ league: 'l', rows: ['A'], refs: ['B'], matches: 10, mirror: true });
    expect(withMirror.map((t) => `${t.x}|${t.y}`)).toEqual(['A|B', 'A|A']);
    const onlyMirror = buildMatrixTasks({ league: 'l', rows: ['A', 'B'], refs: ['B'], matches: 10, mirror: false, mirrorOnly: true });
    expect(onlyMirror.map((t) => `${t.x}|${t.y}`)).toEqual(['A|A', 'B|B']);
  });
});
