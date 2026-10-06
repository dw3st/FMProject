import { JOBS } from "@/Domain/jobs/jobsConfig";
import { addDays } from "@/Domain/dates";
import type { FinancialTier } from "@/types/playerTypes";
import type { JobOffer } from "@/types/jobTypes";
import type { ManagerRecord, ManagerTitle } from "@/types/managerTypes";
import { cleanRecord, closePassage, makeInterim, toFree } from "@/Domain/managers/managerRecords";

/**
 * Job offers to the human manager (`.claude/rules/game/jobs.md`, Etapa 20). Pure: no I/O, a
 * seeded `rng` is injected wherever there is a draw.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Reputation ────────────────────────────────────────────────────────────────

/**
 * The manager's place in the world ranking as a percentile (1 = top): managers with fewer points
 * count fully, ties count half, so a career start where everyone has 0 points sits at 0.5.
 */
export function rankPercentile(managers: Pick<ManagerRecord, "id" | "points">[], managerId: string): number {
  const me = managers.find((m) => m.id === managerId);
  if (!me || managers.length < 2) return 0.5;
  let below = 0;
  let ties = 0;
  for (const m of managers) {
    if (m.id === managerId) continue;
    if (m.points < me.points) below++;
    else if (m.points === me.points) ties++;
  }
  return (below + ties / 2) / (managers.length - 1);
}

/** First year of a season label ("2026-27" → 2026, "2027" → 2027). */
function seasonStartYear(label: string): number {
  const y = parseInt(label.slice(0, 4), 10);
  return Number.isFinite(y) ? y : 0;
}

/** Ranking points of the titles won in the last TITLE_SEASONS seasons (up to `year`). */
export function recentTitlePoints(titles: Pick<ManagerTitle, "season" | "points">[], year: number): number {
  const from = year - JOBS.reputation.TITLE_SEASONS + 1;
  return titles.reduce((s, t) => (seasonStartYear(t.season) >= from ? s + t.points : s), 0);
}

export interface ReputationInput {
  /** 0..1, `rankPercentile`. */
  rankPercentile: number;
  /** Board confidence 0..100 (the current season). */
  board: number;
  /** `recentTitlePoints`. */
  titlePoints: number;
  /** Completed seasons of the career. */
  seasons: number;
}

/** 0..100: ranking 45 %, current season (board) 30 %, recent titles 15 %, career length 10 %. */
export function reputation(r: ReputationInput): number {
  const c = JOBS.reputation;
  const v =
    c.RANK_WEIGHT * clamp(r.rankPercentile, 0, 1) +
    c.BOARD_WEIGHT * clamp(r.board / 100, 0, 1) +
    c.TITLES_WEIGHT * clamp(r.titlePoints / c.TITLES_SATURATION, 0, 1) +
    c.SEASONS_WEIGHT * clamp(r.seasons / c.SEASONS_SATURATION, 0, 1);
  return Math.round(v * 10) / 10;
}

/** The human manager's reputation from the ranking file, the board and the date's year. */
export function managerReputation(managers: ManagerRecord[], board: number, year: number): number {
  const me = managers.find((m) => m.isPlayer);
  return reputation({
    rankPercentile: me ? rankPercentile(managers, me.id) : 0.5,
    board,
    titlePoints: me ? recentTitlePoints(me.titles, year) : 0,
    seasons: me?.seasons ?? 0,
  });
}

// ── Club prestige ─────────────────────────────────────────────────────────────

export interface PrestigeClub {
  squadId: string;
  /** Strength (`clubLevel`). */
  level: number;
  tier: FinancialTier;
}

/** Prestige 0..1 of every club: world percentile of strength, pulled by the financial tier. */
export function clubPrestiges(clubs: PrestigeClub[]): Map<string, number> {
  const levels = clubs.map((c) => c.level).sort((a, b) => a - b);
  const n = levels.length;
  const out = new Map<string, number>();
  const lowerBound = (v: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (levels[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperBound = (v: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (levels[mid]! <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const c of clubs) {
    const below = lowerBound(c.level);
    const ties = upperBound(c.level) - below - 1;
    const pct = n > 1 ? (below + ties / 2) / (n - 1) : 0.5;
    out.set(c.squadId, clamp(pct + JOBS.prestige.TIER_BONUS[c.tier], 0, 1));
  }
  return out;
}

// ── Who offers ────────────────────────────────────────────────────────────────

export interface PrestigeBand {
  lo: number;
  hi: number;
  /** Prestige the offers concentrate around. */
  target: number;
  sigma: number;
}

/** Employed: one step above the current club, a big jump only with a big reputation. */
export function employedBand(currentPrestige: number, rep: number): PrestigeBand {
  const b = JOBS.band;
  return {
    lo: currentPrestige - b.BELOW,
    hi: rep / 100 + b.ABOVE,
    target: currentPrestige + b.STEP,
    sigma: b.SIGMA,
  };
}

/** Unemployed: smaller clubs, up to just below the club he left. */
export function unemployedBand(lastPrestige: number): PrestigeBand {
  const b = JOBS.band;
  return {
    lo: 0,
    hi: lastPrestige - b.UNEMPLOYED_BELOW,
    target: lastPrestige - b.UNEMPLOYED_TARGET_BELOW,
    sigma: b.UNEMPLOYED_SIGMA,
  };
}

export interface OfferCandidate {
  squadId: string;
  prestige: number;
  country: string | null;
  continent: string | null;
  city?: string;
}

export interface CandidateFilter {
  band: PrestigeBand;
  /** Clubs that never offer: the manager's own, the one that just sacked him. */
  exclude: Set<string>;
  /** Mid-season: a direct rival (same city) never offers. */
  rivalCity?: string;
}

const normCity = (c: string | undefined) =>
  (c ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Clubs allowed to offer: inside the band, not excluded, not a same-city rival. */
export function eligibleCandidates(candidates: OfferCandidate[], f: CandidateFilter): OfferCandidate[] {
  const rival = f.rivalCity ? normCity(f.rivalCity) : "";
  return candidates.filter((c) =>
    !f.exclude.has(c.squadId)
    && c.prestige >= f.band.lo && c.prestige <= f.band.hi
    && !(rival && normCity(c.city) === rival));
}

/** Location weight: same country 3, same continent 2, elsewhere 1. */
function locationWeight(c: OfferCandidate, home: { country: string | null; continent: string | null }): number {
  const l = JOBS.location;
  if (home.country && c.country === home.country) return l.SAME_COUNTRY;
  if (home.continent && c.continent === home.continent) return l.SAME_CONTINENT;
  return l.OTHER;
}

/**
 * Draws up to `count` distinct clubs, weighted by location and by how close their prestige is to
 * the band's target (a step up is likely, a big jump rare).
 */
export function pickOfferingClubs(args: {
  candidates: OfferCandidate[];
  band: PrestigeBand;
  home: { country: string | null; continent: string | null };
  count: number;
  rng: () => number;
  /** Clubs with a vacant manager's job weigh × VACANCY_WEIGHT (Etapa 25). */
  vacant?: Set<string>;
}): OfferCandidate[] {
  const pool = args.candidates.map((c) => ({
    c,
    w: (args.vacant?.has(c.squadId) ? JOBS.VACANCY_WEIGHT : 1) * locationWeight(c, args.home)
      * Math.exp(-((c.prestige - args.band.target) ** 2) / (2 * args.band.sigma ** 2)),
  }));
  const out: OfferCandidate[] = [];
  while (out.length < args.count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let i = 0;
    if (total > 0) {
      let r = args.rng() * total;
      for (; i < pool.length - 1; i++) {
        r -= pool[i]!.w;
        if (r < 0) break;
      }
    } else {
      i = Math.floor(args.rng() * pool.length);
    }
    out.push(pool[i]!.c);
    pool.splice(i, 1);
  }
  return out;
}

// ── How many offers ───────────────────────────────────────────────────────────

function poisson(lambda: number, rng: () => number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l && k < 50);
  return k - 1;
}

/** Expected season-end offers: reputation 40 → ~0.3, 80 → ~2. */
export function seasonEndLambda(rep: number): number {
  const c = JOBS.seasonEnd;
  return c.BASE * Math.exp(c.K * (rep - c.PIVOT));
}

/** Offers at the player's country rollover: 0..3, drawn from the reputation. */
export function seasonEndOfferCount(rep: number, rng: () => number): number {
  return Math.min(JOBS.seasonEnd.MAX, poisson(seasonEndLambda(rep), rng));
}

/** Mid-season: 0 or 1, only for a manager with reputation ≥ 60 or a board ≥ 80. */
export function midSeasonOfferCount(rep: number, board: number, rng: () => number): number {
  const c = JOBS.midSeason;
  if (rep < c.MIN_REPUTATION && board < c.MIN_BOARD) return 0;
  const p = 1 - Math.exp(-seasonEndLambda(Math.max(rep, c.MIN_REPUTATION)) / 2);
  return rng() < p ? 1 : 0;
}

/** Unemployed: 1..3 offers every two weeks. */
export function unemployedOfferCount(rng: () => number): number {
  const c = JOBS.unemployed;
  return c.MIN + Math.floor(rng() * (c.MAX - c.MIN + 1));
}

/** Guaranteed offer after a long time without any: the least prestigious club of the band (or of all). */
export function guaranteedClub(candidates: OfferCandidate[], band: PrestigeBand): OfferCandidate | null {
  const inBand = candidates.filter((c) => c.prestige >= band.lo && c.prestige <= band.hi);
  const pool = inBand.length > 0 ? inBand : candidates;
  return pool.reduce<OfferCandidate | null>((b, c) => (!b || c.prestige < b.prestige ? c : b), null);
}

/** True when the unemployed manager has gone GUARANTEED_AFTER_DAYS without any offer. */
export function guaranteedOfferDue(args: { since: string; lastOfferDate?: string; date: string }): boolean {
  const from = args.lastOfferDate ?? args.since;
  return args.date >= addDays(from, JOBS.unemployed.GUARANTEED_AFTER_DAYS);
}

// ── Offers in the save ────────────────────────────────────────────────────────

/** Pending offers still valid on `date` (expired ones drop). */
export function pruneOffers(offers: JobOffer[], date: string): JobOffer[] {
  return offers.filter((o) => o.expires >= date);
}

/** Merges new offers, never two from the same club (the newest wins). */
export function mergeOffers(current: JobOffer[], incoming: JobOffer[]): JobOffer[] {
  const ids = new Set(incoming.map((o) => o.squadId));
  return [...current.filter((o) => !ids.has(o.squadId)), ...incoming];
}

// ── Managers when the human changes club ──────────────────────────────────────

/**
 * The human manager takes over `toSquadId` on `date` (D4, Etapa 25: no more swap). The club's coach
 * goes to the free pool (`left: "moved"`); the club the human leaves (`fromSquadId`) gets an interim,
 * and the caller opens a vacancy there so it hires by the AI rule. The human's passages are kept.
 */
export function moveHumanManager(
  managers: ManagerRecord[],
  args: { toSquadId: string; fromSquadId: string | null; fromClubName?: string; date: string },
): ManagerRecord[] {
  const out: ManagerRecord[] = [];
  for (const m of managers) {
    if (m.isPlayer) {
      const clubs = closePassage(m.clubs, args.date, "moved");
      out.push(cleanRecord({ ...m, squadId: args.toSquadId, freeSince: undefined, clubs: [...clubs, { squadId: args.toSquadId, from: args.date }] }));
    } else if (m.squadId === args.toSquadId) {
      // An interim with nothing to his name just disappears (as when an AI club hires).
      if (!(m.interim && m.points === 0 && m.titles.length === 0)) out.push(toFree(m, args.date, m.interim ? "interim" : "moved"));
    } else {
      out.push(m);
    }
  }
  if (args.fromSquadId && !out.some((m) => !m.isPlayer && m.squadId === args.fromSquadId)) {
    out.push(makeInterim(args.fromSquadId, args.fromClubName ?? args.fromSquadId, args.date, new Set(out.map((m) => m.id))));
  }
  return out;
}

/**
 * The human manager leaves his club on `date` (sacked, or his contract ended: `left`): he keeps no
 * club, and an interim takes over (the caller opens a vacancy so the club hires by the AI rule).
 */
export function sackHumanManager(
  managers: ManagerRecord[],
  args: { date: string; clubName: string; left?: "sacked" | "contract" },
): ManagerRecord[] {
  const me = managers.find((m) => m.isPlayer);
  if (!me || !me.squadId) return managers;
  const out = managers.map((m) =>
    m.isPlayer ? cleanRecord({ ...m, squadId: "", freeSince: args.date, clubs: closePassage(m.clubs, args.date, args.left ?? "sacked") }) : m);
  if (!out.some((m) => !m.isPlayer && m.squadId === me.squadId)) {
    out.push(makeInterim(me.squadId, args.clubName, args.date, new Set(out.map((m) => m.id))));
  }
  return out;
}
