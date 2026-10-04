/**
 * Formation matrix (Etapa 19, #63) — data types and pure aggregation, shared by the collector
 * (`formationMatrix.ts`), the CLI (`scripts/formation-matrix.ts`) and the lab page. No engine
 * imports, so the page bundle stays light.
 */
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

export function addSide(a: SideRaw, b: SideRaw): SideRaw {
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
function flipPair(p: PairRaw): PairRaw {
  return { ...p, x: p.y, y: p.x, wins: p.losses, losses: p.wins, sideX: p.sideY, sideY: p.sideX };
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
