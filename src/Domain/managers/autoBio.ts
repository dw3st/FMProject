import type { ManagerRecord, ManagerTitle } from "@/types/managerTypes";

/**
 * The automatic bio of a manager with none written (user request, 8.9.40): built from his record only, so it changes
 * with his career. The screen turns each part into a sentence (`managerPage.bio.*`).
 */
export interface AutoBioParts {
  /** Where he is: in charge of a club, interim, or without a club since a year. */
  job: { kind: "club" | "interim" | "free"; club: string | null; year: string | null };
  /** First job, or seasons and clubs of the career. */
  career: { first: true } | { first: false; seasons: number; clubs: number };
  /** How many titles (promotions out) and the biggest one. */
  titles: { count: number; best: Pick<ManagerTitle, "kind" | "competition"> | null };
  /** One highlight, the strongest he has. */
  highlight:
    | { kind: "world"; year: string }
    | { kind: "league"; competition: string; season: string }
    | { kind: "promotion"; squadId: string; season: string }
    | null;
}

type Passage = { squadId: string; from: string; to?: string };
type BioInput = Pick<ManagerRecord, "squadId" | "seasons" | "titles" | "awards" | "interim"> & {
  clubs?: Passage[];
  clubName?: string | null;
};

const TITLE_RANK: Record<ManagerTitle["kind"], number> = { continental: 0, national: 1, league: 2, cup: 3, promotion: 4 };

export function autoBioParts(m: BioInput): AutoBioParts {
  const clubs = m.clubs ?? [];
  const last = clubs.length > 0 ? clubs[clubs.length - 1]! : null;
  const job: AutoBioParts["job"] = m.squadId
    ? { kind: m.interim ? "interim" : "club", club: m.clubName ?? null, year: last && !last.to && last.squadId === m.squadId ? last.from.slice(0, 4) : null }
    : { kind: "free", club: null, year: last?.to ? last.to.slice(0, 4) : null };

  const distinctClubs = new Set(clubs.map((c) => c.squadId).filter(Boolean)).size;
  const career: AutoBioParts["career"] = m.seasons <= 1 && distinctClubs <= 1
    ? { first: true }
    : { first: false, seasons: m.seasons, clubs: Math.max(1, distinctClubs) };

  const won = m.titles.filter((t) => t.kind !== "promotion");
  const best = [...won].sort((a, b) => TITLE_RANK[a.kind] - TITLE_RANK[b.kind] || b.season.localeCompare(a.season))[0];

  const awards = m.awards ?? [];
  const world = awards.filter((a) => a.kind === "world_manager").sort((a, b) => b.season.localeCompare(a.season))[0];
  const league = awards.filter((a) => a.kind === "best_manager").sort((a, b) => b.season.localeCompare(a.season))[0];
  const promo = m.titles.filter((t) => t.kind === "promotion").sort((a, b) => b.season.localeCompare(a.season))[0];
  const highlight: AutoBioParts["highlight"] = world
    ? { kind: "world", year: String(world.year ?? world.season.slice(0, 4)) }
    : league
      ? { kind: "league", competition: league.competition, season: league.season }
      : promo
        ? { kind: "promotion", squadId: promo.squadId, season: promo.season }
        : null;

  return { job, career, titles: { count: won.length, best: best ? { kind: best.kind, competition: best.competition } : null }, highlight };
}
