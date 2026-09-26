/**
 * Penalty shootout — pure, shared by the full engine (GamePlayer ids are numbers) and
 * quickSim (roster ids are strings). The whole shootout is resolved up front; the engine
 * then *presents* the kicks one by one.
 */
import { PENALTY_CONFIG as C } from "@/GameEngine/Configs/PenaltyConfig";

export type ShootoutTeam = "A" | "B";

export interface PenaltyTaker<Id> {
  id: Id;
  /** Normalised finishing, 0..0.95 (same scale as runtimeStats.withBall.shootAccuracy). */
  accuracy: number;
  isGK: boolean;
}

export interface PenaltyKeeper<Id> {
  id: Id;
  /** 0..1 */
  reflex: number;
  /** 0..1 */
  diving: number;
}

export interface PenaltySide<Id> {
  takers: PenaltyTaker<Id>[];
  keeper: PenaltyKeeper<Id> | null;
}

export interface PenaltyKick<Id> {
  team: ShootoutTeam;
  takerId: Id;
  keeperId: Id | null;
  scored: boolean;
  chance: number;
}

export interface ShootoutResult<Id> {
  kicks: PenaltyKick<Id>[];
  score: { A: number; B: number };
  winner: ShootoutTeam;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Probability that a taker of `accuracy` scores against `keeper` (null = empty goal). */
export function penaltyChance<Id>(accuracy: number, keeper: PenaltyKeeper<Id> | null): number {
  const shooter = C.SHOOTER_MIN + (clamp(accuracy, 0, 0.95) / 0.95) * (C.SHOOTER_MAX - C.SHOOTER_MIN);
  const keeperFx = keeper ? 1 - ((keeper.reflex + keeper.diving) / 2) * C.GK_WEIGHT : 1;
  return clamp(C.BASE * shooter * keeperFx, C.MIN_CHANCE, C.MAX_CHANCE);
}

/** Outfield players by accuracy (desc, stable), goalkeepers last. */
function kickOrder<Id>(takers: PenaltyTaker<Id>[]): PenaltyTaker<Id>[] {
  const outfield = takers.filter((t) => !t.isGK).sort((a, b) => b.accuracy - a.accuracy);
  return [...outfield, ...takers.filter((t) => t.isGK)];
}

export function resolvePenaltyShootout<Id>(
  sideA: PenaltySide<Id>,
  sideB: PenaltySide<Id>,
  rng: () => number,
): ShootoutResult<Id> {
  const aHasTakers = sideA.takers.length > 0;
  const bHasTakers = sideB.takers.length > 0;

  if (!aHasTakers && !bHasTakers) {
    // Neither side has a taker — there is no possible kick at all. This is the only case
    // where `score` cannot equal the scored-kick counts in `kicks` (kicks is necessarily
    // empty), because there is no player to attribute a synthetic kick to on either side.
    // Unreachable in practice: a shootout only ever follows 120 minutes with a full XI
    // (including a goalkeeper) on both sides, so `takers` is never empty for both teams.
    return { kicks: [], score: { A: 1, B: 0 }, winner: "A" };
  }
  if (!aHasTakers || !bHasTakers) {
    // Exactly one side has no takers — that side forfeits. Award the other side a single
    // synthetic scored kick (its first taker in kick order) so `score` still equals the
    // scored-kick counts in `kicks`.
    const winner: ShootoutTeam = aHasTakers ? "A" : "B";
    const winnerSide = aHasTakers ? sideA : sideB;
    const loserSide = aHasTakers ? sideB : sideA;
    const taker = kickOrder(winnerSide.takers)[0]!;
    const kick: PenaltyKick<Id> = {
      team: winner,
      takerId: taker.id,
      keeperId: loserSide.keeper?.id ?? null,
      scored: true,
      chance: 1,
    };
    return {
      kicks: [kick],
      score: winner === "A" ? { A: 1, B: 0 } : { A: 0, B: 1 },
      winner,
    };
  }
  const order = { A: kickOrder(sideA.takers), B: kickOrder(sideB.takers) };
  const keeperFacing = { A: sideB.keeper, B: sideA.keeper };
  const score = { A: 0, B: 0 };
  const taken = { A: 0, B: 0 };
  const kicks: PenaltyKick<Id>[] = [];

  const kick = (team: ShootoutTeam) => {
    const list = order[team];
    const taker = list[taken[team] % list.length]!;
    const keeper = keeperFacing[team];
    const chance = penaltyChance(taker.accuracy, keeper);
    const scored = rng() < chance;
    if (scored) score[team]++;
    taken[team]++;
    kicks.push({ team, takerId: taker.id, keeperId: keeper?.id ?? null, scored, chance });
  };

  // Regulation rounds, stopping as soon as one side can no longer catch up.
  const decided = () =>
    score.A + (C.ROUNDS - taken.A) < score.B || score.B + (C.ROUNDS - taken.B) < score.A;
  for (let r = 0; r < C.ROUNDS; r++) {
    kick("A");
    if (decided()) break;
    kick("B");
    if (decided()) break;
  }

  // Sudden death.
  for (let r = 0; score.A === score.B && r < C.MAX_SUDDEN_DEATH_ROUNDS; r++) {
    kick("A");
    kick("B");
  }
  if (score.A === score.B) {
    // Safety net if still level after MAX_SUDDEN_DEATH_ROUNDS — practically unreachable (both
    // sides would need to miss or match every sudden-death round that many times running).
    // Push a synthetic scored kick for the coin-flip winner (their next taker in kick order)
    // so `score` still equals the scored-kick counts in `kicks`.
    const winner: ShootoutTeam = rng() < 0.5 ? "A" : "B";
    const list = order[winner];
    const taker = list[taken[winner] % list.length]!;
    const keeper = keeperFacing[winner];
    score[winner]++;
    kicks.push({ team: winner, takerId: taker.id, keeperId: keeper?.id ?? null, scored: true, chance: 1 });
  }
  return { kicks, score, winner: score.A > score.B ? "A" : "B" };
}
