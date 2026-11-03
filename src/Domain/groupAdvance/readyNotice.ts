/**
 * Who stopped being waited for between two states of the group advance, leaving out the manager himself: the moment
 * another manager marked himself ready (a sound on the screens, tester request).
 */
export function othersNowReady(before: readonly string[] | null, after: readonly string[], me: string | null): string[] {
  if (!before) return [];
  return before.filter((name) => name !== me && !after.includes(name));
}

/** The world is held by this manager alone. */
export function isOnlyMe(waiting: readonly string[] | null | undefined, me: string | null): boolean {
  return !!me && waiting?.length === 1 && waiting[0] === me;
}

/** The moment the world started waiting for this manager alone. Nothing on the first state (the screen just opened). */
export function myTurnNow(before: readonly string[] | null, after: readonly string[], me: string | null): boolean {
  return !!before && isOnlyMe(after, me) && !isOnlyMe(before, me);
}
