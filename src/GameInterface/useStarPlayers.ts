import { useEffect, useState } from "react";
import type { StarKind } from "@/Domain/world/stars";

interface StarsCacheEntry {
  key: string;
  stars: Map<string, StarKind>;
}

/**
 * Module-level cache keyed by `saveId#currentDate`, shared by every component using this hook —
 * one fetch per game day per screen session instead of one per mounted component. A failed
 * fetch is never cached: that render sees an empty set, and the next mount (or key change)
 * retries the request instead of being stuck on the failure forever.
 */
let cache: StarsCacheEntry | null = null;
let pending: { key: string; promise: Promise<Map<string, StarKind> | null> } | null = null;

async function fetchStarIds(saveId: string): Promise<Map<string, StarKind> | null> {
  try {
    const res = await fetch(`/api/saves/${saveId}/stars`);
    if (!res.ok) return null;
    const data = (await res.json()) as { stars?: Record<string, StarKind> };
    return new Map(Object.entries(data.stars ?? {}));
  } catch {
    return null;
  }
}

/**
 * Star kind (gold/blue/green) per player id for `saveId` as of `currentDate` — see
 * `src/Domain/world/stars.ts`. Refetches whenever the game day advances.
 */
export function useStarPlayers(
  saveId: string | null | undefined,
  currentDate: string | null | undefined,
): Map<string, StarKind> {
  const key = saveId ? `${saveId}#${currentDate ?? ""}` : null;
  const [ids, setIds] = useState<Map<string, StarKind>>(() => (key && cache?.key === key ? cache.stars : new Map()));

  useEffect(() => {
    if (!saveId || !key) return;
    if (cache?.key === key) {
      setIds(cache.stars);
      return;
    }
    let cancelled = false;
    const run = pending?.key === key ? pending.promise : (pending = { key, promise: fetchStarIds(saveId) }).promise;
    void run.then((result) => {
      if (pending?.key === key) pending = null;
      if (cancelled) return;
      if (result) {
        cache = { key, stars: result };
        setIds(result);
      } else {
        // Failure: cache left untouched so the next mount / key change retries.
        setIds(new Map());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [saveId, key]);

  return ids;
}
