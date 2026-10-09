import type { RefereesResponse } from "@/backend/refereeRoutes";

/** Referees tab data (`GET /api/saves/:id/referees`, `.claude/rules/game/referees.md`). */
export async function fetchReferees(saveId: string, competition: string, season: string | null): Promise<RefereesResponse | null> {
  const q = new URLSearchParams({ competition });
  if (season) q.set("season", season);
  const r = await fetch(`/api/saves/${saveId}/referees?${q.toString()}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<RefereesResponse>;
}
