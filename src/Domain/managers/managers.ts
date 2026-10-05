import { MANAGERS } from "@/Domain/managers/managerConfig";
import { CONTINENTAL, isContinentalSlug } from "@/Domain/continental/competitions";
import type { ManagerRecord, ManagerTitle } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

/** Pure manager-ranking logic (`.claude/rules/game/managers.md`). No I/O. */

/** Country weight: tier-1 average level ÷ big-5 average level, clamped to [WEIGHT_MIN, WEIGHT_MAX]. */
export function countryWeight(countryLevel: number, big5Level: number): number {
  if (!(big5Level > 0) || !(countryLevel > 0)) return MANAGERS.WEIGHT_MIN;
  return Math.min(MANAGERS.WEIGHT_MAX, Math.max(MANAGERS.WEIGHT_MIN, countryLevel / big5Level));
}

export function leaguePoints(tier: number, weight: number): number {
  const base = tier <= 1 ? MANAGERS.POINTS.LEAGUE_TOP : MANAGERS.POINTS.LEAGUE_LOWER;
  return Math.round(base * weight);
}

export function cupPoints(weight: number): number {
  return Math.round(MANAGERS.POINTS.CUP * weight);
}

export function continentalPoints(slug: string): number {
  if (!isContinentalSlug(slug)) return 0;
  return CONTINENTAL[slug].primary ? MANAGERS.POINTS.CONTINENTAL_PRIMARY : MANAGERS.POINTS.CONTINENTAL_SECONDARY;
}

export function promotionPoints(): number {
  return MANAGERS.POINTS.PROMOTION;
}

/** The manager in charge of a club (the human manager replaces his club's coach, so at most one). */
export function managerOfSquad(managers: ManagerRecord[], squadId: string): ManagerRecord | undefined {
  return managers.find((m) => m.squadId === squadId);
}

const sameTitle = (a: ManagerTitle, b: ManagerTitle) =>
  a.season === b.season && a.kind === b.kind && a.competition === b.competition && a.squadId === b.squadId;

/**
 * Credits a title to the manager of `title.squadId`. Returns the same array when nothing changes
 * (no manager for the club, or that exact title already recorded — a retried day).
 */
export function awardTitle(managers: ManagerRecord[], title: ManagerTitle): ManagerRecord[] {
  const i = managers.findIndex((m) => m.squadId === title.squadId);
  if (i < 0) return managers;
  const m = managers[i]!;
  if (m.titles.some((t) => sameTitle(t, title))) return managers;
  const out = managers.slice();
  out[i] = { ...m, points: m.points + title.points, titles: [...m.titles, title] };
  return out;
}

/** One more completed season for the club's manager, counted once per season label. */
export function addSeason(managers: ManagerRecord[], squadId: string, season: string): ManagerRecord[] {
  const i = managers.findIndex((m) => m.squadId === squadId);
  if (i < 0 || managers[i]!.lastSeason === season) return managers;
  const out = managers.slice();
  out[i] = { ...managers[i]!, seasons: managers[i]!.seasons + 1, lastSeason: season };
  return out;
}

/** Ranking order: points desc, then number of titles desc, then name, then id. */
export function rankManagers(managers: ManagerRecord[]): ManagerRecord[] {
  return [...managers].sort((a, b) =>
    b.points - a.points
    || b.titles.length - a.titles.length
    || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * One manager per club at career creation: the club's imported coach (`coach_<id>`, or
 * `coach_<squadId>` / "Técnico do <clube>" without one), the human manager replacing his club's.
 */
export function buildInitialManagers(
  squads: Pick<Squad, "id" | "name" | "coach">[],
  player: { squadId: string; name: string; from?: string } | null,
  /** Career start: every manager's first passage starts here (Etapa 25). */
  from?: string,
): ManagerRecord[] {
  const start = from ?? player?.from;
  const used = new Set<string>();
  const out: ManagerRecord[] = [];
  for (const s of squads) {
    if (player && s.id === player.squadId) {
      out.push({
        id: "player", name: player.name, squadId: s.id, isPlayer: true, points: 0, seasons: 0, titles: [],
        ...(start ? { clubs: [{ squadId: s.id, from: start }] } : {}),
      });
      used.add("player");
      continue;
    }
    let id = s.coach?.id !== undefined && s.coach?.id !== null ? `coach_${s.coach.id}` : `coach_${s.id}`;
    if (used.has(id)) id = `coach_${s.id}`;
    for (let n = 2; used.has(id); n++) id = `coach_${s.id}_${n}`;
    used.add(id);
    const name = s.coach?.name?.trim() || `Técnico do ${s.name}`;
    out.push({
      id, name, squadId: s.id, isPlayer: false, points: 0, seasons: 0, titles: [],
      ...(start ? { clubs: [{ squadId: s.id, from: start }] } : {}),
    });
  }
  return out;
}

/**
 * A page of the ranking: `ranked` already sorted (`rankManagers`), filtered by `inScope`, ranks are
 * 1-based within the scope. `playerRank` is the human manager's rank in the scope (null outside it).
 */
export function rankingPage(
  ranked: ManagerRecord[],
  inScope: (m: ManagerRecord) => boolean,
  offset: number,
  limit: number,
): { total: number; playerRank: number | null; items: (ManagerRecord & { rank: number })[] } {
  const scoped = ranked.filter(inScope);
  const p = scoped.findIndex((m) => m.isPlayer);
  return {
    total: scoped.length,
    playerRank: p >= 0 ? p + 1 : null,
    items: scoped.slice(offset, offset + limit).map((m, i) => ({ ...m, rank: offset + i + 1 })),
  };
}
