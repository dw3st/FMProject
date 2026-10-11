/** Accumulators of `ball-cluster.ts` (shared by the runner and its workers). */
export interface ClusterTotals {
  n: number; ticks: number; looseTicks: number;
  defNear: number; attNear: number; looseDefHist: number[]; heldDefHist: number[]; chaseHist: number[]; heldDefDec: Record<string, number>; staleHist: number[]; defHist: number[]; attHist: number[]; pressHist: number[];
  gap: number; open: number;
  gapBy: Record<"c0" | "c3" | "c4", { n: number; gap: number; open: number }>;
  defDec: Record<string, number>; defDecType: Record<string, number>; attDecType: Record<string, number>;
  goals: number; shots: number; passes: number; tackles: number; fouls: number; interceptions: number;
}

export function emptyClusterTotals(): ClusterTotals {
  return {
    n: 0, ticks: 0, looseTicks: 0, defNear: 0, attNear: 0,
    looseDefHist: [0, 0, 0, 0, 0, 0, 0], heldDefHist: [0, 0, 0, 0, 0, 0, 0], chaseHist: [0, 0, 0, 0, 0, 0, 0], heldDefDec: {}, staleHist: [0, 0, 0, 0, 0, 0, 0],
    defHist: [0, 0, 0, 0, 0, 0, 0], attHist: [0, 0, 0, 0, 0, 0, 0], pressHist: [0, 0, 0, 0, 0, 0],
    gap: 0, open: 0,
    gapBy: { c0: { n: 0, gap: 0, open: 0 }, c3: { n: 0, gap: 0, open: 0 }, c4: { n: 0, gap: 0, open: 0 } },
    defDec: {}, defDecType: {}, attDecType: {},
    goals: 0, shots: 0, passes: 0, tackles: 0, fouls: 0, interceptions: 0,
  };
}

const addRec = (a: Record<string, number>, b: Record<string, number>) => {
  for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
};

export function mergeClusterTotals(a: ClusterTotals, b: ClusterTotals): ClusterTotals {
  const r = structuredClone(a);
  for (const k of ["n", "ticks", "looseTicks", "defNear", "attNear", "gap", "open", "goals", "shots", "passes", "tackles", "fouls", "interceptions"] as const) r[k] += b[k];
  for (const k of ["defHist", "attHist", "pressHist", "looseDefHist", "heldDefHist", "chaseHist", "staleHist"] as const) r[k] = r[k].map((v, i) => v + (b[k][i] ?? 0));
  for (const k of ["c0", "c3", "c4"] as const) {
    r.gapBy[k].n += b.gapBy[k].n; r.gapBy[k].gap += b.gapBy[k].gap; r.gapBy[k].open += b.gapBy[k].open;
  }
  addRec(r.defDec, b.defDec); addRec(r.defDecType, b.defDecType); addRec(r.attDecType, b.attDecType); addRec(r.heldDefDec, b.heldDefDec);
  return r;
}
