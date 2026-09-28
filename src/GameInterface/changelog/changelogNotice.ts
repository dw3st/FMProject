/**
 * Pure logic for the changelog "new version" notice — no DOM, no localStorage.
 * See `useChangelogNotice.ts` for the React hook that wraps this with persistence.
 */

/**
 * Whether the "new version" notice pill should be shown.
 *
 * - First-ever visit (`storedVersion === null`) → false. There is nothing to announce; the
 *   caller should just remember the current version instead.
 * - Stored version matches the current version → false, already seen.
 * - Stored version differs from the current version → true, the player is behind.
 */
export function shouldShowChangelogNotice(
  storedVersion: string | null,
  currentVersion: string,
): boolean {
  if (storedVersion === null) return false;
  return storedVersion !== currentVersion;
}
