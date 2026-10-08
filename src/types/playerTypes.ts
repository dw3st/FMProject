import type { ClubFacilities } from "@/types/facilityTypes";
import type { StaffRecord } from "@/types/staffTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
import type { ClubMoraleState, PlayerMoraleLog, SquadStatus } from "@/types/moraleTypes";
import type { Personality, PersonalityView } from "@/types/personalityTypes";
import type { ScoutView } from "@/types/scoutingTypes";
import type { PlayerAward } from "@/types/awardTypes";

export interface PlayerStatsRecord {
  passing: number;
  vision: number;
  finishing: number;
  dribbling: number;
  speed: number;
  acceleration: number;
  tackling: number;
  pressing: number;
  stamina: number;
  heading: number;
  strength: number;
  reflex: number;
  jump: number;
}

interface PlayerProfile {
  summary: string;
  archetype: string;
}

export interface PlayerSeasonLog {
  appearances: number;
  goals:       number;
  assists:     number;
  shots:       number;
  passesCompleted: number;
  passesAttempted: number;
  tackles:     number;
  interceptions: number;
  avgRating:   number;
  /** Last 5 match ratings (0–10), newest last. */
  recentRatings: number[];
  trainingSessions: number;
  fitness:     number;
  morale:      number;
  /**
   * Accumulated fatigue (minutes-equivalent), decaying with a half-life — see
   * `.claude/rules/game/fitness.md` and `src/Domain/fitness/fitness.ts`. High load slows daily
   * `fitness` recovery and raises in-match energy drain (`drainMultiplier`). Absent means 0 (a
   * fresh/never-tracked player) — not written by older saves, no migration needed per
   * `CLAUDE.md`'s prototype rule.
   */
  load?: number;
  /** National-cup games only (the fields above are the season total, league + cup). */
  cup?: { appearances: number; goals: number; assists: number };
  /** Continental competition games only (ucl/uel/lib/sud) — the fields above are the season total. */
  continental?: { appearances: number; goals: number; assists: number };
  /**
   * Cards this season, all competitions together (league + cup + continental share one count —
   * `.claude/rules/game/discipline.md`). A second yellow adds one yellow and one red. Absent = 0.
   */
  yellowCards?: number;
  redCards?: number;
  /**
   * Injuries this season (match + training) and the days out they cost, counted on the day each
   * injury happens (`returnDate − date`; only the extension when it lengthens a current injury).
   * Absent = 0. Feeds the career rows (`.claude/rules/game/history.md`).
   */
  injuries?: number;
  daysInjured?: number;
}

export function emptySeasonLog(): PlayerSeasonLog {
  return {
    appearances: 0, goals: 0, assists: 0, shots: 0,
    passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0,
    avgRating: 0, recentRatings: [], trainingSessions: 0, fitness: 75, morale: 70,
  };
}

/** Development points accumulated per attribute. Persisted on the player. */
export interface DevelopmentProgress {
  passing:      number;
  vision:       number;
  finishing:    number;
  dribbling:    number;
  speed:        number;
  acceleration: number;
  tackling:     number;
  pressing:     number;
  stamina:      number;
  heading:      number;
  strength:     number;
  reflex:       number;
  jump:         number;
}

export function emptyDevelopmentProgress(): DevelopmentProgress {
  return {
    passing: 0, vision: 0, finishing: 0, dribbling: 0,
    speed: 0, acceleration: 0, tackling: 0, pressing: 0,
    stamina: 0, heading: 0, strength: 0,
    reflex: 0, jump: 0,
  };
}

/** Fixed-wage contract (`src/Domain/contracts`). `until` is the last day of a league season. */
export interface PlayerContract {
  until: string;
  /** Weekly wage in EUR, fixed for the whole contract. */
  wage: number;
}

export interface RosterPlayer {
  id: string;
  name: string;
  age: number;
  squadId: string;
  preferredFoot: "left" | "right";
  positions: string[];
  stats: PlayerStatsRecord;
  profile: PlayerProfile;
  seasonLog?: PlayerSeasonLog;
  progress?: DevelopmentProgress;
  /** When set (e.g. from data pipeline), used for scout / UI. */
  nationality?: string | null;
  /** Date of birth, YYYY-MM-DD (from the data pipeline). Absent = unknown. */
  birthDate?: string;
  /** Height in centimetres (from the data pipeline). Absent = unknown. */
  heightCm?: number;
  /** Cached best weighted score across all specific roles in the player's main role.
   *  Recomputed when stats change (see PlayerDevelopment.applyDevelopment). */
  overallAvg?: number;
  /**
   * Active injury (`src/Domain/injury/injury.ts`). Absent means healthy. The day advance clears
   * this once `date >= returnDate` (`clearHealed`) — a player is `isInjured` for any date strictly
   * before `returnDate`.
   */
  injury?: { severity: "light" | "medium" | "severe"; returnDate: string };
  /**
   * Match ban still to serve (`src/Domain/discipline/discipline.ts`). One match is served each
   * time the club plays an official match. Absent = available. Carries over the season rollover.
   */
  suspension?: { matches: number };
  /** Current contract. Assigned at career creation and on every signing/renewal. */
  contract?: PlayerContract;
  /** Reborn academy star (+30% DP while young). */
  reborn?: RebornMark;
  /** Closed seasons (and partial stints), oldest first (`.claude/rules/game/history.md`). */
  history?: PlayerHistoryRow[];
  /**
   * Sell-on clause (`.claude/rules/game/negotiation.md`): `pct`% of the next fee he leaves for goes
   * to `clubId`. Paid and cleared on that transfer.
   */
  sellOn?: SellOnClause;
  /**
   * On loan at the squad he is in (`.claude/rules/game/negotiation.md`). The contract stays the
   * parent club's; the borrowing club pays `wageShare` (0..1) of the wage. Returns at `until`.
   */
  loan?: PlayerLoan;
  /**
   * Market-value boost of a season award (`.claude/rules/game/awards.md`), until the next rollover
   * of his league. Never read by the engine.
   */
  awardBoost?: { season: string; league: string; mult: number };
  /**
   * Morale 0..100 (`.claude/rules/game/morale.md`). Human club only; absent = the neutral start
   * (65). AI clubs never store it and play at the neutral value.
   */
  morale?: number;
  /** Role in the squad chosen by the manager (human club only); absent = the suggested one. */
  squadStatus?: SquadStatus;
  /** Morale bookkeeping: minutes window, 7-day trend, talks (human club only). */
  moraleLog?: PlayerMoraleLog;
  /**
   * Personality override (`.claude/rules/game/personality.md`). The game never writes it: the
   * traits are derived from the id (`personalityOf`). Tests and future curated data only.
   */
  personality?: Personality;
  /**
   * Screen-only view of the personality of a player outside the human club, blurred by the chief
   * scout (`obscurePlayer`). Never read by the engine or the day advance.
   */
  personalityView?: PersonalityView;
  /**
   * Screen-only: how well the human manager knows this player (`.claude/rules/game/scouting.md`),
   * set on API responses together with the blurred stats. Never stored, never read by the engine.
   */
  scoutView?: ScoutView;
  /**
   * Natural position fixed by curated data (`data_process/curated/playerCorrections.json`,
   * `.claude/rules/game/positions.md`). Ignored unless it is in the player's main line; when valid
   * it replaces the attribute-derived natural role and the overall is that role's score.
   */
  naturalPosition?: DetailedRole;
}

/** The 14 detailed positions (`src/Data/roles.json`). */
export type DetailedRole =
  | "GK" | "CB" | "LB" | "RB" | "LWB" | "RWB" | "CDM" | "CM" | "CAM" | "LM" | "RM" | "LW" | "RW" | "ST";

export interface SellOnClause {
  clubId: string;
  clubName: string;
  /** 10, 20 or 30. */
  pct: number;
}

export interface PlayerLoan {
  fromClubId: string;
  fromClubName: string;
  /** ISO date the player goes back. */
  until: string;
  /** Share of the wage the borrowing club pays, 0..1. */
  wageShare: number;
}

export interface ClubFinances {
  broadcasting: number;
  commercial: number;
  total: number;
  budget: number;
  followers: number;
}

/** AI club financial tier (`src/Domain/aiFinance`). Never set on the human club. */
export type FinancialTier = "LOW" | "MEDIUM" | "HIGH" | "ELITE";

export interface ClubVenue {
  name: string;
  city: string;
  capacity: number;
  surface?: string;
}

interface ClubCoach {
  id: number;
  name: string;
  firstname?: string | null;
  lastname?: string | null;
  age?: number | null;
  nationality?: string | null;
  points?: number;
}

export interface Squad {
  id: string;
  name: string;
  colors: [string, string];
  money: number;
  players: RosterPlayer[];
  /** Filesystem / URL segment (e.g. atletico_mineiro); may differ from `id` (e.g. squad__001). */
  slug?: string;
  /** Set when listing squads from save paths (…/squads/{leagueSlug}/…). */
  leagueSlug?: string;
  /**
   * Bumped by every `SaveService.moveSquad`. If a move's delete of the old file
   * fails, both copies exist; the squad index keeps the one with the higher rev.
   */
  membershipRev?: number;
  /** Club country from squad data; used as nationality fallback in scout. */
  country?: string;
  finances?: ClubFinances;
  /**
   * AI clubs only: financial tier, written at each season rollover (performance + promotion /
   * relegation). Until the club's first rollover it is absent and the tier is derived from income
   * (`financialTierOf`).
   */
  financialTier?: FinancialTier;
  /**
   * AI clubs only: transfer money left this season (€). Granted from tier + popularity at each
   * rollover, reduced by fees, partly refilled by sales. Absent = the full seasonal grant
   * (`aiTransferBudgetOf`). AI clubs never use `finances.budget`; the human club only uses that.
   */
  aiTransferBudget?: number;
  venue?: ClubVenue;
  /** Head coach from data pipeline; use `id` for identity when present. */
  coach?: ClubCoach;
  /**
   * Per-club wage multiplier (`src/Domain/finance/wages.ts` — `clubWageFactor`, applied to the
   * shared curve `weeklyWage(rating)`), correcting for the club's actual revenue vs the curve's
   * baseline. Set at career creation and CARRIED FORWARD (not recomputed from scratch) at each
   * season rollover — `carryForwardWageFactor(oldFactor, wageRevenueBasis, newRevenue)` — so a
   * club's bill doesn't snap back to exactly 60% of revenue every season regardless of how it
   * actually spent. Absent means `wageFactorOf` computes it on the fly from the squad's current
   * finances/roster (no history to carry forward from).
   */
  wageFactor?: number;
  /**
   * The `clubAnnualRevenue` (`src/Domain/finance/wages.ts`) used the LAST time `wageFactor` was
   * set — the basis `carryForwardWageFactor` scales from at the next rollover, and the basis
   * `aiClubFinance`'s wage cap reads (`wageRevenueBasisOf`) so the cap and the stored factor's
   * bill agree on the same league-size assumption instead of the cap recomputing revenue with a
   * generic fallback home-game count. Always set together with `wageFactor`.
   */
  wageRevenueBasis?: number;
  /**
   * Technical staff, one professional per role (`src/Domain/staff`). Only the human club writes
   * this; clubs without it (every AI club) use the implicit rating of their financial tier.
   * Present-but-empty role = vacant.
   */
  staff?: StaffRecord;
  /**
   * Club facilities: stadium stands, comfort, training ground, academy (`src/Domain/facilities`).
   * Human club only; AI clubs use the implied level of their financial tier.
   */
  facilities?: ClubFacilities;
  /**
   * Style familiarity 0..100 (`src/Domain/familiarity`). Human club only, set at career creation
   * and moved by daily training; AI clubs store none and follow the implicit rule.
   */
  styleFamiliarity?: FamiliarityLevels;
  /**
   * Academy players (human club only, `src/Domain/youth`): the yearly intake lands here, not in
   * `players`. They train and age at the rollover but do not play until promoted.
   */
  youth?: RosterPlayer[];
  /**
   * AI clubs only: the formation chosen for the season (`src/Domain/formation/aiFormation.ts`).
   * Recomputed when the season or the roster changes; the human club uses its tactics instead.
   */
  aiFormation?: AiFormationRecord;
  /**
   * Talk requests and promises of the human club (`.claude/rules/game/morale.md`). AI clubs never
   * store it; a club switch clears it (old club) and starts it empty (new club).
   */
  moraleClub?: ClubMoraleState;
}

/** AI club's formation for a season (`chooseAiFormation`). */
export interface AiFormationRecord {
  /** Formation id (one of the ready-made ones). */
  id: string;
  /** Season key the choice was made for (`aiSeasonKey`). */
  season: string;
  /** Hash of the roster ids at the time of the choice — a different roster re-chooses. */
  roster: number;
  /** Mean slot value of the chosen XI (compared with the opponent's for the underdog shape). */
  level: number;
  /** Defensive shape played against a much stronger opponent; absent = keep `id`. */
  defensive?: string;
}

export interface LeagueTeam {
  squadId: string;
  name: string;
  colors: [string, string];
  /** Club file slug from leagueData standings; used for routes and logos when `id` is not league_prefixed. */
  slug?: string;
}

export interface StandingRow extends LeagueTeam {
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: ("W" | "D" | "L")[];
}

export type LeagueZoneColor =
  | "blue"
  | "orange"
  | "cyan"
  | "green"
  | "red"
  | "purple";

export interface LeagueZone {
  id: string;
  label: string;
  color: LeagueZoneColor;
  from?: number;
  to?: number;
  fromEnd?: number;
}

export interface LeagueData {
  slug: string;
  name: string;
  country: string;
  season: string;
  standings: LeagueTeam[];
  zones?: LeagueZone[];
  iso2?: string;
  source?: string;
}

/** A player released at the end of his contract, waiting for a club (`saves/{id}/freeAgents.json`). */
export interface FreeAgent {
  player: RosterPlayer;
  /** Release date (ISO). Free agents leave the world a season after this. */
  since: string;
}

/** Marks the academy player reborn from a retired world-class star (`.claude/rules/game/retirement.md`). */
interface RebornMark {
  fromId: string;
}

/** Minimal record of a retired player (`saves/{id}/retired.json`). */
export interface RetiredPlayer {
  id: string;
  name: string;
  nationality: string | null;
  positions: string[];
  preferredFoot: "left" | "right";
  profile: PlayerProfile;
  retiredOn: string;
  squadId: string;
  age: number;
  wasWorldClass: boolean;
  statsAtRetirement: PlayerStatsRecord;
  /** Last season's games / goals for the club (for the inbox line). */
  appearances: number;
  goals: number;
  /** Human club world-class retiree only: reborn offer state. */
  /** Retired from the free-agent pool (not from a squad). */
  freeAgent?: true;
  rebornOffer?: "pending" | "accepted" | "declined" | "expired";
  /** Career history at retirement. */
  history?: PlayerHistoryRow[];
}

/** One closed season (or partial stint) of a player at one club. */
export interface PlayerHistoryRow {
  /** League season label of the club ("2026-27" / "2027"). */
  season: string;
  squadId: string;
  clubName: string;
  league: string;
  apps: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  cupApps: number;
  cupGoals: number;
  contApps: number;
  contGoals: number;
  /** Cards (all competitions) and injuries / days out at this club this season. */
  yellowCards: number;
  redCards: number;
  injuries: number;
  daysInjured: number;
  /** "league:<slug>" | "cup:<slug>" | "continental:<slug>". */
  titles: string[];
  /** Stint at a club the player left mid-season (transfer). */
  partial?: true;
  /** Partial row whose stats are still inside the current `seasonLog` (cleared at the next rollover). */
  open?: true;
  /** Stint on loan (`.claude/rules/game/negotiation.md`). */
  loan?: true;
  /** Season awards won with this row (`.claude/rules/game/awards.md`). */
  awards?: PlayerAward[];
}
