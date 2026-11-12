import type { RegistrationCompView, RegistrationRowView } from "@/types/registrationTypes";

/** One player of the squad with his row in each competition (absent where the competition does not list him). */
export interface RegistrationTableRow {
  /** His row in the first competition that lists him: name, age, position and rating are the same in all. */
  base: RegistrationRowView;
  marks: Record<string, RegistrationRowView>;
}

/**
 * One list of players for every competition (tester report): the rows of each competition joined by player, in the
 * order of the first competition (squad position order), players only listed further on after them.
 */
export function registrationTableRows(comps: readonly RegistrationCompView[]): RegistrationTableRow[] {
  const byId = new Map<string, RegistrationTableRow>();
  for (const c of comps) {
    for (const r of c.rows) {
      const row = byId.get(r.id);
      if (row) row.marks[c.slug] = r;
      else byId.set(r.id, { base: r, marks: { [c.slug]: r } });
    }
  }
  return [...byId.values()];
}

/** The ids a competition's list holds after ticking or unticking one player (free players are never sent). */
export function toggledIds(comp: RegistrationCompView, playerId: string, registered: boolean): string[] {
  const ids = comp.rows.filter((r) => r.registered && !r.free && r.id !== playerId).map((r) => r.id);
  return registered ? [...ids, playerId] : ids;
}

/** A row's value in any competition (`true` when some competition says so) and the competition that says it. */
export function anyMark(row: RegistrationTableRow, test: (r: RegistrationRowView) => boolean): RegistrationRowView | null {
  for (const r of Object.values(row.marks)) if (test(r)) return r;
  return null;
}
