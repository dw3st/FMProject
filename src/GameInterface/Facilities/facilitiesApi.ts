import { useCallback, useEffect, useState } from "react";
import type { AcademyEffects, ProjectQuote, TrainingGroundEffects } from "@/Domain/facilities/facilities";
import type { BoardRefusal, ClubFacilities, FacilityProject, FacilityRequest } from "@/types/facilityTypes";

/** `GET /api/saves/:id/facilities` (`src/backend/facilityRoutes.ts`). */
export interface FacilitiesViewData {
  date: string;
  facilities: ClubFacilities;
  capacity: number;
  effectiveCapacity: number;
  priceMult: number;
  seatCost: number;
  revenue: number;
  balance: number;
  board: number;
  weeklyUpkeep: number;
  committed: number;
  demandInput: { followers: number; tier: number; fans: number };
  season: { start: string; end: string } | null;
  /** Big-match multiplier (derby, knockout) of each coming home game, by fixture id; absent = 1. */
  importanceByFixture?: Record<string, number>;
  quotes: { comfort: ProjectQuote | null; training: ProjectQuote | null; academy: ProjectQuote | null };
  effects: {
    training: { current: TrainingGroundEffects; next: TrainingGroundEffects };
    academy: { current: AcademyEffects; next: AcademyEffects };
  };
}

export type RequestOutcome =
  | { approved: true; boardShare: number; project: FacilityProject }
  | { approved: false; reason: BoardRefusal | "busy" | "maxLevel" | "noClub" | "error" };

/** Facilities of the human club; `request` asks the board for a project and refreshes the view. */
export function useFacilities(saveId: string | undefined, refreshKey?: string | null) {
  const [data, setData] = useState<FacilitiesViewData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!saveId) return;
    let cancelled = false;
    fetch(`/api/saves/${saveId}/facilities`)
      .then((r) => (r.ok ? (r.json() as Promise<FacilitiesViewData>) : null))
      .then((d) => { if (!cancelled) { setData(d); setError(d === null); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, refreshKey]);

  const request = useCallback(async (req: FacilityRequest): Promise<RequestOutcome> => {
    if (!saveId) return { approved: false, reason: "error" };
    try {
      const r = await fetch(`/api/saves/${saveId}/facilities/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (!r.ok) {
        const reason = typeof body.error === "string" && ["busy", "maxLevel", "noClub"].includes(body.error) ? body.error : "error";
        return { approved: false, reason: reason as "busy" | "maxLevel" | "noClub" | "error" };
      }
      if (body.view) setData(body.view as FacilitiesViewData);
      return body.approved
        ? { approved: true, boardShare: body.boardShare as number, project: body.project as FacilityProject }
        : { approved: false, reason: body.reason as BoardRefusal };
    } catch {
      return { approved: false, reason: "error" };
    }
  }, [saveId]);

  return { data, error, request };
}
