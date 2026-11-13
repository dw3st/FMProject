import type { MatchDecision } from "@/types/groupAdvanceTypes";
import type { SeatStanding } from "@/types/standingsTypes";
import type { BoardState } from "@/types/boardTypes";
import type { PressState } from "@/types/pressTypes";
import type { JobOffer, Unemployment } from "@/types/jobTypes";
import type { MatchMarking, TacticalStyle } from "@/types/tacticsTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { FamiliarityKey } from "@/types/familiarityTypes";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import type { ManagerBan } from "@/Domain/referees/managerBan";
import type { ManagerContract, ManagerRenewalOffer } from "@/Domain/managers/managerContract";
import type { InboxPrefs } from "@/Domain/inbox/inboxTopics";
import type { DirectorDecision, Responsibilities } from "@/Domain/responsibilities/director";
import type { YouthCallUps } from "@/Domain/youthComps/callUps";
import type { SeatLastSeason } from "@/types/seasonSummaryTypes";

/** Manager identity picked at new-game time (moved here from `SaveService`, which re-exports it). */
export interface SaveManager {
  name:           string;
  nationalityIso: string;   // e.g. "br", "pt"
  backgroundId:   string;   // e.g. "former-player"
  /** Avatar picked in the new game (Etapa 31b); absent = the face drawn from the manager id. */
  face?:          ManagerFace;
}

/** Rotation swaps the user accepted (or opted out of) for the match played on `date`. */
export interface RotationOverride {
  date: string;
  swaps: { out: string; in: string }[];
  optOut?: boolean;
}

/** Call-ups of the last youth game of each competition who did not play (shown on the call-up panel). */
export interface YouthCallUpsSkipped {
  u21?: { date: string; players: string[] };
  u19?: { date: string; players: string[] };
}

/**
 * One human manager of a world (`saves/{saveId}/seats/{seatId}/seat.json`, `.claude/rules/game/multiplayer.md`):
 * everything that was the player's in the save meta. The world (date, leagues, calendar) stays in `SaveMeta`.
 */
export interface SeatState {
  /** Retired players the manager starred (tester report: to find them again when bringing a legend back). */
  retiredFavorites?: string[];
  /** Public world: ISO of the last time the manager opened the world (written at most hourly). */
  lastSeenAt?: string;
  /** Public world: ISO of the inactivity warning (5 days). */
  inactiveWarnedAt?: string;
  clubId:     string;
  clubName:   string;
  clubColors: [string, string];
  leagueSlug: string;
  leagueName: string;
  manager?:   SaveManager;
  formation?: string;
  tactical_style?: TacticalStyle;
  /** Minimum fitness (0–100) for a player to take part in a training day. */
  min_energy_to_train?: number;
  training_intensity?: TrainingIntensity;
  /** Style the seat's club drills on training days; absent = the tactics style. */
  style_focus?: FamiliarityKey;
  /** Leagues (besides the seat's own) resolved by the full engine. Max 3 — see simMode.ts. */
  followedLeagues?: string[];
  /** Rest days of the seat's club (pre-seeded around its matches, toggled by the player). */
  restDays?: string[];
  /** The eve of every match (4.47.21): rest or train; kept for the next seasons. Absent = rest (the seeded days). */
  matchEve?: "rest" | "training";
  rotationOverride?: RotationOverride;
  /** Man-marking chosen for the match on `date`; cleared by the next advance. */
  matchMarking?: MatchMarking;
  youthCallUps?: YouthCallUps;
  youthCallUpsSkipped?: YouthCallUpsSkipped;
  /** Game date the youth coach already made his call-ups for, the day before (`staff.md` → "Treinador da base"). */
  youthCoachPlanned?: string;
  board?: BoardState;
  press?: PressState;
  managerBan?: ManagerBan;
  sackingEnabled?: boolean;
  unemployed?: Unemployment;
  jobOffers?: JobOffer[];
  jobsMidSeason?: string;
  /** "Available on the market" (8.9.23): offers every two weeks while employed; the board loses a little each month. */
  jobSeeking?: { since: string; nextOfferDate: string };
  /** An application to a club (8.9.29): decided when sent, answered on `answerOn` (`offer` only when the board said yes). */
  jobApplication?: import("@/types/jobTypes").JobApplication;
  /** Clubs that refused an application, with the day (no new application for RETRY_DAYS). */
  jobRefused?: Record<string, string>;
  careerStart?: string;
  managerContract?: ManagerContract;
  managerEarnings?: number;
  /** Spent on personal assets (`src/Domain/managers/assets.ts`); earnings never go down. */
  managerSpent?: number;
  /** Level bought of each personal asset. */
  managerAssets?: import("@/Domain/managers/assets").ManagerAssets;
  /** Stadium decorations bought with his money (9.1, `decorShop.ts`): they stay with him from club to club. */
  managerDecor?: string[];
  /** Languages and coaching licences bought with his money (9.3, `src/Domain/managers/courses.ts`). */
  managerStudies?: import("@/Domain/managers/courses").ManagerStudies;
  /** Trusted professionals waiting for his next club (10.7, `src/Domain/staff/trustedStaff.ts`); no contract. */
  trustedStaff?: import("@/types/staffTypes").StaffMember[];
  /** Payout minus stake of the resolved bets (`.claude/rules/game/bets.md`); never touches the earnings. */
  betNet?: number;
  betExact?: number;
  betLongshot?: boolean;
  managerRenewal?: ManagerRenewalOffer;
  managerContractNotices?: string[];
  inboxPrefs?: InboxPrefs;
  responsibilities?: Responsibilities;
  directorDecisions?: Record<string, DirectorDecision>;
  /** Group advance (part 3): the date the seat lets the world reach without him; null = not ready. */
  readyUntil?: string | null;
  /** Group advance (part 3): his game of `date` already settled (live recording kept, or simulate). */
  matchDecision?: MatchDecision;
  /** Friends' league standings (part 5a): the open passage at the current club. */
  standing?: SeatStanding;
  /** The board's objective of the season the club has just closed, for the end-of-season report. */
  lastSeason?: SeatLastSeason;
  /**
   * The plan the manager started his last official club games with (`.claude/rules/game/study.md`): AI opponents
   * read it. Cleared on a change of club and on a sacking.
   */
  tacticLog?: import("@/types/studyTypes").TacticLogEntry[];
}

/** Every key of `SeatState` (the split of a merged patch, `splitSeatPatch`). */
export const SEAT_KEYS = [
  "clubId", "clubName", "clubColors", "leagueSlug", "leagueName", "manager", "formation", "tactical_style",
  "min_energy_to_train", "training_intensity", "style_focus", "followedLeagues", "restDays", "matchEve", "rotationOverride",
  "matchMarking", "youthCallUps", "youthCallUpsSkipped", "youthCoachPlanned", "board", "press", "managerBan", "sackingEnabled",
  "unemployed", "jobOffers", "jobsMidSeason", "jobSeeking", "jobApplication", "jobRefused", "careerStart", "managerContract", "managerEarnings", "managerSpent", "managerAssets", "managerDecor", "managerStudies", "trustedStaff", "betNet", "betExact", "betLongshot", "managerRenewal",
  "managerContractNotices", "inboxPrefs", "responsibilities", "directorDecisions",
  "readyUntil", "matchDecision", "standing", "lastSeason", "lastSeenAt", "inactiveWarnedAt", "retiredFavorites", "tacticLog",
] as const satisfies readonly (keyof SeatState)[];

type MissingSeatKeys = Exclude<keyof SeatState, (typeof SEAT_KEYS)[number]>;
/** Compile-time guard: a `SeatState` key missing from `SEAT_KEYS` turns this into a type error. */
export const SEAT_KEYS_COMPLETE: [MissingSeatKeys] extends [never] ? true : MissingSeatKeys = true;

/** A seat of a world: its id and its state (club, league, career). */
export interface SeatContext {
  seatId: string;
  seat: SeatState;
}

/** Role of a user in a world (`save_members.role`). */
export type MemberRole = "owner" | "member";

/** Seat ids become folder names: lower-case letters, digits and dashes only (a `randomUUID()` fits). */
export const SEAT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
