import { useEffect, useState } from "react";
import type { AwardsResponse } from "@/backend/awardsRoutes";

export type AwardsState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ok"; data: AwardsResponse };

/** `GET /api/saves/:id/awards[?year=]` (`.claude/rules/game/awards.md`); 404 = no awards yet. */
export function useAwards(saveId: string | undefined, year: number | null, refreshKey?: string): AwardsState {
  const [state, setState] = useState<AwardsState>({ status: "loading" });
  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/saves/${saveId}/awards${year !== null ? `?year=${year}` : ""}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) return setState({ status: "empty" });
        if (!r.ok) return setState({ status: "error" });
        setState({ status: "ok", data: (await r.json()) as AwardsResponse });
      })
      .catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [saveId, year, refreshKey]);
  return state;
}
