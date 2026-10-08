/**
 * Tap flow of the live substitution pitch (#115), kept pure for tests.
 *
 * - starter, then bench (or bench, then starter) → substitution (when one is left and the starter
 *   is not already queued to go off);
 * - starter, then another starter → the two swap positions (outfield only, no substitution used);
 * - tapping the selected player again clears the selection; any other tap moves the selection.
 */
export type SubsSelection = { kind: "starter" | "bench"; id: number } | null;

export type SubsAction =
  | { type: "sub"; outId: number; inId: number }
  | { type: "swap"; aId: number; bId: number };

export interface SubsTapContext {
  /** A substitution can still be queued (subs left minus queued > 0). */
  canSub: boolean;
  /** Engine id → is a goalkeeper (goalkeepers never swap positions). */
  isGoalkeeper: (id: number) => boolean;
  /** Starter already queued to go off. */
  isQueuedOut: (id: number) => boolean;
}

export function tapSubsPlayer(
  sel: SubsSelection,
  tap: { kind: "starter" | "bench"; id: number },
  ctx: SubsTapContext,
): { selection: SubsSelection; action?: SubsAction } {
  if (sel && sel.kind === tap.kind && sel.id === tap.id) return { selection: null };
  if (!sel || sel.kind === "bench" && tap.kind === "bench") return { selection: tap };

  const starterId = sel.kind === "starter" ? sel.id : tap.id;
  if (sel.kind !== tap.kind) {
    const benchId = sel.kind === "bench" ? sel.id : tap.id;
    if (ctx.canSub && !ctx.isQueuedOut(starterId)) {
      return { selection: null, action: { type: "sub", outId: starterId, inId: benchId } };
    }
    return { selection: tap };
  }

  // Two starters.
  if (ctx.isGoalkeeper(sel.id) || ctx.isGoalkeeper(tap.id)) return { selection: tap };
  return { selection: null, action: { type: "swap", aId: sel.id, bId: tap.id } };
}
