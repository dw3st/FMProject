/**
 * Jostling in the box before a corner or a crossed free kick (drawing only): each attacker in the box and the defender
 * marking him push and pull at each other while the taker waits. Pure: small offsets (engine yards) from the drawn
 * positions and the clock; the engine never sees them.
 */
import type { Pos } from "@/GraficsEngine/renderInterp";

export const JOSTLE = {
  /** Attackers this close to the goal line (yards) jostle. */
  BOX_DEPTH: 20,
  /** A defender this close (yards) is his marker. */
  MARK_YDS: 3,
  /** Push amplitude (yards) and push-pull rate (cycles per real second). */
  AMP_YDS: 0.35,
  RATE: 1.6,
} as const;

/**
 * Offsets of the pairs that jostle at `now` (real seconds). `players` with their team and drawn position; `attackTeam`
 * the team taking the set piece, attacking the goal at `goalX`.
 */
export function jostleOffsets(
  players: readonly { id: number; team: "A" | "B"; keeper: boolean }[],
  pos: ReadonlyMap<number, Pos>,
  attackTeam: "A" | "B",
  goalX: number,
  now: number,
): Map<number, Pos> {
  const out = new Map<number, Pos>();
  const taken = new Set<number>();
  const attackers = players.filter((p) => p.team === attackTeam && !p.keeper);
  const defenders = players.filter((p) => p.team !== attackTeam && !p.keeper);
  for (const a of attackers) {
    const pa = pos.get(a.id);
    if (!pa || Math.abs(pa.x - goalX) > JOSTLE.BOX_DEPTH) continue;
    let best: { id: number; p: Pos; d: number } | null = null;
    for (const d of defenders) {
      if (taken.has(d.id)) continue;
      const pd = pos.get(d.id);
      if (!pd) continue;
      const dist = Math.hypot(pd.x - pa.x, pd.y - pa.y);
      if (dist <= JOSTLE.MARK_YDS && (!best || dist < best.d)) best = { id: d.id, p: pd, d: dist };
    }
    if (!best || best.d === 0) continue;
    taken.add(best.id);
    const ux = (best.p.x - pa.x) / best.d, uy = (best.p.y - pa.y) / best.d;
    // Each pair on its own beat; both lean the same way, so they stay apart and look like a push and a pull.
    const s = JOSTLE.AMP_YDS * Math.sin(2 * Math.PI * JOSTLE.RATE * now + a.id * 1.7);
    out.set(a.id, { x: ux * s, y: uy * s });
    out.set(best.id, { x: ux * s * 0.8, y: uy * s * 0.8 });
  }
  return out;
}
