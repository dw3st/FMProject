/**
 * Per-save write counter for in-memory read caches (e.g. the scout search cache).
 *
 * `FileSystemDAL` bumps it after every squad / market file hits disk, so it covers both direct
 * writes (mid-day transfers, sell-list edits, finance PUTs) and a `BufferingSaveDAL` flush.
 * Process-local: it only needs to be monotonic for the lifetime of the server.
 */
const versions = new Map<string, number>();

export function bumpSaveDataVersion(saveId: string): void {
  versions.set(saveId, (versions.get(saveId) ?? 0) + 1);
}

export function getSaveDataVersion(saveId: string): number {
  return versions.get(saveId) ?? 0;
}
