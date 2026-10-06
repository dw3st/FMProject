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

/** The human club's morale overview; `reload` after a talk or a status change. Null while loading or without a club. */
export function useMorale(saveId: string | undefined): { data: MoraleData | null; reload: () => void } {
  const [data, setData] = useState<MoraleData | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!saveId) return;
    const controller = new AbortController();
    fetch(`/api/saves/${saveId}/morale`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<MoraleData>) : null))
      .then((d) => { if (!controller.signal.aborted) setData(d); })
      .catch(() => { /* keep the last data */ });
    return () => controller.abort();
  }, [saveId, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, reload };
}
