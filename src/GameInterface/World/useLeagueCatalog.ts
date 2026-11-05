import { useEffect, useState } from "react";
import type { LeagueData } from "@/types/playerTypes";

let cached: LeagueData[] | null = null;
let pending: Promise<LeagueData[]> | null = null;

/** The league catalog for competition names, fetched once per page. Empty until it arrives or if it fails. */
export function useLeagueCatalog(): LeagueData[] {
  const [leagues, setLeagues] = useState<LeagueData[]>(cached ?? []);
  useEffect(() => {
    if (cached) return;
    pending ??= fetch("/api/leagues")
      .then((r) => (r.ok ? (r.json() as Promise<LeagueData[]>) : []))
      .then((list) => { if (list.length > 0) cached = list; pending = null; return list; })
      .catch(() => { pending = null; return [] as LeagueData[]; });
    let alive = true;
    void pending.then((list) => { if (alive) setLeagues(list); });
    return () => { alive = false; };
  }, []);
  return leagues;
}
