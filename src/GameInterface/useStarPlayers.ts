import { useEffect, useState } from "react";

/**
 * Module-level cache so every component using this hook for the same save shares one fetch
 * per screen session, instead of each mounting component hitting `/stars` on its own.
 */
let cachedSaveId: string | null = null;
let cachedIds: Set<string> | null = null;
let pending: Promise<Set<string>> | null = null;

async function fetchStarIds(saveId: string): Promise<Set<string>> {
  try {
    const res = await fetch(`/api/saves/${saveId}/stars`);
    if (!res.ok) return new Set();
    const data = (await res.json()) as { playerIds?: string[] };
    return new Set(Array.isArray(data.playerIds) ? data.playerIds : []);
  } catch {
    return new Set();
  }
}

/** Ids of the world's top-50 players (by overall AVG) for `saveId` — see `src/Domain/world/stars.ts`. */
export function useStarPlayers(saveId: string | null | undefined): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() =>
    saveId && cachedSaveId === saveId && cachedIds ? cachedIds : new Set(),
  );

  useEffect(() => {
    if (!saveId) return;
    if (cachedSaveId === saveId && cachedIds) {
      setIds(cachedIds);
      return;
    }
    if (cachedSaveId !== saveId) {
      cachedSaveId = saveId;
      cachedIds = null;
      pending = null;
    }
    let cancelled = false;
    const run = pending ?? (pending = fetchStarIds(saveId));
    void run.then((result) => {
      if (cancelled) return;
      cachedIds = result;
      setIds(result);
    });
    return () => {
      cancelled = true;
    };
  }, [saveId]);

  return ids;
}
