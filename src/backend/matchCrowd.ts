import type { SaveMeta, SaveService } from "@/backend/SaveService";
import { getLeagueData } from "@/backend/advanceDay";
import { leagueTierOf } from "@/backend/facilityWorld";
import { homeMatchImportance } from "@/backend/matchImportance";
import { stadiumFillRate } from "@/Domain/boardFans/boardFans";
import { attendanceOf, seasonFraction } from "@/Domain/facilities/facilities";
import { managerFaceCountry, type ManagerFace } from "@/Domain/faces/managerFace";
import { GATE } from "@/Domain/finance/gate";
import type { Fixture } from "@/types/calendarTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

/** Crowd of the live match (spec 2026-10-08-match-visual §7). */
export interface MatchCrowd {
  attendance: number;
  capacity: number;
  neutral: boolean;
  /** Big-match multiplier applied to the demand (1 when none or not applied). */
  importance: number;
  /** false: no data (neutral venue) — the screen uses the default fill. */
  known: boolean;
}

export interface MatchManagers {
  mine: { id: string; face?: ManagerFace | null; nationality: string | null };
  opponent: { id: string; nationality: string | null } | null;
}

/**
 * The crowd of today's game of the human club — the same number the gate of the day charges: a home
 * game with facilities = `attendanceOf` (season phase, date, big-match multiplier); without
 * facilities = capacity × the fans' fill rate; away = the AI rule (home capacity × GATE.FILL_RATE);
 * a neutral venue is unknown.
 */
export async function matchCrowd(
  service: SaveService, meta: SaveMeta, fixture: Fixture, mySquad: Squad, opponentSquad: Squad,
): Promise<MatchCrowd> {
  const home = fixture.home === mySquad.id ? mySquad : opponentSquad;
  const homeCapacity = home.venue?.capacity ?? 0;
  if (fixture.neutral) {
    return { attendance: 0, capacity: homeCapacity, neutral: true, importance: 1, known: false };
  }
  if (fixture.home !== mySquad.id) {
    return { attendance: Math.round(homeCapacity * GATE.FILL_RATE), capacity: homeCapacity, neutral: false, importance: 1, known: true };
  }
  const fans = meta.board?.fans;
  if (!mySquad.facilities) {
    const fill = fans === undefined ? GATE.FILL_RATE : stadiumFillRate(fans);
    return { attendance: Math.round(homeCapacity * fill), capacity: homeCapacity, neutral: false, importance: 1, known: true };
  }
  const index = await service.getSquadIndex(meta.id);
  const leagueSlug = index.byId(mySquad.id)?.leagueSlug ?? meta.leagueSlug;
  const state = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug);
  const importance = await homeMatchImportance(service, meta.id, fixture, mySquad.id, {
    leagueSlug: meta.leagueSlug,
    squadOf: async (id) => (id === mySquad.id ? mySquad : id === opponentSquad.id ? opponentSquad : service.getSquadById(meta.id, id)),
  });
  const a = attendanceOf(mySquad.facilities, {
    followers: mySquad.finances?.followers ?? 0,
    tier: await leagueTierOf(leagueSlug),
    ...(fans !== undefined ? { fans } : {}),
    ...(state ? { fraction: seasonFraction(fixture.date, state.start, state.end) } : {}),
    date: fixture.date,
    ...(importance.mult !== 1 ? { importance: importance.mult } : {}),
  });
  return { attendance: Math.round(a.attendance), capacity: a.capacity, neutral: false, importance: importance.mult, known: true };
}

/** Country (leagueData) of the league a club plays in; null when unknown. */
export async function clubCountryResolver(service: SaveService, saveId: string): Promise<(squadId: string) => string | null> {
  const index = await service.getSquadIndex(saveId);
  const catalog = await getLeagueData();
  const countryOf = new Map(catalog.map((l) => [l.slug, l.country] as const));
  return (squadId: string) => {
    const slug = index.byId(squadId)?.leagueSlug;
    return slug ? countryOf.get(slug) ?? null : null;
  };
}

/**
 * Both managers of today's game: the human (saved avatar and nationality) and the opponent's
 * (the `managers.json` record of that club, appearance from the country of his first club, as on
 * the managers tab). No record (save without `managers.json`) = null: the screen draws a silhouette.
 */
export function matchManagers(
  meta: SaveMeta, records: readonly ManagerRecord[], opponentId: string, countryOfClub: (squadId: string) => string | null,
): MatchManagers {
  const opp = records.find((m) => m.squadId === opponentId && !m.isPlayer);
  return {
    mine: { id: "player", face: meta.manager?.face ?? null, nationality: managerFaceCountry(meta.manager?.nationalityIso) },
    opponent: opp ? { id: opp.id, nationality: countryOfClub(opp.clubs?.[0]?.squadId ?? opp.squadId) } : null,
  };
}
