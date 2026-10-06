import { obscurePersonality, personalityOf } from "@/Domain/personality/personality";
import { STAFF } from "@/Domain/staff/staffConfig";
import { STAFF_NAME_POOLS, STAFF_NATIONALITIES } from "@/Domain/staff/staffNames";
import { STAFF_ROLES, type StaffMember, type StaffRecord, type StaffRole } from "@/Domain/staff/staffTypes";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { weeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";
import type { ScoutView } from "@/types/scoutingTypes";
import { clamp } from "@/Domain/math";
import { overallAvg } from "@/Domain/playerRating";
import { rangeMid, seenOverallRange, seenWageRange } from "@/Domain/scouting/seen";

/** Pure staff model (`.claude/rules/game/staff.md`). No I/O. */

function clampRating(r: number): number {
  return clamp(Math.round(r), STAFF.MIN_RATING, STAFF.MAX_RATING);
}

/** Piecewise-linear through `[rating 1, rating 5, rating 10]`. */
function curve(rating: number, [atMin, atNeutral, atMax]: readonly [number, number, number]): number {
  const r = clamp(rating, STAFF.MIN_RATING, STAFF.MAX_RATING);
  if (r <= STAFF.NEUTRAL_RATING) {
    const t = (r - STAFF.MIN_RATING) / (STAFF.NEUTRAL_RATING - STAFF.MIN_RATING);
    return atMin + (atNeutral - atMin) * t;
  }
  const t = (r - STAFF.NEUTRAL_RATING) / (STAFF.MAX_RATING - STAFF.NEUTRAL_RATING);
  return atNeutral + (atMax - atNeutral) * t;
}

/** Assistant rating -> multiplier on development points. */
export const developmentMultiplier = (rating: number) => curve(rating, STAFF.ASSISTANT_DEV);
/** Fitness coach rating -> multiplier on daily fitness recovery. */
export const recoveryMultiplier = (rating: number) => curve(rating, STAFF.FITNESS_RECOVERY);
/** Fitness coach rating -> multiplier on injury rate / contact chance. */
export const injuryMultiplier = (rating: number) => curve(rating, STAFF.FITNESS_INJURY);
/** Chief scout rating -> multiplier on the per-player attribute uncertainty (`scouting.md`). */
export const scoutUncertaintyMultOf = (rating: number) => curve(rating, STAFF.SCOUT_UNCERTAINTY_MULT);
/** Chief scout rating -> multiplier on the knowledge every scouting mission gains. */
export const scoutGainMultOf = (rating: number) => curve(rating, STAFF.SCOUT_GAIN_MULT);

export interface StaffEffects {
  devMult: number;
  recoveryMult: number;
  injuryMult: number;
  /** Chief scout: multiplier on the uncertainty of what the user sees (`scouting.md`). */
  scoutUncertaintyMult: number;
  /** Chief scout: multiplier on the knowledge gained by every mission. */
  scoutGainMult: number;
}

/**
 * The rating that counts for a role: the hired professional's, the vacant rating when the club
 * manages staff (`squad.staff` present) but the role is empty, or, for clubs that do not simulate
 * staff (every AI club), the implicit rating of the financial tier.
 */
export function effectiveRating(squad: Squad, role: StaffRole): number {
  if (squad.staff) return squad.staff[role]?.rating ?? STAFF.VACANT_RATING;
  // Hand-built squads (/lab, /test, unit tests) have no finances: stay neutral instead of the LOW tier.
  if (!squad.finances) return STAFF.NEUTRAL_RATING;
  return STAFF.IMPLIED_RATING[financialTierOf(squad)];
}

export function staffEffectsOf(squad: Squad): StaffEffects {
  return {
    devMult: developmentMultiplier(effectiveRating(squad, "assistant")),
    recoveryMult: recoveryMultiplier(effectiveRating(squad, "fitness")),
    injuryMult: injuryMultiplier(effectiveRating(squad, "fitness")),
    scoutUncertaintyMult: scoutUncertaintyMultOf(effectiveRating(squad, "scout")),
    scoutGainMult: scoutGainMultOf(effectiveRating(squad, "scout")),
  };
}

/**
 * A squad whose fitness coach is a professional of `rating` (other roles vacant). Used by `/lab`
 * to compare staff levels; `undefined` keeps the squad as it is (tier-implicit staff).
 */
export function withFitnessCoach(squad: Squad, rating: number | undefined): Squad {
  if (rating === undefined) return squad;
  return { ...squad, staff: { fitness: makeStaffMember(`lab:${squad.id}`, "fitness", rating, 1) } };
}

// -- Wages ------------------------------------------------------------------

/** Weekly wage of a professional of `rating`, at the club's wage factor. */
export function staffWeeklyWage(rating: number, clubFactor: number): number {
  return Math.round(weeklyWage(STAFF.WAGE_BASE + STAFF.WAGE_SLOPE * rating) * clubFactor * STAFF.WAGE_SHARE);
}

/**
 * Sum of the staff's weekly wages at the club's CURRENT wage factor (what the Monday ledger line
 * charges), so the bill follows the club's growth instead of the factor at hiring time.
 */
export function squadStaffWages(staff: StaffRecord | undefined, clubFactor: number): number {
  if (!staff) return 0;
  const roles = STAFF_ROLES.reduce((sum, role) => sum + (staff[role] ? staffWeeklyWage(staff[role]!.rating, clubFactor) : 0), 0);
  // Field scouts (`scouting.md`) are paid like the rest of the staff.
  return roles + (staff.scouts ?? []).reduce((sum, s) => sum + staffWeeklyWage(s.rating, clubFactor), 0);
}

// -- Generation -------------------------------------------------------------

/** Deterministic professional: name/nationality/age come from the hash of `key`. */
export function makeStaffMember(key: string, role: StaffRole, rating: number, clubFactor: number): StaffMember {
  const rng = mulberry32(seedFrom(`staff:${key}`));
  const nationality = STAFF_NATIONALITIES[Math.floor(rng() * STAFF_NATIONALITIES.length)]!;
  const pool = STAFF_NAME_POOLS[nationality]!;
  const first = pool.first[Math.floor(rng() * pool.first.length)]!;
  const last = pool.last[Math.floor(rng() * pool.last.length)]!;
  const r = clampRating(rating);
  return {
    id: `staff_${seedFrom(key).toString(36)}`,
    name: `${first} ${last}`,
    nationality,
    role,
    rating: r,
    age: 34 + Math.floor(rng() * 28),
    wage: staffWeeklyWage(r, clubFactor),
  };
}

/** The player's starting staff: each rating within `START_SPREAD` of the club's implicit tier rating. */
export function initialStaff(saveId: string, squad: Squad): StaffRecord {
  const implied = STAFF.IMPLIED_RATING[financialTierOf(squad)];
  const factor = wageFactorOf(squad);
  const out: StaffRecord = {};
  for (const role of STAFF_ROLES) {
    const rng = mulberry32(seedFrom(`staff-start:${saveId}:${role}`));
    const delta = Math.floor(rng() * (2 * STAFF.START_SPREAD + 1)) - STAFF.START_SPREAD;
    out[role] = makeStaffMember(`${saveId}:start:${role}`, role, implied + delta, factor);
  }
  return out;
}

/** ISO week start (Monday, "YYYY-MM-DD") of `date`. */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

/** The week's candidates for a role: `MARKET_SIZE` of them, ratings 2..9, stable for save + week. */
export function staffMarket(saveId: string, date: string, role: StaffRole, clubFactor: number): StaffMember[] {
  const week = weekStartOf(date);
  const rng = mulberry32(seedFrom(`staff-market:${saveId}:${week}:${role}`));
  return Array.from({ length: STAFF.MARKET_SIZE }, (_, i) => {
    const rating = 2 + Math.floor(rng() * 8);
    return makeStaffMember(`${saveId}:${week}:${role}:${i}`, role, rating, clubFactor);
  }).sort((a, b) => b.rating - a.rating);
}

// -- Scouting uncertainty ---------------------------------------------------

function signedNoise(key: string): number {
  return mulberry32(seedFrom(key))() * 2 - 1;
}

/**
 * What the user SEES of a player outside his own squad: each attribute shifted by a deterministic
 * noise (hash of save + player + attribute) of amplitude `noise`, clamped to 0..10. The engine
 * never reads this; only API responses meant for the screens.
 */
export function obscurePlayer(player: RosterPlayer, noise: number, saveId: string): RosterPlayer {
  if (noise <= 0) return player;
  const stats = { ...player.stats };
  for (const k of Object.keys(stats) as (keyof PlayerStatsRecord)[]) {
    const shifted = stats[k] + noise * signedNoise(`${saveId}:${player.id}:${k}`);
    stats[k] = Math.round(clamp(shifted, 0, 10) * 10) / 10;
  }
  const { overallAvg: _cached, ...rest } = player;
  // Personality (`personality.md`): the same uncertainty blurs the traits (some unknown from 1).
  return { ...rest, stats, personalityView: obscurePersonality(personalityOf(player), noise, saveId, player.id) };
}

/**
 * What the user sees of a player he knows to `view.knowledge` (`.claude/rules/game/scouting.md`):
 * the same deterministic blur with the per-player amplitude `view.noise`, plus the screen-only
 * `scoutView` (knowledge, noise, last observation) the screens read to show ranges and "?".
 */
export function obscureForViewer(player: RosterPlayer, view: ScoutView, saveId: string, wageFactor = 1): RosterPlayer {
  const out: RosterPlayer = { ...obscurePlayer(player, view.noise, saveId), scoutView: view };
  // With a range on screen the exact wage never leaves the server: the contract carries the middle
  // of the wage range seen (blurred overall ± noise on the club's curve), like the value.
  const range = player.contract && view.noise >= STAFF.RANGE_THRESHOLD ? seenOverallRange(overallAvg(out), view.noise) : undefined;
  if (range && player.contract) {
    out.contract = { ...player.contract, wage: Math.round(rangeMid(seenWageRange(range, wageFactor))) };
  }
  return out;
}

export function obscureSquad(squad: Squad, noise: number, saveId: string): Squad {
  if (noise <= 0) return squad;
  return { ...squad, players: squad.players.map((p) => obscurePlayer(p, noise, saveId)) };
}

/** The overall range shown instead of a single number once the uncertainty is large enough. */
export function overallRange(avg: number, noise: number): [number, number] | undefined {
  if (noise < STAFF.RANGE_THRESHOLD) return undefined;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return [r1(Math.max(0, avg - noise)), r1(Math.min(10, avg + noise))];
}

/**
 * The week's field-scout candidates (`.claude/rules/game/scouting.md`): `MARKET_SIZE` of them,
 * ratings 2..9, stable for save + week, distinct from the chief-scout market.
 */
export function fieldScoutMarket(saveId: string, date: string, clubFactor: number): StaffMember[] {
  const week = weekStartOf(date);
  const rng = mulberry32(seedFrom(`field-scout-market:${saveId}:${week}`));
  return Array.from({ length: STAFF.MARKET_SIZE }, (_, i) => {
    const rating = 2 + Math.floor(rng() * 8);
    return makeStaffMember(`${saveId}:${week}:field-scout:${i}`, "scout", rating, clubFactor);
  }).sort((a, b) => b.rating - a.rating);
}
