import { useEffect, useState } from "react";

interface StarsCacheEntry {
  key: string;
  ids: Set<string>;
}

/**
 * Module-level cache keyed by `saveId#currentDate`, shared by every component using this hook —
 * one fetch per game day per screen session instead of one per mounted component. A failed
 * fetch is never cached: that render sees an empty set, and the next mount (or key change)
 * retries the request instead of being stuck on the failure forever.
 */
let cache: StarsCacheEntry | null = null;
let pending: { key: string; promise: Promise<Set<string> | null> } | null = null;

async function fetchStarIds(saveId: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`/api/saves/${saveId}/stars`);
    if (!res.ok) return null;
    const data = (await res.json()) as { playerIds?: string[] };
    return new Set(Array.isArray(data.playerIds) ? data.playerIds : []);
  } catch {
    return null;
  }
}

/**
 * Ids of the world's top-50 players (by overall AVG) for `saveId` as of `currentDate` — see
 * `src/Domain/world/stars.ts`. Refetches whenever the game day advances.
 */
export function useStarPlayers(
  saveId: string | null | undefined,
  currentDate: string | null | undefined,
): Set<string> {
  const key = saveId ? `${saveId}#${currentDate ?? ""}` : null;
  const [ids, setIds] = useState<Set<string>>(() => (key && cache?.key === key ? cache.ids : new Set()));

  useEffect(() => {
    if (!saveId || !key) return;
    if (cache?.key === key) {
      setIds(cache.ids);
      return;
    }
    let cancelled = false;
    const run = pending?.key === key ? pending.promise : (pending = { key, promise: fetchStarIds(saveId) }).promise;
    void run.then((result) => {
      if (pending?.key === key) pending = null;
      if (cancelled) return;
      if (result) {
        cache = { key, ids: result };
        setIds(result);
      } else {
        // Failure: cache left untouched so the next mount / key change retries.
        setIds(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [saveId, key]);

  return ids;
}
