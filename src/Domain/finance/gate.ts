/**
 * Home matchday ticket revenue — the same model for every competition. See design spec §2
 * "Bilheteria" and `.claude/rules/game/finances.md`.
 */
export const GATE = {
  TICKET_PRICE: 25,
  FILL_RATE: 0.65,
  /** Continental matches charge double the league/cup ticket price. */
  CONTINENTAL_MULT: 2,
} as const;

export type GateKind = "league" | "cup" | "continental";

/**
 * Home gate revenue for one fixture of the given competition kind. 0 on a neutral-venue fixture
 * (a cup/continental final) or when the club has no stadium capacity on record.
 */
export function gateRevenue(capacity: number, kind: GateKind, neutral = false): number {
  if (neutral || capacity <= 0) return 0;
  const price = GATE.TICKET_PRICE * (kind === "continental" ? GATE.CONTINENTAL_MULT : 1);
  return Math.round(capacity * GATE.FILL_RATE * price);
}
