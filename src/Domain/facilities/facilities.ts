import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { stadiumFillRate } from "@/Domain/boardFans/boardFans";
import { GATE, gateFromAttendance, type GateKind } from "@/Domain/finance/gate";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { addDays, daysBetween } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import type { Squad } from "@/types/playerTypes";
import type {
  AttendanceRow, BoardRefusal, ClubFacilities, CompletedFacilityProject, FacilityKind, FacilityProject,
  FacilityRequest, StadiumStand, StandId,
} from "@/types/facilityTypes";

/** Pure club-facilities model (`.claude/rules/game/facilities.md`). No I/O. */

const lvlIdx = (level: number) => clamp(Math.round(level), F.MIN_LEVEL, F.MAX_LEVEL) - 1;

// ── Levels and effects ────────────────────────────────────────────────────────

/** Level by financial tier — AI clubs, and the starting level of a human club. */
export function impliedLevel(squad: Squad): number {
  return F.IMPLIED_LEVEL[financialTierOf(squad)];
}

/** Training ground and academy levels: the stored ones (human club) or the tier's implied level. */
export function facilityLevels(squad: Squad): { training: number; academy: number } {
  if (squad.facilities) return { training: squad.facilities.training, academy: squad.facilities.academy };
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

export function trainingEffectsAt(level: number): TrainingGroundEffects {
  const i = lvlIdx(level);
  return { recoveryMult: F.TRAINING_RECOVERY[i]!, injuryMult: F.TRAINING_INJURY[i]!, devMult: F.TRAINING_DEV[i]! };
}

/** Training-ground effects of a club. Never applied inside a match. */
export function trainingGroundEffectsOf(squad: Squad): TrainingGroundEffects {
  return trainingEffectsAt(facilityLevels(squad).training);
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
  const i = lvlIdx(level);
  return {
    qualityBonus: (i + 1 - F.NEUTRAL_LEVEL) * F.ACADEMY_QUALITY_STEP,
    intakeMax: F.ACADEMY_INTAKE_MAX[i]!,
    promiseChance: F.ACADEMY_PROMISE[i]!,
  };
}

/**
 * Academy effects of a club, relative to the implied level of its tier: the intake already has the
 * tier bonus (`YOUTH.TIER_BONUS`), so an AI club (implied level) is always neutral, and the human
 * club gains or loses only for the levels it built above or below its tier's implied level.
 */
export function academyEffectsOf(squad: Squad): AcademyEffects {
  if (!squad.facilities) return academyEffectsAt(F.NEUTRAL_LEVEL);
  return academyEffectsAt(F.NEUTRAL_LEVEL + squad.facilities.academy - impliedLevel(squad));
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

/** Ticket price multiplier of the comfort level (level 1 = × 1). */
export function comfortPriceMult(comfort: number): number {
  return 1 + F.COMFORT_PRICE_STEP * (clamp(Math.round(comfort), F.MIN_LEVEL, F.MAX_LEVEL) - 1);
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
  return Math.max(0, a.capacity * fill * followers * tier * phase);
}

/** Attendance = min(seats available, demand) (unrounded; round only for display). */
export function attendanceOf(f: ClubFacilities, input: DemandInput): { attendance: number; capacity: number; demand: number } {
  const capacity = effectiveCapacity(f, input.date);
  const demand = demandOf(f, input);
  return { attendance: Math.min(capacity, demand), capacity, demand };
}

/** Gate of one home game of the human club. */
export function facilitiesGate(f: ClubFacilities, input: DemandInput, kind: GateKind, neutral = false): number {
  return gateFromAttendance(attendanceOf(f, input).attendance, kind, neutral, comfortPriceMult(f.comfort));
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

/** A human club's facilities: stands from its capacity, comfort 1, training/academy at the tier's level. */
export function initialFacilities(squad: Squad, tier: number): ClubFacilities {
  const capacity = squad.venue?.capacity ?? 0;
  const level = impliedLevel(squad);
  return {
    stands: splitStands(capacity),
    comfort: F.MIN_LEVEL,
    training: level,
    academy: level,
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
}

export interface QuoteContext {
  /** Annual revenue (`wageRevenueBasisOf`). */
  revenue: number;
  /** EUR per seat (`seatCost`). */
  seatCost: number;
}

/** Cost and duration of a request; `null` when it is not possible (level 5 already, bad seats). */
export function quoteProject(f: ClubFacilities, req: FacilityRequest, ctx: QuoteContext): ProjectQuote | null {
  if (req.kind === "stand") {
    if (!validSeats(req.seats) || !f.stands.some((s) => s.id === req.stand)) return null;
    return {
      kind: "stand", stand: req.stand, seats: req.seats,
      cost: Math.round(req.seats * ctx.seatCost), weeks: standWeeks(req.seats),
      newCapacity: totalSeats(f) + req.seats,
    };
  }
  const current = f[req.kind];
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
  const f = squad.facilities;
  if (!f) return 0;
  const base = impliedLevel(squad);
  const yearly = Math.max(0, revenue)
    * (Math.max(0, f.training - base) * F.TRAINING_UPKEEP_SHARE + Math.max(0, f.academy - base) * F.ACADEMY_UPKEEP_SHARE);
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

export function projectRunning(f: ClubFacilities, kind: FacilityKind): boolean {
  return f.projects.some((p) => p.kind === kind);
}

export function instalmentCount(start: string, end: string): number {
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
    start: args.date,
    end,
    cost: quote.cost,
    boardShare: args.boardShare,
    instalments: instalmentCount(args.date, end),
    paid: 0,
  };
  return { ...f, projects: [...f.projects, project] };
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
  let comfort = f.comfort;
  let training = f.training;
  let academy = f.academy;
  const remaining: FacilityProject[] = [];
  for (const p0 of f.projects) {
    let p = p0;
    const boardTotal = Math.round(p.cost * p.boardShare);
    while (p.paid < p.instalments && (addDays(p.start, p.paid * F.INSTALMENT_DAYS) <= date || p.end <= date)) {
      const k = p.paid;
      const ref = { facility: p.kind, ...(p.stand ? { stand: p.stand } : {}) };
      entries.push({
        date, kind: "facilities", amount: -instalmentAmount(p.cost, p.instalments, k),
        label: `Facilities works (${p.kind})`, ref,
      });
      const board = instalmentAmount(boardTotal, p.instalments, k);
      if (board > 0) entries.push({ date, kind: "board_funding", amount: board, label: `Board funding (${p.kind})`, ref });
      p = { ...p, paid: k + 1 };
    }
    if (p.end <= date) {
      completed.push(p);
      if (p.kind === "stand" && p.stand && p.seats) {
        stands = stands.map((s) => (s.id === p.stand ? { ...s, seats: s.seats + p.seats! } : s));
      } else if (p.kind === "comfort") comfort = p.level ?? comfort;
      else if (p.kind === "training") training = p.level ?? training;
      else if (p.kind === "academy") academy = p.level ?? academy;
    } else {
      remaining.push(p);
    }
  }
  const done: CompletedFacilityProject[] = completed.map((p) => ({
    id: p.id, kind: p.kind, date,
    ...(p.stand ? { stand: p.stand, seats: p.seats } : {}),
    ...(p.level !== undefined ? { level: p.level } : {}),
  }));
  const changed = entries.length > 0 || completed.length > 0;
  return {
    facilities: changed
      ? { ...f, stands, comfort, training, academy, projects: remaining, completed: [...f.completed, ...done].slice(-F.COMPLETED_KEEP) }
      : f,
    entries,
    completed,
  };
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
    const a = attendanceOf(cur, { ...input, date });
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
