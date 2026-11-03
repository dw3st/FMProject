/**
 * Who stopped being waited for between two states of the group advance, leaving out the manager himself: the moment
 * another manager marked himself ready (a sound on the screens, tester request).
 */
export function othersNowReady(before: readonly string[] | null, after: readonly string[], me: string | null): string[] {
  if (!before) return [];
  return before.filter((name) => name !== me && !after.includes(name));
}
