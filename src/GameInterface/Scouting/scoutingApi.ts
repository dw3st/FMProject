import { useCallback, useEffect, useState } from "react";
import type { ScoutAssignment, ScoutProspect, ScoutReport, ShortlistEntry } from "@/types/scoutingTypes";
import type { RosterPlayer } from "@/types/playerTypes";

/** `GET /api/saves/:id/scouting` (`src/backend/scoutingRoutes.ts`). */
export interface ScoutingScout {
  id: string;
  name: string;
  /** Stars 1..5 (coaching staff, `.claude/rules/game/staff.md`). */
  stars: number;
  /** The old 1..10 rating behind the mission gain. */
  rating: number;
  chief: boolean;
  vacant?: boolean;
  busy: boolean;
  /** Field scouts: the severance of dismissing him today (€). */
  severance?: number;
  /** Staff member id (the chief's real id; vacant: ""). */
  memberId: string;
  nationality: string;
  /** Country he knows best (vacant chief: null). */
  strongCountry: { country: string; k: number } | null;
  /** Knowledge of every country he knows (> 0). */
  countries: Record<string, number>;
  /** Mean knowledge over the countries a continent mission visits. */
  continents: Record<string, number>;
}

interface ScoutingMissionView extends ScoutAssignment {
  weeklyCost: number;
  scout: ScoutingScout | null;
}

interface ShortlistView extends ShortlistEntry {
  missing?: boolean;
  club?: string;
  leagueSlug?: string;
  clubSlug?: string;
  age?: number;
  position?: string;
  knowledge?: number;
  overall?: [number, number];
  value?: [number, number];
  forSale?: boolean;
  contractUntil?: string | null;
  contractEnding?: boolean;
  injured?: boolean;
  free?: boolean;
}

export interface ScoutingData {
  employed: boolean;
  date: string;
  ownCountry: string;
  ownContinent: string | null;
  maxFieldScouts: number;
  maxShortlist: number;
  weeks: { region: number[]; continent: number[]; youth: number[]; player: number };
  scouts: ScoutingScout[];
  missions: ScoutingMissionView[];
  reports: ScoutReport[];
  shortlist: ShortlistView[];
  prospects: ProspectView[];
}

/** A prospect on the screen: identity only (`prospectView`, the attributes stay on the server). */
interface ProspectView extends Omit<ScoutProspect, "player"> {
  player: Pick<RosterPlayer, "id" | "name" | "age" | "positions" | "nationality">;
}

export function useScouting(saveId: string | undefined) {
  const [data, setData] = useState<ScoutingData | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    if (!saveId) return;
    try {
      const r = await fetch(`/api/saves/${saveId}/scouting`);
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as ScoutingData);
      setError(false);
    } catch {
      setError(true);
    }
  }, [saveId]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, reload };
}

/** POST/DELETE helper returning the JSON body or `{ error }`. */
export async function scoutingCall(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, json };
}

/** A player link that resolves the club by id in any league (`squadRouteResolve`). */
export function playerHref(playerId: string, squadId: string, leagueSlug?: string): string {
  return `/player/${encodeURIComponent(leagueSlug || "any")}/${encodeURIComponent(squadId)}/${encodeURIComponent(playerId)}`;
}

/** One country of `GET /api/saves/:id/staff/:memberId/countries` (`src/backend/staffRoutes.ts`). */
export interface ScoutCountryView {
  country: string;
  slug: string;
  name: string;
  flag: string;
  iso2: string;
  continent: string;
  k: number;
  band: "full" | "moderate" | "none";
  native: boolean;
  last?: string;
}

export interface ScoutCountriesData {
  memberId: string;
  name: string;
  nationality: string;
  countries: ScoutCountryView[];
}

export async function getScoutCountries(saveId: string, memberId: string): Promise<ScoutCountriesData> {
  const r = await fetch(`/api/saves/${saveId}/staff/${encodeURIComponent(memberId)}/countries`);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as ScoutCountriesData;
}
