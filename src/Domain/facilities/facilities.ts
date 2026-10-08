import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { stadiumFillRate } from "@/Domain/boardFans/boardFans";
import { GATE, gateFromAttendance, type GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { addDays, daysBetween } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { INJURY } from "@/Domain/injury/injuryConfig";
import {
  comfortLevel, conditionOf, effectAt, groupLevel, initialItems, itemCondition, itemsOfGroup, lerpLevel, penalty,
  physioDurationMult, wearFor,
} from "@/Domain/facilities/facilityItems";
import { personalityOf } from "@/Domain/personality/personality";
import { PERSONALITY } from "@/Domain/personality/personalityConfig";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  AttendanceRow, BoardRefusal, ClubFacilities, CompletedFacilityProject, FacilityGroup, FacilityItemId, FacilityKind, FacilityProject,
  FacilityRequest, StadiumStand, StandId,
} from "@/types/facilityTypes";

/** Pure club-facilities model (`.claude/rules/game/facilities.md`). No I/O. */

const lvlIdx = (level: number) => clamp(Math.round(level), F.MIN_LEVEL, F.MAX_LEVEL) - 1;

// ── Levels and effects ────────────────────────────────────────────────────────

/** Level by financial tier — AI clubs, and the starting level of a human club. */
export function impliedLevel(squad: Squad): number {
  return F.IMPLIED_LEVEL[financialTierOf(squad)];
}

/** Facilities with the ten items (a save from before the items has none: treated as absent). */
export function livingFacilities(squad: Squad): ClubFacilities | null {
  return squad.facilities?.items ? squad.facilities : null;
}

/**
 * Training ground and academy levels 1..5 (continuous): derived from the human club's items, or the
 * tier's implied level.
 */
export function facilityLevels(squad: Squad): { training: number; academy: number } {
  const f = livingFacilities(squad);
  if (f) return { training: groupLevel(f, "training"), academy: groupLevel(f, "academy") };
  const l = impliedLevel(squad);
  return { training: l, academy: l };
}

export interface TrainingGroundEffects {
  /** × daily fitness recovery (rest, training days, non-playing members on match day). */
  recoveryMult: number;
  /** × training injury chance. */
  injuryMult: number;
  /** × training development points. */
  devMult: number;
}

/** Effects of a training-ground level (a fractional level interpolates the 1..5 tables). */
export function trainingEffectsAt(level: number): TrainingGroundEffects {
  return {
    recoveryMult: lerpLevel(F.TRAINING_RECOVERY, level),
    injuryMult: lerpLevel(F.TRAINING_INJURY, level),
    devMult: lerpLevel(F.TRAINING_DEV, level),
  };
}

export interface ClubTrainingEffects extends TrainingGroundEffects {
  /** Chance of an injury in a light/normal session (bad training pitches; 0 for the AI). */
  normalSessionInjury: number;
  /** Physio: × days out of a new injury of the club (1 for the AI). */
  injuryDurationMult: number;
  /**
   * × match DP (growth only, never the age decline): a worn training ground prepares the players worse.
   * Mean condition of the training pitches, gym and canteen; 1 from 40% up and for the AI.
   */
  matchDevMult: number;
}

/**
 * Training-ground effects of a club: the group level, then the items below 40% (human club only).
 * Never applied inside a match (the match DP is applied after it, in `finalizeSquadsAfterMatch`).
 */
export function trainingGroundEffectsOf(squad: Squad): ClubTrainingEffects {
  const base = trainingEffectsAt(facilityLevels(squad).training);
  const f = livingFacilities(squad);
  if (!f) return { ...base, normalSessionInjury: 0, injuryDurationMult: 1, matchDevMult: 1 };
  const W = F.WEAR;
  const pitches = itemCondition(f, "trainingPitches");
  const gym = itemCondition(f, "gym");
  const canteen = itemCondition(f, "canteen");
  return {
    devMult: base.devMult * effectAt(W.TRAINING_PITCH_DEV_MIN, pitches) * effectAt(W.GYM_DEV_MIN, gym)
      * effectAt(W.CANTEEN_DEV_MIN, canteen),
    recoveryMult: base.recoveryMult * effectAt(W.POOL_RECOVERY_MIN, itemCondition(f, "pool"))
      * effectAt(W.PHYSIO_RECOVERY_MIN, itemCondition(f, "physio")),
    injuryMult: base.injuryMult * effectAt(W.PITCH_INJURY_MAX, pitches),
    normalSessionInjury: INJURY.HEAVY_TRAINING_CHANCE * W.NORMAL_TRAINING_INJURY_SHARE * penalty(pitches),
    injuryDurationMult: physioDurationMult(f.items.physio, impliedLevel(squad)),
    matchDevMult: effectAt(W.CT_MATCH_DEV_MIN, (pitches + gym + canteen) / 3),
  };
}

export interface AcademyEffects {
  /** Added to the intake level. */
  qualityBonus: number;
  /** Intake size upper bound. */
  intakeMax: number;
  /** Chance of a "Wonderkid" prospect. */
  promiseChance: number;
}

export function academyEffectsAt(level: number): AcademyEffects {
  const l = clamp(level, F.MIN_LEVEL, F.MAX_LEVEL);
  return {
    qualityBonus: (l - F.NEUTRAL_LEVEL) * F.ACADEMY_QUALITY_STEP,
    intakeMax: F.ACADEMY_INTAKE_MAX[lvlIdx(l)]!,
    promiseChance: lerpLevel(F.ACADEMY_PROMISE, l),
  };
}

/**
 * Academy effects of a club, relative to the implied level of its tier: the intake already has the
 * tier bonus (`YOUTH.TIER_BONUS`), so an AI club (implied level) is always neutral, and the human
 * club gains or loses only for the levels it built above or below its tier's implied level.
 */
export function academyEffectsOf(squad: Squad): AcademyEffects {
  const f = livingFacilities(squad);
  if (!f) return academyEffectsAt(F.NEUTRAL_LEVEL);
  const e = academyEffectsAt(F.NEUTRAL_LEVEL + groupLevel(f, "academy") - impliedLevel(squad));
  const W = F.WEAR;
  const pitches = itemCondition(f, "academyPitches");
  const lodging = itemCondition(f, "academyLodging");
  return {
    qualityBonus: e.qualityBonus - W.ACADEMY_QUALITY_MAX_LOSS * (penalty(pitches) + penalty(lodging)),
    intakeMax: e.intakeMax,
    promiseChance: e.promiseChance * effectAt(W.LODGING_PROMISE_MIN, lodging),
  };
}

// ── Stadium ───────────────────────────────────────────────────────────────────

/** The current capacity split over the 4 stands (sides bigger); the sum is exactly `capacity`. */
export function splitStands(capacity: number): StadiumStand[] {
  const cap = Math.max(0, Math.round(capacity));
  const north = Math.round(cap * F.STAND_SHARE.north);
  const south = Math.round(cap * F.STAND_SHARE.south);
  const east = Math.round(cap * F.STAND_SHARE.east);
  return [
    { id: "north", seats: north },
    { id: "east", seats: east },
    { id: "south", seats: south },
    { id: "west", seats: cap - north - south - east },
  ];
}

/** Built seats (works ignored). */
export function totalSeats(f: ClubFacilities): number {
  return f.stands.reduce((s, x) => s + x.seats, 0);
}

/** Stand currently under works, if any. */
export function standUnderWorks(f: ClubFacilities): StandId | null {
  return f.projects.find((p) => p.kind === "stand")?.stand ?? null;
}

/**
 * Seats available today, or on a future `date`: a stand counts half while its works run (until the
 * project's end) and with the added seats from the end on.
 */
export function effectiveCapacity(f: ClubFacilities, date?: string): number {
  const p = f.projects.find((x) => x.kind === "stand");
  const done = !!p && date !== undefined && p.end <= date;
  return f.stands.reduce((s, x) => {
    if (!p || x.id !== p.stand) return s + x.seats;
    return s + (done ? x.seats + (p.seats ?? 0) : Math.floor(x.seats / 2));
  }, 0);
}

/** Ticket price multiplier of a comfort level (level 1 = × 1). */
export function comfortLevelPriceMult(comfort: number): number {
  return 1 + F.COMFORT_PRICE_STEP * (clamp(comfort, F.MIN_LEVEL, F.MAX_LEVEL) - 1);
}

/** Ticket price multiplier of the facilities: comfort (the seats' level) and the seats' condition. */
export function comfortPriceMult(f: ClubFacilities): number {
  return comfortLevelPriceMult(comfortLevel(f)) * effectAt(F.WEAR.SEATS_PRICE_MIN, itemCondition(f, "seats"));
}

/** Season phase multiplier on demand from the fraction of the league window elapsed. */
export function seasonPhaseMult(fraction: number): number {
  if (!Number.isFinite(fraction)) return 1;
  if (fraction < F.PHASE.OPENING_UNTIL) return F.PHASE.OPENING;
  if (fraction >= F.PHASE.RUN_IN_FROM) return F.PHASE.RUN_IN;
  return F.PHASE.MIDDLE;
}

export function seasonFraction(date: string, start: string, end: string): number {
  const len = daysBetween(start, end);
  if (len <= 0) return 0.5;
  return clamp(daysBetween(start, date) / len, 0, 1);
}

const tierDemand = (tier: number) => F.TIER_DEMAND[clamp(Math.round(tier), 1, F.TIER_DEMAND.length) - 1]!;

export interface DemandInput {
  followers: number;
  /** League tier today. */
  tier: number;
  /** Fans meter 0..100 (absent: the AI fill rate). */
  fans?: number;
  /** Fraction of the league window elapsed (absent: middle of the season → phase 1 kept exact). */
  fraction?: number;
  /** Game day (forecasts): the stand under works counts half only until its works end. */
  date?: string;
  /** Big-match multiplier (derby, cup/continental knockout: matchImportance.ts); absent = 1. */
  importance?: number;
}

/**
 * Seats the public wants today (unrounded):
 * anchor capacity × fans fill × (followers / anchor followers)^0.7 × league tier ratio × season phase.
 * With the anchor unchanged and a neutral phase this is exactly `capacity × fill`, the old gate.
 */
export function demandOf(f: ClubFacilities, input: DemandInput): number {
  const fill = input.fans === undefined ? GATE.FILL_RATE : stadiumFillRate(input.fans);
  const a = f.anchor;
  const followers = a.followers > 0 && input.followers > 0 ? Math.pow(input.followers / a.followers, F.FOLLOWERS_EXPONENT) : 1;
  const tier = tierDemand(input.tier) / tierDemand(a.tier);
  const phase = input.fraction === undefined ? 1 : seasonPhaseMult(input.fraction);
  // Worn seats and structure keep some fans away (only below 40%).
  const upkeep = effectAt(F.WEAR.SEATS_DEMAND_MIN, itemCondition(f, "seats"))
    * effectAt(F.WEAR.STRUCTURE_DEMAND_MIN, itemCondition(f, "stadiumStructure"));
  const importance = input.importance ?? 1;
  return Math.max(0, a.capacity * fill * followers * tier * phase * upkeep * importance);
}

/** Attendance = min(seats available, demand) (unrounded; round only for display). */
export function attendanceOf(f: ClubFacilities, input: DemandInput): { attendance: number; capacity: number; demand: number } {
  const capacity = effectiveCapacity(f, input.date);
  const demand = demandOf(f, input);
  return { attendance: Math.min(capacity, demand), capacity, demand };
}

/** Gate of one home game of the human club. */
export function facilitiesGate(f: ClubFacilities, input: DemandInput, kind: GateKind, neutral = false): number {
  return gateFromAttendance(attendanceOf(f, input).attendance, kind, neutral, comfortPriceMult(f));
}

/** Logs a home game; returns the broken record (only when a previous record existed). */
export function recordAttendance(
  f: ClubFacilities, row: AttendanceRow,
): { facilities: ClubFacilities; recordBroken: { previous: number; attendance: number } | null } {
  const attendance = [...f.attendance, row].slice(-F.ATTENDANCE_KEEP);
  const prev = f.record;
  const better = !prev || row.attendance > prev.attendance;
  const record = better
    ? { date: row.date, attendance: row.attendance, competition: row.competition, opponentId: row.opponentId }
    : prev;
  return {
    facilities: { ...f, attendance, record },
    recordBroken: prev && better ? { previous: prev.attendance, attendance: row.attendance } : null,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * A human club's facilities: stands from its capacity, the ten items at 2 × the tier's level (seats
 * 2 = comfort 1) with a little starting wear (never below ~80%: the starting effects are today's).
 */
export function initialFacilities(squad: Squad, tier: number): ClubFacilities {
  const capacity = squad.venue?.capacity ?? 0;
  return {
    stands: splitStands(capacity),
    items: initialItems(squad.id, impliedLevel(squad)),
    projects: [],
    completed: [],
    anchor: { capacity, followers: squad.finances?.followers ?? 0, tier: Math.max(1, tier) },
    attendance: [],
  };
}

// ── Costs and durations ──────────────────────────────────────────────────────

/** EUR per seat from the country weight (`countryWeight`, 0.2..1.2) and the league tier. */
export function seatCost(countryWeight: number, leagueTier: number): number {
  const tier = F.SEAT_COST_TIER[clamp(Math.round(leagueTier), 1, F.SEAT_COST_TIER.length) - 1]!;
  return Math.round(clamp(F.SEAT_COST_BASE + F.SEAT_COST_SPAN * countryWeight * tier, F.SEAT_COST_MIN, F.SEAT_COST_MAX));
}

export function standWeeks(seats: number): number {
  const t = (clamp(seats, F.SEATS_MIN, F.SEATS_MAX) - F.SEATS_MIN) / (F.SEATS_MAX - F.SEATS_MIN);
  return Math.round(F.STAND_WEEKS_MIN + t * (F.STAND_WEEKS_MAX - F.STAND_WEEKS_MIN));
}

export function validSeats(seats: unknown): seats is number {
  return typeof seats === "number" && Number.isInteger(seats) && seats >= F.SEATS_MIN && seats <= F.SEATS_MAX
    && seats % F.SEATS_STEP === 0;
}

export interface ProjectQuote {
  kind: FacilityKind;
  cost: number;
  weeks: number;
  /** Level reached (level projects). */
  level?: number;
  stand?: StandId;
  seats?: number;
  /** Total capacity after the works (stand projects). */
  newCapacity?: number;
  /** Item projects (repair, rebuild, upgrade). */
  item?: FacilityItemId;
  /** Condition on delivery (repair target; rebuild/upgrade 100). */
  to?: number;
  /** Repair that costs ≤ `REPAIR.SMALL_REPAIR_SHARE` of the annual revenue: paid now, no board. */
  small?: boolean;
}

export interface QuoteContext {
  /** Annual revenue (`wageRevenueBasisOf`). */
  revenue: number;
  /** EUR per seat (`seatCost`). */
  seatCost: number;
}

/** Cost and duration of a request; `null` when it is not possible (level 5 already, bad seats). */
/** Value of an item (EUR): annual revenue × its value share × level / 6. */
export function itemValue(revenue: number, id: FacilityItemId, level: number): number {
  return Math.max(0, revenue) * F.ITEMS[id].valueShare * level / 6;
}

function quoteItemProject(f: ClubFacilities, req: FacilityRequest, revenue: number): ProjectQuote | null {
  if (req.kind !== "repair" && req.kind !== "rebuild" && req.kind !== "upgrade") return null;
  const it = f.items[req.item];
  if (!it) return null;
  const c = F.ITEMS[req.item];
  const cond = conditionOf(it);
  if (req.kind === "repair") {
    const to = req.to;
    if (it.condemned || !Number.isInteger(to) || to % F.REPAIR.STEP !== 0 || to > 100 || to <= cond) return null;
    const gain = (to - cond) / 100;
    const cost = Math.round(itemValue(revenue, req.item, it.level) * gain * F.REPAIR.COST_SHARE);
    return {
      kind: "repair", item: req.item, to, cost, weeks: Math.max(1, Math.ceil(c.repairWeeks * gain)),
      small: cost <= F.REPAIR.SMALL_REPAIR_SHARE * Math.max(0, revenue),
    };
  }
  if (req.kind === "rebuild") {
    if (!it.condemned && cond >= F.WEAR.CONDEMN_BELOW) return null;
    return { kind: "rebuild", item: req.item, to: 100, cost: Math.round(itemValue(revenue, req.item, it.level)), weeks: c.rebuildWeeks };
  }
  if (it.level >= F.ITEM_MAX_LEVEL) return null;
  const level = it.level + 1;
  return {
    kind: "upgrade", item: req.item, to: 100, level,
    cost: Math.round(itemValue(revenue, req.item, level) * F.REPAIR.COST_SHARE),
    weeks: Math.ceil(c.rebuildWeeks * F.REPAIR.UPGRADE_WEEKS_SHARE),
  };
}

export function quoteProject(f: ClubFacilities, req: FacilityRequest, ctx: QuoteContext): ProjectQuote | null {
  if (req.kind === "repair" || req.kind === "rebuild" || req.kind === "upgrade") return quoteItemProject(f, req, ctx.revenue);
  if (req.kind === "stand") {
    if (!validSeats(req.seats) || !f.stands.some((s) => s.id === req.stand)) return null;
    return {
      kind: "stand", stand: req.stand, seats: req.seats,
      cost: Math.round(req.seats * ctx.seatCost), weeks: standWeeks(req.seats),
      newCapacity: totalSeats(f) + req.seats,
    };
  }
  if (req.kind !== "comfort" && req.kind !== "training" && req.kind !== "academy") return null;
  const current = Math.floor(req.kind === "comfort" ? comfortLevel(f) : groupLevel(f, req.kind));
  if (current >= F.MAX_LEVEL) return null;
  const level = current + 1;
  const i = level - 1;
  if (req.kind === "comfort") {
    return { kind: "comfort", level, cost: Math.round(totalSeats(f) * F.COMFORT_COST_PER_SEAT[i]!), weeks: F.COMFORT_WEEKS[i]! };
  }
  const share = req.kind === "training" ? F.TRAINING_COST_SHARE[i]! : F.ACADEMY_COST_SHARE[i]!;
  const weeks = req.kind === "training" ? F.TRAINING_WEEKS[i]! : F.ACADEMY_WEEKS[i]!;
  return { kind: req.kind, level, cost: Math.round(Math.max(0, ctx.revenue) * share), weeks };
}

/** Weekly upkeep (EUR): training ground and academy levels above the tier's implied level. */
export function weeklyUpkeep(squad: Squad, revenue: number): number {
  const f = livingFacilities(squad);
  if (!f) return 0;
  const base = impliedLevel(squad);
  const yearly = Math.max(0, revenue)
    * (Math.max(0, groupLevel(f, "training") - base) * F.TRAINING_UPKEEP_SHARE
      + Math.max(0, groupLevel(f, "academy") - base) * F.ACADEMY_UPKEEP_SHARE);
  return Math.round(yearly / 52);
}

// ── Board ─────────────────────────────────────────────────────────────────────

export type BoardDecision =
  | { approved: true; boardShare: number }
  | { approved: false; reason: BoardRefusal };

/**
 * The board decides a request from its meter and the balance:
 * < 50 or negative balance → refused; 50..69 → only projects ≤ 10% of annual revenue;
 * ≥ 70 → approved; ≥ 85 → the board pays 25..50%. The club's share must fit the balance.
 */
export function boardDecision(args: {
  board: number; balance: number; cost: number; revenue: number;
  /** The club's share still to pay on the projects already running (`committedSpend`). */
  committed?: number;
}): BoardDecision {
  const B = F.BOARD;
  if (args.balance < 0) return { approved: false, reason: "negative_balance" };
  if (args.board < B.REFUSE_BELOW) return { approved: false, reason: "board_low" };
  if (args.board < B.APPROVE_FROM && args.cost > B.SMALL_SHARE * Math.max(0, args.revenue)) {
    return { approved: false, reason: "too_big" };
  }
  const boardShare = args.board >= B.FUND_FROM
    ? B.FUND_MIN + (B.FUND_MAX - B.FUND_MIN) * clamp((args.board - B.FUND_FROM) / (100 - B.FUND_FROM), 0, 1)
    : 0;
  if (args.balance - (args.committed ?? 0) < args.cost * (1 - boardShare)) return { approved: false, reason: "no_money" };
  return { approved: true, boardShare: Math.round(boardShare * 100) / 100 };
}

// ── Projects ──────────────────────────────────────────────────────────────────

/** Items a project occupies: its item, or every item of a group work (comfort: the seats). */
function projectItems(p: FacilityProject): FacilityItemId[] {
  if (p.item) return [p.item];
  if (p.kind === "comfort") return ["seats"];
  const g = LEVEL_GROUP[p.kind];
  return g ? itemsOfGroup(g) : [];
}

/** A group work (stand, comfort, training, academy) can start: none of the same kind, no project on its items. */
export function projectRunning(f: ClubFacilities, kind: FacilityKind): boolean {
  if (f.projects.some((p) => p.kind === kind)) return true;
  const items: FacilityItemId[] = kind === "comfort" ? ["seats"] : LEVEL_GROUP[kind] ? itemsOfGroup(LEVEL_GROUP[kind]!) : [];
  return items.some((id) => itemBusy(f, id));
}

/** An item already has a project (its own, or a group work that covers it). */
export function itemBusy(f: ClubFacilities, item: FacilityItemId): boolean {
  return f.projects.some((p) => projectItems(p).includes(item));
}

function instalmentCount(start: string, end: string): number {
  return Math.max(1, Math.ceil(daysBetween(start, end) / F.INSTALMENT_DAYS));
}

/** A new project from an approved quote. */
export function startProject(
  f: ClubFacilities, quote: ProjectQuote, args: { id: string; date: string; boardShare: number },
): ClubFacilities {
  const end = addDays(args.date, quote.weeks * 7);
  const project: FacilityProject = {
    id: args.id,
    kind: quote.kind,
    ...(quote.stand ? { stand: quote.stand, seats: quote.seats } : {}),
    ...(quote.level !== undefined ? { level: quote.level } : {}),
    ...(quote.item ? { item: quote.item } : {}),
    ...(quote.to !== undefined ? { to: quote.to } : {}),
    start: args.date,
    end,
    cost: quote.cost,
    boardShare: args.boardShare,
    instalments: instalmentCount(args.date, end),
    paid: 0,
  };
  return { ...f, projects: [...f.projects, project] };
}

/**
 * A small repair (`quote.small`): paid now from the balance, in one `facilities` line, no board. The
 * project stays until its end (delivery, the works card) already paid.
 */
export function payRepairNow(
  f: ClubFacilities, quote: ProjectQuote, args: { id: string; date: string },
): { facilities: ClubFacilities; entry: LedgerEntry } {
  const started = startProject(f, quote, { ...args, boardShare: 0 });
  const projects = started.projects.map((p) => (p.id === args.id ? { ...p, instalments: 1, paid: 1 } : p));
  return {
    facilities: { ...started, projects },
    entry: {
      date: args.date, kind: "facilities", amount: -quote.cost, label: `Facilities repair (${quote.item ?? quote.kind})`,
      ref: { facility: quote.kind, ...(quote.item ? { item: quote.item } : {}) },
    },
  };
}

/** The club's share of the instalments still to pay on the running projects. */
export function committedSpend(f: ClubFacilities): number {
  let sum = 0;
  for (const p of f.projects) {
    const boardTotal = Math.round(p.cost * p.boardShare);
    for (let k = p.paid; k < p.instalments; k++) {
      sum += instalmentAmount(p.cost, p.instalments, k) - instalmentAmount(boardTotal, p.instalments, k);
    }
  }
  return sum;
}

/** Amount of instalment `k` (0-based) of `total` split in `n` (the parts sum exactly to `total`). */
export function instalmentAmount(total: number, n: number, k: number): number {
  return Math.round((total * (k + 1)) / n) - Math.round((total * k) / n);
}

/** Progress 0..1 of a project on `date`. */
export function projectProgress(p: FacilityProject, date: string): number {
  const len = daysBetween(p.start, p.end);
  return len <= 0 ? 1 : clamp(daysBetween(p.start, date) / len, 0, 1);
}

export interface FacilityDayResult {
  facilities: ClubFacilities;
  /** Ledger lines of the day (instalments and the board's part of them). */
  entries: LedgerEntry[];
  completed: FacilityProject[];
}

/**
 * One day of the facilities: instalments due by `date` (every 30 days from the start, all paid by
 * the end) and projects that finish on or before `date`.
 */
export function advanceFacilities(f: ClubFacilities, date: string): FacilityDayResult {
  const entries: LedgerEntry[] = [];
  const completed: FacilityProject[] = [];
  let stands = f.stands;
  let items = f.items;
  const remaining: FacilityProject[] = [];
  for (const p0 of f.projects) {
    let p = p0;
    const boardTotal = Math.round(p.cost * p.boardShare);
    while (p.paid < p.instalments && (addDays(p.start, p.paid * F.INSTALMENT_DAYS) <= date || p.end <= date)) {
      const k = p.paid;
      const ref = { facility: p.kind, ...(p.stand ? { stand: p.stand } : {}), ...(p.item ? { item: p.item } : {}) };
      entries.push({
        date, kind: "facilities", amount: -instalmentAmount(p.cost, p.instalments, k),
        label: `Facilities works (${p.item ?? p.kind})`, ref,
      });
      const board = instalmentAmount(boardTotal, p.instalments, k);
      if (board > 0) entries.push({ date, kind: "board_funding", amount: board, label: `Board funding (${p.item ?? p.kind})`, ref });
      p = { ...p, paid: k + 1 };
    }
    if (p.end <= date) {
      completed.push(p);
      if (p.kind === "stand" && p.stand && p.seats) {
        stands = stands.map((s) => (s.id === p.stand ? { ...s, seats: s.seats + p.seats! } : s));
      } else {
        items = applyCompletion(items, p);
      }
    } else {
      remaining.push(p);
    }
  }
  const done: CompletedFacilityProject[] = completed.map((p) => ({
    id: p.id, kind: p.kind, date,
    ...(p.stand ? { stand: p.stand, seats: p.seats } : {}),
    ...(p.level !== undefined ? { level: p.level } : {}),
    ...(p.item ? { item: p.item } : {}),
    ...(p.to !== undefined ? { to: p.to } : {}),
  }));
  const changed = entries.length > 0 || completed.length > 0;
  return {
    facilities: changed
      ? { ...f, stands, items, projects: remaining, completed: [...f.completed, ...done].slice(-F.COMPLETED_KEEP) }
      : f,
    entries,
    completed,
  };
}

const LEVEL_GROUP: Partial<Record<FacilityKind, FacilityGroup>> = { training: "training", academy: "academy" };

/**
 * Items after a finished project. Group works (comfort, training, academy) raise every item of the
 * group (comfort: the seats) to at least 2 × the new level, at 100%.
 */
export function applyCompletion(items: ClubFacilities["items"], p: FacilityProject): ClubFacilities["items"] {
  if (p.item) {
    const it = items[p.item];
    const level = p.kind === "upgrade" ? Math.min(F.ITEM_MAX_LEVEL, p.level ?? it.level + 1) : it.level;
    // Repair: the target condition; rebuild / upgrade: 100%. Warnings and the condemnation go.
    return { ...items, [p.item]: { level, wear: wearFor(p.kind === "repair" ? p.to ?? 100 : 100) } };
  }
  if (p.level === undefined) return items;
  const group = LEVEL_GROUP[p.kind];
  const ids = p.kind === "comfort" ? ["seats" as const] : group ? itemsOfGroup(group) : [];
  if (ids.length === 0) return items;
  const out = { ...items };
  for (const id of ids) out[id] = { level: Math.min(F.ITEM_MAX_LEVEL, Math.max(out[id].level, 2 * p.level)), wear: 0 };
  return out;
}

/** The squad with its facilities; the venue capacity follows the built seats. */
export function withFacilities(squad: Squad, f: ClubFacilities): Squad {
  const seats = totalSeats(f);
  return {
    ...squad,
    facilities: f,
    ...(squad.venue && squad.venue.capacity !== seats ? { venue: { ...squad.venue, capacity: seats } } : {}),
  };
}

export interface HomeGameToday {
  competition: string;
  opponentId: string;
  neutral?: boolean;
  /** Big-match multiplier of this game (matchImportance.ts); absent = 1. */
  importance?: number;
}

/**
 * Today's home games of the human club: attendance of each (unrounded, 0 on a neutral venue) and
 * the attendance log / record updated. `recordBroken` only when a previous record existed.
 */
export function facilitiesMatchday(
  f: ClubFacilities, games: HomeGameToday[], date: string, input: DemandInput,
): { facilities: ClubFacilities; attendance: number[]; recordBroken: { previous: number; attendance: number; competition: string; opponentId: string } | null } {
  let cur = f;
  let recordBroken: { previous: number; attendance: number; competition: string; opponentId: string } | null = null;
  const attendance = games.map((g) => {
    if (g.neutral) return 0;
    const a = attendanceOf(cur, { ...input, date, ...(g.importance !== undefined ? { importance: g.importance } : {}) });
    const r = recordAttendance(cur, {
      date, competition: g.competition, opponentId: g.opponentId,
      attendance: Math.round(a.attendance), capacity: a.capacity, demand: Math.round(a.demand),
    });
    cur = r.facilities;
    if (r.recordBroken) recordBroken = { ...r.recordBroken, competition: g.competition, opponentId: g.opponentId };
    return a.attendance;
  });
  return { facilities: cur, attendance, recordBroken };
}

// ── Signings ──────────────────────────────────────────────────────────────────

const meanCondition = (f: ClubFacilities, g: FacilityGroup): number => {
  const ids = itemsOfGroup(g);
  return ids.reduce((s, id) => s + itemCondition(f, id), 0) / ids.length;
};

/**
 * How a club's facilities look to a player it wants to sign, 0..100: the mean condition of the
 * training ground (a player up to 21: training ground and academy). No living facilities (AI clubs,
 * old saves): 100, no effect.
 */
export function facilitiesAppeal(squad: Squad, player: Pick<RosterPlayer, "age">): number {
  const f = livingFacilities(squad);
  if (!f) return 100;
  const training = meanCondition(f, "training");
  return player.age <= F.APPEAL.YOUTH_MAX_AGE ? (training + meanCondition(f, "academy")) / 2 : training;
}

/** 0 from `APPEAL.THRESHOLD` up, 1 at 0. */
const appealGap = (appeal: number): number => clamp((F.APPEAL.THRESHOLD - appeal) / F.APPEAL.THRESHOLD, 0, 1);

/** × a signing's wage demand for poor facilities (up to +10% with everything at 0). */
export const appealDemandMult = (appeal: number): number => 1 + F.APPEAL.DEMAND_MAX * appealGap(appeal);

/** Taken off the club's `preferenceScore` for poor facilities (up to 0.10). */
export const appealPreferencePenalty = (appeal: number): number => F.APPEAL.PREFERENCE_MAX * appealGap(appeal);

/** A very ambitious player (ambition ≥ 17) refuses a club whose training ground is below 25%. */
export function refusesPoorFacilities(player: RosterPlayer, squad: Squad): boolean {
  const f = livingFacilities(squad);
  if (!f) return false;
  return personalityOf(player).ambition >= PERSONALITY.SMALLER_CLUB_REFUSE_AMBITION
    && meanCondition(f, "training") < F.APPEAL.REFUSE_BELOW;
}
