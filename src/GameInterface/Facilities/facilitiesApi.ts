import type { StadiumShape } from "@/Domain/matchday/stadiumShape";
import type { StandDepths } from "@/Domain/facilities/standDepth";
import { useCallback, useEffect, useState } from "react";
import type { AcademyEffects, ProjectQuote, TrainingGroundEffects } from "@/Domain/facilities/facilities";
import type { ItemEffect } from "@/Domain/facilities/facilityItems";
import type { ComponentCounts, ComponentId, CraftQuality, CraftStock } from "@/types/craftTypes";
import type {
  ClubFacilities, FacilityGroup, FacilityItemId, FacilityProject, FacilityRequest, MowingPattern, TurfType,
} from "@/types/facilityTypes";

/** What a quote asks from the stock (`facilityRoutes.ts` → `buildOf`, craft spec 2026-11-18). */
export interface QuoteBuild {
  recipe: ComponentCounts;
  missing: ComponentCounts;
  /** Recipe components the workshop cannot make yet. */
  locked: ComponentId[];
  canBuild: boolean;
}

export type ItemQuote = ProjectQuote & { build: QuoteBuild };

/** One facility item (`GET .../facilities` → `items`). */
export interface FacilityItemView {
  id: FacilityItemId;
  group: FacilityGroup;
  level: number;
  condition: number;
  condemned: boolean;
  /** Quality of the last works built from the stock; null = common. */
  quality: "good" | "excellent" | null;
  effects: ItemEffect[];
  project: (FacilityProject & { progress: number }) | null;
  quotes: {
    repair: { "25": ItemQuote | null; "50": ItemQuote | null; "100": ItemQuote | null };
    rebuild: ItemQuote | null;
    upgrade: ItemQuote | null;
  };
}

/** `GET /api/saves/:id/facilities` (`src/backend/facilityRoutes.ts`). */
export interface FacilitiesViewData {
  date: string;
  facilities: ClubFacilities;
  capacity: number;
  effectiveCapacity: number;
  priceMult: number;
  /** Group levels 1..5 derived from the items (fractional). */
  levels: { comfort: number; training: number; academy: number };
  seatCost: number;
  revenue: number;
  balance: number;
  board: number;
  weeklyUpkeep: number;
  /** Groups with a works running: one at a time per group (#152). */
  busyGroups?: FacilityGroup[];
  /** Grass and mowing of the stadium pitch (spec 2026-10-16-pitch-types). */
  turf: TurfType;
  mowing: MowingPattern;
  /** The turf works to each grass (null: the current one). */
  turfQuotes: Record<TurfType, ItemQuote | null>;
  committed: number;
  demandInput: { followers: number; tier: number; fans: number };
  season: { start: string; end: string } | null;
  /** The ground as the live match draws it: name, shape, each stand's depth (null = all full). */
  stadium?: { name: string | null; shape: StadiumShape; depths: StandDepths | null };
  /** The ten items with their quotes. */
  items: FacilityItemView[];
  /** Big-match multiplier (derby, knockout) of each coming home game, by fixture id; absent = 1. */
  importanceByFixture?: Record<string, number>;
  quotes: { comfort: ItemQuote | null; training: ItemQuote | null; academy: ItemQuote | null };
  /** The workshop's stock (craft). */
  stock?: CraftStock;
  effects: {
    training: { current: TrainingGroundEffects; next: TrainingGroundEffects };
    academy: { current: AcademyEffects; next: AcademyEffects };
  };
}

export type RequestOutcome =
  | { built: true; project: FacilityProject; quality: CraftQuality }
  | {
    built: false;
    reason: "missing_components" | "busy" | "maxLevel" | "noClub" | "invalidRequest" | "error";
    group?: FacilityGroup;
    missing?: ComponentCounts;
  };

/** Facilities of the human club; `request` builds a works from the stock, `cancel` stops one; both refresh the view. */
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
    if (!saveId) return { built: false, reason: "error" };
    try {
      const r = await fetch(`/api/saves/${saveId}/facilities/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = await r.json().catch(() => ({})) as Record<string, unknown>;
      if (!r.ok) {
        if (body.error === "missingComponents") {
          return { built: false, reason: "missing_components", missing: (body.missing ?? {}) as ComponentCounts };
        }
        const reason = typeof body.error === "string" && ["busy", "maxLevel", "noClub", "invalidRequest"].includes(body.error) ? body.error : "error";
        const group = reason === "busy" && typeof body.group === "string" ? (body.group as FacilityGroup) : undefined;
        return {
          built: false, reason: reason as "busy" | "maxLevel" | "noClub" | "invalidRequest" | "error",
          ...(group ? { group } : {}),
        };
      }
      if (body.view) setData(body.view as FacilitiesViewData);
      return { built: true, project: body.project as FacilityProject, quality: (body.quality ?? "common") as CraftQuality };
    } catch {
      return { built: false, reason: "error" };
    }
  }, [saveId]);

  /** Stops a works built from the stock; half its components go back. */
  const cancel = useCallback(async (projectId: string): Promise<boolean> => {
    if (!saveId) return false;
    try {
      const r = await fetch(`/api/saves/${saveId}/facilities/cancel`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }),
      });
      if (!r.ok) return false;
      const body = await r.json() as { view?: FacilitiesViewData };
      if (body.view) setData(body.view);
      return true;
    } catch { return false; }
  }, [saveId]);

  const setMowing = useCallback(async (mowing: MowingPattern): Promise<boolean> => {
    if (!saveId) return false;
    try {
      const r = await fetch(`/api/saves/${saveId}/facilities/mowing`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mowing }),
      });
      if (!r.ok) return false;
      const body = await r.json() as { view?: FacilitiesViewData };
      if (body.view) setData(body.view);
      return true;
    } catch { return false; }
  }, [saveId]);

  return { data, error, request, cancel, setMowing };
}
