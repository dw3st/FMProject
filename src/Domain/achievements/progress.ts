import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { SECRETS, TIERS, TRACKS } from "@/Domain/achievements/catalog";
import { clampAttribute, initialAttributes } from "@/Domain/achievements/managerAttributes";
import type { MatchFacts } from "@/Domain/achievements/matchFacts";
import { daysBetween } from "@/Domain/dates";
import {
  TRACK_IDS, type AchievementCounters, type AchievementKey, type AchievementsState, type ManagerAttribute,
  type SecretId, type TrackId,
} from "@/types/achievementTypes";
import type { ManagerRecord } from "@/types/managerTypes";

/**
 * The achievement state machine (`docs/superpowers/specs/2026-10-11-achievements-design.md`): pure, no I/O.
 * `achievementsDay` (backend) gathers the day's facts and calls `applyAchievementDay` once per day.
 */

export function emptyCounters(): AchievementCounters {
  return {
    matches: 0, wins: 0, winStreak: 0, bestWinStreak: 0, unbeaten: 0, bestUnbeaten: 0, cleanStreak: 0,
    bestCleanStreak: 0, lossStreak: 0, thrashings: 0, comebacks: 0, tenMenWins: 0, shootoutWins: 0, derbyWins: 0,
    salesProfit: 0, biggestSigning: 0, leagueUnbeaten: 0, bestLeagueUnbeaten: 0, bestRank: null, youngAwards: 0,
    topScorers: 0,
  };
}

export function emptyAchievements(): AchievementsState {
  return {
    unlocked: {},
    counters: emptyCounters(),
    attributes: initialAttributes(),
    titlesSeen: 0,
    paid: {},
    freeSignings: {},
    promotedIds: [],
    awardsSeen: [],
    clubs: {},
    spent: 0,
    bought: {},
    profile: { frame: "none", badges: [], title: null },
    decor: { banner: false, flag: false, mosaic: false },
  };
}

/** A stored file read back: missing fields filled (the file can predate a field). */
export function normalizeAchievements(raw: Partial<AchievementsState> | null | undefined): AchievementsState {
  const base = emptyAchievements();
  if (!raw) return base;
  return {
    ...base, ...raw,
    counters: { ...base.counters, ...raw.counters },
    attributes: { ...base.attributes, ...raw.attributes },
    profile: { ...base.profile, ...raw.profile },
    decor: { ...base.decor, ...raw.decor },
  };
}

// ── Snapshot of the state the game keeps (titles, money, facilities…) ───────────

export interface AchievementSnapshot {
  manager: ManagerRecord | null;
  /** World ranking position of the manager now (null without points). */
  rank: number | null;
  /** Club balance gained since the manager arrived (today's balance − the one on his first day). */
  balanceGain: number;
  /** Seats above the capacity on the first day the club was seen. */
  extraSeats: number;
  /** Facility levels built since the manager arrived (sum over the items of the levels above the arrival ones). */
  facilityLevels: number;
}

export function titleCounts(m: ManagerRecord | null): Record<"league" | "cup" | "continental" | "promotion", number> {
  const out = { league: 0, cup: 0, continental: 0, promotion: 0 };
  // National-team titles (`national-teams.md`) are not club titles: the 41b gives them their own trails.
  for (const t of m?.titles ?? []) if (t.kind !== "national") out[t.kind]++;
  return out;
}

export function clubsManaged(m: ManagerRecord | null): number {
  const ids = new Set((m?.clubs ?? []).map((c) => c.squadId).filter(Boolean));
  if (m?.squadId) ids.add(m.squadId);
  return ids.size;
}

/** Value of each track now. */
export function trackValues(state: AchievementsState, snap: AchievementSnapshot): Record<TrackId, number> {
  const c = state.counters;
  const titles = titleCounts(snap.manager);
  const free = Object.values(state.freeSignings).filter((n) => n >= A.FREE_STARTER_STARTS).length;
  return {
    league_titles: titles.league,
    cup_titles: titles.cup,
    continental_titles: titles.continental,
    promotions: titles.promotion,
    wins: c.wins,
    win_streak: c.bestWinStreak,
    unbeaten_run: c.bestUnbeaten,
    thrashings: c.thrashings,
    comebacks: c.comebacks,
    ten_men_wins: c.tenMenWins,
    shootout_wins: c.shootoutWins,
    derby_wins: c.derbyWins,
    national_wins: c.nationalWins ?? 0,
    youth_promoted: state.promotedIds.length,
    young_award: c.youngAwards,
    sales_profit: c.salesProfit,
    big_signing: c.biggestSigning,
    free_starter: free,
    balance: Math.max(0, snap.balanceGain),
    stadium: Math.max(0, snap.extraSeats),
    facilities: Math.max(0, snap.facilityLevels),
    seasons: snap.manager?.seasons ?? 0,
    clubs: clubsManaged(snap.manager),
    ranking: c.bestRank ?? 0,
    manager_awards: snap.manager?.awards?.length ?? 0,
    top_scorer: c.topScorers,
    league_unbeaten: c.bestLeagueUnbeaten,
  };
}

/** Whether a tier of a track is reached by `value` (the special gold rules aside). */
export function tierReached(id: TrackId, tierIndex: 0 | 1 | 2, value: number): boolean {
  const def = TRACKS[id];
  const t = def.thresholds[tierIndex];
  if (tierIndex === 2 && def.goldRule) return false;
  if (def.kind === "rank") return value > 0 && value <= t;
  return value >= t;
}

// ── Unlocking ─────────────────────────────────────────────────────────────────

function addAttribute(state: AchievementsState, key: ManagerAttribute, delta: number): AchievementsState {
  return { ...state, attributes: { ...state.attributes, [key]: clampAttribute(state.attributes[key] + delta) } };
}

/** Unlocks `key` (once) and pays its attribute gain. */
export function unlock(state: AchievementsState, key: AchievementKey, date: string): AchievementsState {
  if (state.unlocked[key]) return state;
  const s = { ...state, unlocked: { ...state.unlocked, [key]: date } };
  if (key.startsWith("secret:")) {
    const id = key.slice(7) as SecretId;
    return addAttribute(s, SECRETS[id].attribute, A.ATTRIBUTE_GAIN.secret);
  }
  const [track, tier] = key.split(":") as [TrackId, "bronze" | "silver" | "gold"];
  return addAttribute(s, TRACKS[track].attribute, A.ATTRIBUTE_GAIN[tier]);
}

export function unlockSecret(state: AchievementsState, id: SecretId, date: string): AchievementsState {
  return unlock(state, `secret:${id}`, date);
}

/** Every track tier the values reach (plus the special golds). */
export function unlockReachedTiers(
  state: AchievementsState, values: Record<TrackId, number>, date: string, snap: AchievementSnapshot,
): AchievementsState {
  let s = state;
  for (const id of TRACK_IDS) {
    TIERS.forEach((tier, i) => {
      if (tierReached(id, i as 0 | 1 | 2, values[id])) s = unlock(s, `${id}:${tier}`, date);
    });
  }
  if (snap.manager?.awards?.some((a) => a.kind === "world_manager")) s = unlock(s, "manager_awards:gold", date);
  return s;
}

// ── Matches ───────────────────────────────────────────────────────────────────

/** One official match of the human club: counters, streaks, month, season and the match secrets. */
export function recordMatch(state: AchievementsState, f: MatchFacts, date: string): AchievementsState {
  const c = { ...state.counters };
  const won = f.result === "W";
  const lost = f.result === "L";
  c.matches++;
  if (won) c.wins++;
  c.winStreak = won ? c.winStreak + 1 : 0;
  c.bestWinStreak = Math.max(c.bestWinStreak, c.winStreak);
  c.unbeaten = lost ? 0 : c.unbeaten + 1;
  c.bestUnbeaten = Math.max(c.bestUnbeaten, c.unbeaten);
  c.cleanStreak = f.ga === 0 ? c.cleanStreak + 1 : 0;
  c.bestCleanStreak = Math.max(c.bestCleanStreak, c.cleanStreak);
  const margin = f.gf - f.ga;
  if (won && margin >= A.THRASHING_MARGIN) c.thrashings++;
  if (won && f.maxDeficit > 0) c.comebacks++;
  if (won && f.ownReds > 0) c.tenMenWins++;
  if (f.shootoutWin) c.shootoutWins++;
  if (won && f.derby) c.derbyWins++;
  if (f.league) {
    c.leagueUnbeaten = lost ? 0 : c.leagueUnbeaten + 1;
    c.bestLeagueUnbeaten = Math.max(c.bestLeagueUnbeaten, c.leagueUnbeaten);
  }
  let s: AchievementsState = { ...state, counters: c };
  // Defeats in a row: the attributes slide a little every `LOSS_STREAK_STEP`.
  c.lossStreak = lost ? c.lossStreak + 1 : 0;
  if (lost && c.lossStreak % A.LOSS_STREAK_STEP === 0) {
    s = addAttribute(s, "motivation", -A.LOSS_STREAK_DROP);
    s = addAttribute(s, "discipline", -A.LOSS_STREAK_DROP);
  }
  // The month (perfect_month is judged when it ends) and the league season.
  const key = date.slice(0, 7);
  const month = s.month && s.month.key === key ? s.month : { key, played: 0, won: 0 };
  s = { ...s, month: { key, played: month.played + 1, won: month.won + (won ? 1 : 0) } };
  if (f.league && s.season) {
    s = { ...s, season: { ...s.season, played: s.season.played + 1, lost: s.season.lost + (lost ? 1 : 0), homeLost: s.season.homeLost + (lost && f.home ? 1 : 0) } };
  }
  if (won && f.maxDeficit >= 3) s = unlockSecret(s, "great_escape", date);
  if (won && f.ownReds >= 2) s = unlockSecret(s, "nine_men", date);
  if (won && margin >= A.SEVEN_UP_MARGIN) s = unlockSecret(s, "seven_up", date);
  if (f.lastGasp) s = unlockSecret(s, "last_gasp", date);
  if (lost && -margin >= A.HUMBLED_MARGIN) s = unlockSecret(s, "humbled", date);
  if (f.keeperGoal) s = unlockSecret(s, "keeper_goal", date);
  if (c.cleanStreak >= A.WALL_GAMES) s = unlockSecret(s, "wall", date);
  return s;
}

/** A new month: the previous one is judged for `perfect_month`. */
export function rollMonth(state: AchievementsState, date: string): AchievementsState {
  const key = date.slice(0, 7);
  if (!state.month || state.month.key === key) return state;
  let s: AchievementsState = { ...state, month: undefined };
  const m = state.month;
  if (m.played >= A.PERFECT_MONTH_MIN && m.won === m.played) s = unlockSecret(s, "perfect_month", date);
  return s;
}

// ── Titles (attribute gains, double / treble) ─────────────────────────────────

export function applyNewTitles(state: AchievementsState, manager: ManagerRecord | null, date: string): AchievementsState {
  const titles = manager?.titles ?? [];
  if (titles.length <= state.titlesSeen) return state;
  let s: AchievementsState = { ...state, titlesSeen: titles.length };
  for (const t of titles.slice(state.titlesSeen)) {
    s = addAttribute(s, "tactics", A.TITLE_GAIN[t.kind]);
    // The World Cup with his national team (Etapa 41b).
    if (t.kind === "national" && t.competition.startsWith("wc_")) s = unlockSecret(s, "world_champion", date);
  }
  const bySeason = new Map<string, Set<string>>();
  for (const t of titles) {
    const set = bySeason.get(t.season) ?? new Set<string>();
    set.add(t.kind);
    bySeason.set(t.season, set);
  }
  for (const kinds of bySeason.values()) {
    if (kinds.has("league") && kinds.has("cup")) s = unlockSecret(s, "double", date);
    if (kinds.has("league") && kinds.has("cup") && kinds.has("continental")) s = unlockSecret(s, "treble", date);
  }
  return s;
}

// ── The human club's rollover ─────────────────────────────────────────────────

export interface RolloverFacts {
  squadId: string;
  /** League title this rollover. */
  champion: boolean;
  /** The club had the lowest wage bill of its league. */
  cheapest: boolean;
  /** Promoted this season after being relegated the season before (same club). */
  bounceBack: boolean;
  /** The board's objective was met. */
  objectiveMet: boolean;
}

export function applyRollover(state: AchievementsState, r: RolloverFacts, date: string): AchievementsState {
  let s = state;
  const season = s.season && s.season.squadId === r.squadId ? s.season : null;
  if (r.champion && season && season.homeLost === 0 && season.played > 0) s = unlockSecret(s, "fortress", date);
  if (r.champion && r.cheapest) s = unlockSecret(s, "cheapest_champion", date);
  if (r.bounceBack) s = unlockSecret(s, "bounce_back", date);
  if (season && season.lost === 0 && season.played >= A.INVINCIBLE_MIN_GAMES) s = unlock(s, "league_unbeaten:gold", date);
  if (r.objectiveMet) s = addAttribute(s, "motivation", A.OBJECTIVE_GAIN);
  const club = s.clubs[r.squadId];
  if (club) {
    const seasons = club.seasons + 1;
    s = { ...s, clubs: { ...s.clubs, [r.squadId]: { ...club, seasons } } };
    if (seasons >= A.ONE_CLUB_SEASONS) s = unlockSecret(s, "one_club", date);
  }
  return {
    ...s,
    season: { squadId: r.squadId, played: 0, lost: 0, homeLost: 0 },
    counters: { ...s.counters, leagueUnbeaten: 0 },
  };
}

/** What the club has on the manager's first day there (the baseline of the finance tracks). */
export interface ClubArrival { capacity: number; balance: number; facilityLevels: Record<string, number> }

/** The human club changed (or the save is seen for the first time): season tracking restarts. */
export function ensureClub(state: AchievementsState, squadId: string, base: ClubArrival): AchievementsState {
  let s = state;
  if (!s.clubs[squadId]) {
    s = { ...s, clubs: { ...s.clubs, [squadId]: {
      baseCapacity: base.capacity, baseBalance: base.balance, baseFacilityLevels: { ...base.facilityLevels }, seasons: 0,
    } } };
  }
  if (!s.season || s.season.squadId !== squadId) {
    s = { ...s, season: { squadId, played: 0, lost: 0, homeLost: 0 }, counters: { ...s.counters, leagueUnbeaten: 0 } };
  }
  return s;
}

/** An academy player promoted to the first team (youth route): counted once per id. */
export function recordPromotion(state: AchievementsState, playerId: string): AchievementsState {
  if (state.promotedIds.includes(playerId)) return state;
  return { ...state, promotedIds: [...state.promotedIds, playerId] };
}

/** Sacked within `SACKED_EARLY_DAYS` of taking the job. */
export function sackedEarly(hiredOn: string | undefined, date: string): boolean {
  return !!hiredOn && daysBetween(hiredOn, date) <= A.SACKED_EARLY_DAYS;
}

// ── Points ────────────────────────────────────────────────────────────────────

export function pointsOf(key: AchievementKey): number {
  if (key.startsWith("secret:")) return A.POINTS.secret;
  const tier = key.split(":")[1] as "bronze" | "silver" | "gold";
  return A.POINTS[tier];
}

/** Points from the achievements unlocked. */
export function achievementPoints(state: AchievementsState): number {
  return (Object.keys(state.unlocked) as AchievementKey[]).reduce((sum, k) => sum + pointsOf(k), 0);
}

/** Every point earned: achievements and the campaign (titles, stages, objective, awards). */
export function earnedPoints(state: AchievementsState): number {
  return achievementPoints(state) + (state.campaign?.points ?? 0);
}

/** Campaign points for an event, once per key (a retried day, or the same title seen again, adds nothing). */
export function addCampaign(state: AchievementsState, key: string, points: number): AchievementsState {
  const c = state.campaign ?? { points: 0, seen: [] };
  if (points <= 0 || c.seen.includes(key)) return state;
  return { ...state, campaign: { points: c.points + points, seen: [...c.seen, key] } };
}

/**
 * Campaign points of the manager's record: every title and every manager award not counted yet (titles and awards
 * won before this rule count too, once).
 */
export function applyCampaignRecord(state: AchievementsState, manager: ManagerRecord | null): AchievementsState {
  let s = state;
  for (const t of manager?.titles ?? []) {
    s = addCampaign(s, `title:${t.season}:${t.kind}:${t.competition}:${t.squadId}`, A.CAMPAIGN.TITLE[t.kind] ?? 0);
  }
  for (const a of manager?.awards ?? []) {
    s = addCampaign(s, `award:${a.season}:${a.kind}:${a.competition}`, A.CAMPAIGN.AWARD[a.kind] ?? 0);
  }
  return s;
}

export function pointsBalance(state: AchievementsState): number {
  return earnedPoints(state) - state.spent;
}

export function newlyUnlocked(before: AchievementsState, after: AchievementsState): AchievementKey[] {
  return (Object.keys(after.unlocked) as AchievementKey[]).filter((k) => !before.unlocked[k]);
}
