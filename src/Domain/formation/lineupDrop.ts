/**
 * Pure lineup edits for drag-and-drop on the formation screen.
 * Lineup = player ids by slot index ("" = empty slot).
 */
export type LineupEnd = { kind: "slot"; index: number } | { kind: "bench"; playerId: string };

/**
 * Applies dropping `source` onto `target`:
 *  - slot -> slot: swap the two starters (works with empty slots);
 *  - bench player -> slot: assigns him, the displaced starter goes to the bench;
 *  - slot -> bench player: the bench player takes the slot, the starter goes to the bench;
 *  - bench -> bench: nothing.
 * `isBlocked` marks players who cannot start (injured). Returns null when nothing changes.
 */
export function dropOnLineup(
  lineup: readonly string[],
  source: LineupEnd,
  target: LineupEnd,
  isBlocked: (playerId: string) => boolean = () => false,
): string[] | null {
  const next = Array.from({ length: Math.max(11, lineup.length) }, (_, i) => lineup[i] ?? "");

  if (source.kind === "slot" && target.kind === "slot") {
    if (source.index === target.index) return null;
    const a = next[source.index] ?? "";
    next[source.index] = next[target.index] ?? "";
    next[target.index] = a;
    return next;
  }
  if (source.kind === "bench" && target.kind === "slot") {
    if (isBlocked(source.playerId)) return null;
    const existing = next.indexOf(source.playerId);
    if (existing !== -1) next[existing] = next[target.index] ?? "";
    next[target.index] = source.playerId;
    return next;
  }
  if (source.kind === "slot" && target.kind === "bench") {
    if (isBlocked(target.playerId)) return null;
    const existing = next.indexOf(target.playerId);
    if (existing !== -1) return null; // already a starter: not a bench target
    next[source.index] = target.playerId;
    return next;
  }
  return null;
}

/** Tab of the squad panel (starting XI / bench) under a dragged item, from its `data-drop` value. */
export type SquadPanelTab = "starting" | "bench";

/**
 * While dragging, hovering a squad-panel tab (`data-drop="tab:bench"`) opens it, so a pitch player
 * can be dropped on a bench player (and a bench player found) without letting go (#72).
 */
export function tabUnderDrag(over: string | null | undefined): SquadPanelTab | null {
  if (over === "tab:bench") return "bench";
  if (over === "tab:starting") return "starting";
  return null;
}
