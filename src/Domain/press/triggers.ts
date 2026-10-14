import { PRESS } from "@/Domain/press/pressConfig";
import { daysBetween } from "@/Domain/dates";
import type { PressTrigger } from "@/types/pressTypes";

export interface PreMatchFacts { derby: boolean; knockout: boolean; runIn: boolean; ultimatum: boolean }

export function preMatchTriggers(f: PreMatchFacts): PressTrigger[] {
  const out: PressTrigger[] = [];
  if (f.derby) out.push("derby");
  if (f.knockout) out.push("knockout");
  if (f.runIn) out.push("run_in");
  if (f.ultimatum) out.push("ultimatum");
  return out;
}

export interface PostMatchFacts {
  goalsFor: number;
  goalsAgainst: number;   // placar final do jogo (com prorrogação); pênaltis decidem `eliminated`
  eliminated: boolean;
  title: boolean;
  expectation: number;    // matchExpectation do clube (−1..1)
  winless: number;        // sequência DEPOIS deste jogo
}

export function postMatchTriggers(f: PostMatchFacts): PressTrigger[] {
  const out: PressTrigger[] = [];
  if (f.title) out.push("title");
  if (f.eliminated) out.push("eliminated");
  if (f.goalsAgainst - f.goalsFor >= PRESS.HEAVY_DEFEAT_MARGIN) out.push("heavy_defeat");
  if (f.winless > 0 && f.winless % PRESS.WINLESS_STEP === 0) out.push("winless");
  if (f.goalsFor > f.goalsAgainst && f.expectation <= -PRESS.UPSET_EXPECTATION) out.push("upset_win");
  if (f.goalsFor < f.goalsAgainst && f.expectation >= PRESS.UPSET_EXPECTATION) out.push("upset_loss");
  return out;
}

export function nextWinless(current: number, result: "W" | "D" | "L"): number {
  return result === "W" ? 0 : current + 1;
}

/**
 * Reta final: `boundaries` = posições que fecham uma zona por dentro (1 = título, a última vaga continental, a última
 * de acesso, a última posição a salvo antes do rebaixamento). O clube está a ≤ RUN_IN_POINTS do time do outro lado de
 * alguma fronteira (dentro: o primeiro de fora; fora: o último de dentro).
 */
export function isRunIn(a: { table: { squadId: string; points: number }[]; myId: string; roundsLeft: number; boundaries: number[] }): boolean {
  if (a.roundsLeft < 1 || a.roundsLeft > PRESS.RUN_IN_ROUNDS) return false;
  const pos = a.table.findIndex((r) => r.squadId === a.myId) + 1;
  if (pos === 0) return false;
  const pts = a.table[pos - 1]!.points;
  return a.boundaries.some((b) => {
    if (b < 1 || b >= a.table.length) return false;
    const other = pos <= b ? a.table[b] : a.table[b - 1];   // dentro: 1º de fora (índice b); fora: último de dentro
    return !!other && Math.abs(pts - other.points) <= PRESS.RUN_IN_POINTS;
  });
}

export function pickTrigger(
  candidates: PressTrigger[],
  state: { today: string; lastDate?: string; pending?: boolean },
): PressTrigger | null {
  const sorted = [...new Set(candidates)].sort((x, y) => PRESS.PRIORITY.indexOf(x) - PRESS.PRIORITY.indexOf(y));
  const best = sorted[0];
  if (!best) return null;
  if (best === "title") return best;
  if (state.pending) return null;
  if (state.lastDate && daysBetween(state.lastDate, state.today) < PRESS.MIN_GAP_DAYS) return null;
  return best;
}

const BOUNDARY_ZONES = new Set(["prom", "ucl", "uel", "uecl", "lib", "sud"]);

/**
 * Fronteiras da reta final a partir das zonas da liga (`leagueData`): 1 (título), a última posição de acesso e de
 * vaga continental (`to` de cada zona), e a última posição a salvo antes do rebaixamento (`rel`: `from − 1`, ou
 * `tamanho − fromEnd`). Sem repetição, em ordem.
 */
export function zoneBoundaries(zones: { id: string; from?: number; to?: number; fromEnd?: number }[], size: number): number[] {
  const out = new Set<number>([1]);
  for (const z of zones) {
    if (BOUNDARY_ZONES.has(z.id) && typeof z.to === "number") out.add(z.to);
    if (z.id === "rel") {
      if (typeof z.from === "number") out.add(z.from - 1);
      else if (typeof z.fromEnd === "number") out.add(size - z.fromEnd);
    }
  }
  return [...out].filter((b) => b >= 1 && b < size).sort((a, b) => a - b);
}
