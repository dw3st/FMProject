/**
 * Who plays where after a live formation change (tester report): each player goes to the slot that
 * suits him, so a change does not leave half the team out of position. Pure, and only reads what
 * the two-manager match also sends to the browser (aptitudes, role, slot), so its preview matches.
 */
import type { Aptitude } from "@/Domain/positions/positionConfig";

export interface ReorganizePlayer {
  id: number;
  role: string;
  slotIndex: number;
  /** Absent (test or lab players): nobody moves. */
  aptitudes?: Partial<Record<string, Aptitude>> | undefined;
}

interface SlotDef { role: string; x: number; y: number }

/** Cost of each aptitude: a player only goes out of position when the shape leaves no better option. */
const APTITUDE_COST: Record<Aptitude, number> = { natural: 0, apt: 1, training: 4, unsuitable: 10 };
/** Among equal fits, the closest slot to where he plays now (per yard): small next to any aptitude step. */
const DISTANCE_COST = 0.002;

/**
 * Minimum-cost assignment (Hungarian): `cost[row][col]`, rows <= cols. Returns the column of each row.
 */
export function assignMinCost(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const match = new Array<number>(m + 1).fill(0); // column -> row (1-based, 0 = free)
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    match[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = match[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) { minv[j] = cur; way[j] = j0; }
        if (minv[j]! < delta) { delta = minv[j]!; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[match[j]!] = u[match[j]!]! + delta; v[j] = v[j]! - delta; }
        else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (match[j0] !== 0);
    do {
      const j1 = way[j0]!;
      match[j0] = match[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (match[j]! > 0) out[match[j]! - 1] = j - 1;
  return out;
}

/**
 * The slot of each player in `next` (player id -> slot index). The keeper takes the keeper's slot and
 * nobody else can; `blocked` slots stay empty (an injured player's slot waiting for the manager's
 * pick). Anyone without aptitudes keeps the whole team where it is, and so does a slot shortage.
 */
export function reorganizedSlots(
  players: readonly ReorganizePlayer[],
  current: readonly SlotDef[],
  next: readonly SlotDef[],
  blocked: readonly number[] = [],
): Map<number, number> {
  const keep = new Map(players.map((p) => [p.id, p.slotIndex]));
  if (players.some((p) => !p.aptitudes)) return keep;
  const gkSlot = next.findIndex((s) => s.role === "GK");
  const keeper = players.find((p) => p.role === "GK");
  const out = new Map<number, number>();
  if (keeper && gkSlot >= 0) out.set(keeper.id, gkSlot);
  const field = players.filter((p) => p !== keeper);
  const slots = next.map((s, i) => ({ s, i })).filter(({ s, i }) => s.role !== "GK" && !blocked.includes(i));
  if (field.length > slots.length) return keep;
  if (field.length === 0) return out;
  const cost = field.map((p) => {
    const from = current[p.slotIndex];
    return slots.map(({ s }) => {
      const aptitude = APTITUDE_COST[p.aptitudes?.[s.role] ?? "unsuitable"];
      const distance = from ? Math.hypot(s.x - from.x, s.y - from.y) : 0;
      return aptitude + distance * DISTANCE_COST;
    });
  });
  assignMinCost(cost).forEach((col, row) => { out.set(field[row]!.id, slots[col]!.i); });
  return out;
}
