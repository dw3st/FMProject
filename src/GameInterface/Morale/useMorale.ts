import { useCallback, useEffect, useState } from "react";
import type { MoraleBand, PlayerPromise, SquadStatus, TalkAnswer, TalkRequest } from "@/types/moraleTypes";

/** One row of `GET /api/saves/:id/morale` (`src/backend/moraleRoutes.ts`). */
interface MoraleRow {
  id: string;
  name: string;
  morale: number;
  band: MoraleBand;
  status: SquadStatus;
  suggested: SquadStatus;
  manualStatus: boolean;
  expected: [number, number];
  played: number | null;
  trend: number | null;
  transferRequest: string | null;
  answers: TalkAnswer[];
}

export interface MoraleData {
  players: MoraleRow[];
  talks: TalkRequest[];
  promises: PlayerPromise[];
}

/**
 * The human club's morale overview; `reload` after a talk or a status change (resolves once the new
 * data is in, keeping the old data meanwhile). Null while loading or without a club.
 */
export function useMorale(saveId: string | undefined): { data: MoraleData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<MoraleData | null>(null);
  useEffect(() => {
    if (!saveId) return;
    const controller = new AbortController();
    fetch(`/api/saves/${saveId}/morale`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<MoraleData>) : null))
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch(() => { /* keep the last data */ });
    return () => controller.abort();
  }, [saveId]);
  const reload = useCallback(async () => {
    if (!saveId) return;
    try {
      const r = await fetch(`/api/saves/${saveId}/morale`);
      if (r.ok) setData((await r.json()) as MoraleData);
    } catch { /* keep the last data */ }
  }, [saveId]);
  return { data, reload };
}
