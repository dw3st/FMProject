import { obscurePersonality, personalityOf } from "@/Domain/personality/personality";
import { STAFF } from "@/Domain/staff/staffConfig";
import { STAFF_NAME_POOLS, STAFF_NATIONALITIES } from "@/Domain/staff/staffNames";
import { drawStaffOrigin, type StaffNameBook } from "@/Domain/staff/staffOrigin";
import {
  COACH_AREAS, ROLE_SPECIALTY, STAFF_ROLES,
  type CoachArea, type Specialty, type StaffAttributes, type StaffMember, type StaffRecord, type StaffRole,
} from "@/Domain/staff/staffTypes";
import { DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";
import { contractEndFor } from "@/Domain/contracts/contracts";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { weeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";
import type { ScoutView } from "@/types/scoutingTypes";
import { clamp } from "@/Domain/math";
import { overallAvg } from "@/Domain/playerRating";
import { rangeMid, seenOverallRange, seenWageRange } from "@/Domain/scouting/seen";

/** Pure staff model (`.claude/rules/game/staff.md`). No I/O. */

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

// -- Stars ------------------------------------------------------------------

const roundHalf = (x: number) => Math.round(x * 2) / 2;

/** Stars -> the old 1..10 rating (1★ 1, 3★ 5, 5★ 10): today's effects keep their curves. */
export function ratingFromStars(stars: number): number {
  const s = clamp(stars, STAFF.MIN_STARS, STAFF.MAX_STARS);
  return s <= 3 ? 1 + 2 * (s - 1) : 5 + 2.5 * (s - 3);
}

/** Piecewise-linear through `[1★, 3★, 5★]`. */
export function starCurve(stars: number, [at1, at3, at5]: readonly [number, number, number]): number {
  const s = clamp(stars, STAFF.MIN_STARS, STAFF.MAX_STARS);
  return s <= 3 ? at1 + ((at3 - at1) * (s - 1)) / 2 : at3 + ((at5 - at3) * (s - 3)) / 2;
}

/** 1..20 score of a specialty: knowledge dominates, the four general attributes complete it. */
export function areaScore(m: StaffMember, specialty: Specialty): number {
  const w = STAFF.STAR_WEIGHTS;
  const a = m.attributes;
  return w.knowledge * (a.knowledge[specialty] ?? STAFF.ATTR_MIN) + w.playerReading * a.playerReading
    + w.determination * a.determination + w.discipline * a.discipline + w.adaptability * a.adaptability;
}

/** 1..20 score -> stars to the half (score 10.5 = 3★). */
export function starsFromScore(score: number): number {
  return clamp(roundHalf(1 + (4 * (score - 1)) / 19), STAFF.MIN_STARS, STAFF.MAX_STARS);
}

export const starsIn = (m: StaffMember, s: Specialty): number => starsFromScore(areaScore(m, s));

/** Headline stars: the role's specialty; an area coach's best area. */
export function memberStars(m: StaffMember): number {
  if (m.role === "coach") return Math.max(...COACH_AREAS.map((a) => starsIn(m, a)));
  return starsIn(m, ROLE_SPECIALTY[m.role]);
}

export const membersOf = (squad: Squad, role: StaffRole): StaffMember[] =>
  (squad.staff?.members ?? []).filter((m) => m.role === role);

/** Best member of a single-holder role (in practice the only one). */
export function headOf(squad: Squad, role: StaffRole): StaffMember | undefined {
  return membersOf(squad, role).sort((a, b) => memberStars(b) - memberStars(a) || a.id.localeCompare(b.id))[0];
}

/** Stars every role and area has at a club that does not simulate staff (every AI club). */
export function impliedStars(squad: Squad): number {
  // Hand-built squads (/lab, /test, unit tests) have no finances: neutral instead of the LOW tier.
  if (!squad.finances) return STAFF.NEUTRAL_STARS;
  return STAFF.IMPLIED_STARS[financialTierOf(squad)];
}

/** Stars that count for a non-area role: hired head, vacant (2★) when the club manages staff, else implied. */
export function effectiveStars(squad: Squad, role: StaffRole): number {
  if (!squad.staff) return impliedStars(squad);
  const h = headOf(squad, role);
  return h ? memberStars(h) : STAFF.VACANT_STARS;
}

/** The old 1..10 rating of a role (scouting, youth intake and today's effect curves read it). */
export const effectiveRating = (squad: Squad, role: StaffRole): number => ratingFromStars(effectiveStars(squad, role));

// -- Training areas -----------------------------------------------------------

/** Areas one area coach can lead at once. */
export const STAFF_AREAS_PER_COACH = 2;

/** Coach areas -> member: valid manual choices first, then each free area to the best coach with room. */
export function resolveAreaAssignments(staff: StaffRecord): Partial<Record<CoachArea, StaffMember>> {
  const coaches = staff.members.filter((m) => m.role === "coach");
  const byId = new Map(coaches.map((c) => [c.id, c]));
  const load = new Map<string, number>();
  const out: Partial<Record<CoachArea, StaffMember>> = {};
  for (const area of COACH_AREAS) {
    const id = staff.areaAssignments?.[area];
    const c = id ? byId.get(id) : undefined;
    if (c && (load.get(c.id) ?? 0) < STAFF_AREAS_PER_COACH) {
      out[area] = c;
      load.set(c.id, (load.get(c.id) ?? 0) + 1);
    }
  }
  // Free areas, best available star first (ties by area order, then member id).
  const free: CoachArea[] = COACH_AREAS.filter((a) => !out[a]);
  while (free.length > 0) {
    let best: { area: CoachArea; c: StaffMember; s: number } | null = null;
    for (const area of free) {
      for (const c of coaches) {
        if ((load.get(c.id) ?? 0) >= STAFF_AREAS_PER_COACH) continue;
        const s = starsIn(c, area);
        if (!best || s > best.s || (s === best.s && area === best.area && c.id < best.c.id)) best = { area, c, s };
      }
    }
    if (!best) break;
    out[best.area] = best.c;
    load.set(best.c.id, (load.get(best.c.id) ?? 0) + 1);
    free.splice(free.indexOf(best.area), 1);
  }
  return out;
}

/** Stars of every training area; null = nobody leads it (human club only). */
export function areaStars(squad: Squad): Record<DPCategory, number | null> {
  if (!squad.staff) {
    const s = impliedStars(squad);
    return Object.fromEntries(DP_CATEGORIES.map((c) => [c, s])) as Record<DPCategory, number>;
  }
  const res = resolveAreaAssignments(squad.staff);
  const fit = headOf(squad, "fitness");
  const gk = headOf(squad, "goalkeeping");
  const out = {} as Record<DPCategory, number | null>;
  out.physical = fit ? starsIn(fit, "physical") : null;
  out.goalkeeping = gk ? starsIn(gk, "goalkeeping") : null;
  for (const a of COACH_AREAS) out[a] = res[a] ? starsIn(res[a]!, a) : null;
  return out;
}

/** Multiplier on the growth DP of each category (never on the age decay). */
export function areaMultsOf(squad: Squad): Record<DPCategory, number> {
  const st = areaStars(squad);
  return Object.fromEntries(
    DP_CATEGORIES.map((c) => [c, st[c] === null ? STAFF.AREA_VACANT_MULT : starCurve(st[c]!, STAFF.AREA_MULT)]),
  ) as Record<DPCategory, number>;
}

// -- Effects ------------------------------------------------------------------

export interface StaffEffects {
  devMult: number;
  recoveryMult: number;
  injuryMult: number;
  /** Medic: multiplier on the days out of a new injury. */
  injuryDurationMult: number;
  /** Analyst: multiplier on the style-familiarity gain (replaces the assistant there). */
  familiarityMult: number;
  /** Chief scout: multiplier on the uncertainty of what the user sees (`scouting.md`). */
  scoutUncertaintyMult: number;
  /** Chief scout: multiplier on the knowledge gained by every mission. */
  scoutGainMult: number;
}

export function staffEffectsOf(squad: Squad): StaffEffects {
  // The fitness coach's stars; vacant = 2★ = the old vacant rating 3.
  const fitness = effectiveRating(squad, "fitness");
  const scout = effectiveRating(squad, "scout");
  return {
    devMult: developmentMultiplier(effectiveRating(squad, "assistant")),
    recoveryMult: recoveryMultiplier(fitness),
    injuryMult: injuryMultiplier(fitness),
    injuryDurationMult: starCurve(effectiveStars(squad, "medic"), STAFF.MEDIC_DURATION),
    familiarityMult: starCurve(effectiveStars(squad, "analyst"), STAFF.ANALYST_FAMILIARITY),
    scoutUncertaintyMult: scoutUncertaintyMultOf(scout),
    scoutGainMult: scoutGainMultOf(scout),
  };
}

/**
 * A squad whose fitness coach is a professional of `stars` (other roles vacant). Used by `/lab`
 * to compare staff levels; `undefined` keeps the squad as it is (tier-implicit staff).
 */
export function withFitnessCoach(squad: Squad, stars: number | undefined): Squad {
  if (stars === undefined) return squad;
  return { ...squad, staff: { members: [makeProfessional(`lab:${squad.id}:${stars}`, "fitness", stars)] } };
}

// -- Wages and contracts ------------------------------------------------------

/** Weekly wage of a professional of the old `rating`, at the club's wage factor (the base curve). */
export function staffWeeklyWage(rating: number, clubFactor: number): number {
  return Math.round(weeklyWage(STAFF.WAGE_BASE + STAFF.WAGE_SLOPE * rating) * clubFactor * STAFF.WAGE_SHARE);
}

/** Weekly wage of a professional of `stars` in `role`: the staff curve × the role's share. */
export function staffWageFor(role: StaffRole, stars: number, clubFactor: number): number {
  return Math.round(staffWeeklyWage(ratingFromStars(stars), clubFactor) * STAFF.WAGE_ROLE_SHARE[role]);
}

/** Monday ledger line: the contracts' frozen wages. */
export function squadStaffWages(staff: StaffRecord | undefined, date?: string): number {
  // With a date, a contract that ended before it is not paid (he leaves later that same day).
  return (staff?.members ?? []).reduce((s, m) => s + (m.contract && !(date && m.contract.until < date) ? m.contract.wage : 0), 0);
}

/** Signs `m` for `years` seasons: the wage is frozen at the club's factor of the signing day. */
export function signContract(
  m: StaffMember,
  a: { date: string; seasonEnd: string; years: number; clubFactor: number },
): StaffMember {
  const { since: _since, ...rest } = m;
  return {
    ...rest,
    contract: {
      until: contractEndFor(a.date, a.seasonEnd, a.years),
      wage: staffWageFor(m.role, memberStars(m), a.clubFactor),
      signed: a.date,
    },
  };
}

/** How many professionals of `role` the club may employ (its natural tier). */
export function roleLimit(squad: Squad, role: StaffRole): number {
  if (role === "coach") return STAFF.LIMITS.coach[financialTierOf(squad)];
  if (role === "fieldScout") return STAFF.LIMITS.fieldScout;
  return STAFF.LIMITS.other;
}

// -- Generation -------------------------------------------------------------

/** Deterministic professional of about `targetStars` (attributes 1..20 around the matching score), no contract. */
/**
 * With `origin` the nationality and the name come from the world's players (`drawStaffOrigin`:
 * a club's starting staff mostly from `home`, the free pool from every country); without it, the
 * small built-in pools (tests, /lab). The attributes are the same either way.
 */
export function makeProfessional(
  key: string, role: StaffRole, targetStars: number, origin?: { book: StaffNameBook; home?: string },
): StaffMember {
  const rng = mulberry32(seedFrom(`staff:${key}`));
  let nationality = STAFF_NATIONALITIES[Math.floor(rng() * STAFF_NATIONALITIES.length)]!;
  const pool = STAFF_NAME_POOLS[nationality]!;
  let name = `${pool.first[Math.floor(rng() * pool.first.length)]!} ${pool.last[Math.floor(rng() * pool.last.length)]!}`;
  const drawn = origin ? drawStaffOrigin(origin.book, mulberry32(seedFrom(`staff-origin:${key}`)), origin.home) : null;
  if (drawn) ({ nationality, name } = drawn);
  const level = 1 + (19 * (clamp(targetStars, STAFF.MIN_STARS, STAFF.MAX_STARS) - 1)) / 4; // score of the target
  const attr = (x: number) => clamp(Math.round(x), STAFF.ATTR_MIN, STAFF.ATTR_MAX);
  const noise = () => (rng() - 0.5) * 6;
  const general = {
    determination: attr(level + noise()),
    discipline: attr(level + noise()),
    adaptability: attr(level + noise()),
    playerReading: attr(level + noise()),
  };
  const w = STAFF.STAR_WEIGHTS;
  const rest = w.playerReading * general.playerReading + w.determination * general.determination
    + w.discipline * general.discipline + w.adaptability * general.adaptability;
  const knowledgeFor = (target: number) => attr((target - rest) / w.knowledge);
  const knowledge: StaffAttributes["knowledge"] = {};
  if (role === "coach") {
    const best = COACH_AREAS[Math.floor(rng() * COACH_AREAS.length)]!;
    for (const a of COACH_AREAS) knowledge[a] = knowledgeFor(a === best ? level : level - 1 - rng() * 4);
  } else {
    knowledge[ROLE_SPECIALTY[role]] = knowledgeFor(level);
  }
  return {
    id: `staff_${seedFrom(key).toString(36)}`,
    name,
    nationality,
    role,
    age: 32 + Math.floor(rng() * 30),
    attributes: { ...general, knowledge },
  };
}

/** The human club's starting staff: every role (coaches to the limit, no field scouts), stars = implied ± half. */
export function initialStaff(
  key: string, squad: Squad, at: { date: string; seasonEnd: string }, origin?: { book: StaffNameBook; home?: string },
): StaffRecord {
  const implied = impliedStars(squad);
  const factor = wageFactorOf(squad);
  const members: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    if (role === "fieldScout") continue;
    for (let i = 0; i < roleLimit(squad, role); i++) {
      const rng = mulberry32(seedFrom(`staff-start:${key}:${role}:${i}`));
      const delta = (Math.floor(rng() * 3) - 1) * STAFF.START_SPREAD_STARS;
      const span = STAFF.CONTRACT.MAX_YEARS - STAFF.CONTRACT.MIN_YEARS + 1;
      const years = STAFF.CONTRACT.MIN_YEARS + Math.floor(rng() * span);
      const m = makeProfessional(`${key}:start:${role}:${i}`, role, implied + delta, origin);
      members.push(signContract(m, { ...at, years, clubFactor: factor }));
    }
  }
  return { members };
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
