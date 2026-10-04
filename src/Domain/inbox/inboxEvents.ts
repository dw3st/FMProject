import { randomUUID } from "crypto";
import { saveService, type SaveService } from "@/backend/SaveService";
import type { ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";
import type { RetiredPlayer } from "@/types/playerTypes";
import type {
  BoardInboxMessage,
  ContinentalInboxMessage,
  CupInboxMessage,
  DevelopmentInboxChange,
  DevelopmentInboxMessage,
  InboxMessage,
  InjuryInboxMessage,
  ContractInboxMessage,
  SeasonInboxMessage,
  TransferInInboxMessage,
  TransferOutInboxMessage,
  YouthInboxMessage,
  RetirementInboxMessage,
} from "@/types/inboxTypes";
import { formatEurosText } from "@/Domain/money";

/**
 * Append a message to the save's inbox. Pass the unit of work's service (e.g. the
 * buffered day service in advanceOneDay) so the message is persisted — or not —
 * together with the rest of that unit of work.
 */
export async function emitInboxMessage(
  saveId: string,
  message: InboxMessage,
  service: SaveService = saveService,
): Promise<void> {
  await service.appendInbox(saveId, message);
}

export function buildDevelopmentMessage(args: {
  date:       string;
  playerId:   string;
  playerName: string;
  changes:    DevelopmentInboxChange[];
}): DevelopmentInboxMessage {
  const { date, playerId, playerName, changes } = args;
  const upCount   = changes.filter((c) => c.to > c.from).length;
  const downCount = changes.filter((c) => c.to < c.from).length;

  let subject: string;
  if (upCount > 0 && downCount === 0) {
    subject = `${playerName} leveled up`;
  } else if (downCount > 0 && upCount === 0) {
    subject = `${playerName} regressed`;
  } else {
    subject = `${playerName} development update`;
  }

  const preview = changes
    .map((c) => `${c.attribute} ${c.from}→${c.to}`)
    .join(", ")
    .slice(0, 120);

  return {
    id:         `development-${date}-${playerId}-${randomUUID()}`,
    date,
    createdAt:  date,
    read:       false,
    category:   "development",
    subject,
    preview,
    playerId,
    playerName,
    changes,
  };
}

export function buildTransferInMessage(args: {
  date:       string;
  transferId: string;
  playerId:   string;
  playerName: string;
  fromClub:   string;
  feeEuros:   number;
}): TransferInInboxMessage {
  const { date, transferId, playerId, playerName, fromClub, feeEuros } = args;
  const feeText = formatEurosText(feeEuros);
  return {
    id:         `transfer_in-${date}-${playerId}-${randomUUID()}`,
    date,
    createdAt:  date,
    read:       false,
    category:   "transfer_in",
    subject:    `Signed ${playerName}`,
    preview:    `From ${fromClub} for ${feeText}`.slice(0, 120),
    transferId,
    playerId,
    playerName,
    fromClub,
    feeEuros,
  };
}

export function buildTransferOutMessage(args: {
  date:       string;
  transferId: string;
  playerId:   string;
  playerName: string;
  toClub:     string;
  feeEuros:   number;
}): TransferOutInboxMessage {
  const { date, transferId, playerId, playerName, toClub, feeEuros } = args;
  const feeText = formatEurosText(feeEuros);
  return {
    id:         `transfer_out-${date}-${playerId}-${randomUUID()}`,
    date,
    createdAt:  date,
    read:       false,
    category:   "transfer_out",
    subject:    `Sold ${playerName}`,
    preview:    `To ${toClub} for ${feeText}`.slice(0, 120),
    transferId,
    playerId,
    playerName,
    toClub,
    feeEuros,
  };
}

/**
 * Season news for the human club. `promoted`/`relegated` name the NEW league (and carry the one
 * left); `champion` names the league just won.
 */
export function buildSeasonMessage(args: {
  date:            string;
  kind:            SeasonInboxMessage["kind"];
  leagueSlug:      string;
  leagueName:      string;
  fromLeagueSlug?: string;
  seasonYear:      number;
  followersBefore?: number;
  followersAfter?:  number;
  /** Club budget on the day it crossed negative (kind "negative_balance" only). */
  balance?: number;
  /** League prize paid at this rollover (kind "league_prize" only), euros. */
  prize?: number;
}): SeasonInboxMessage {
  const { date, kind, leagueSlug, leagueName, fromLeagueSlug, seasonYear, followersBefore, followersAfter, balance, prize } = args;
  const fb = followersBefore ?? 0;
  const fa = followersAfter ?? 0;
  const pct = fb > 0 ? Math.round(((fa - fb) / fb) * 100) : 0;
  const bal = balance ?? 0;
  const prizeAmount = prize ?? 0;
  const subject =
    kind === "champion" ? `Champion of ${leagueName}` :
    kind === "promoted" ? `Promoted to ${leagueName}` :
    kind === "relegated" ? `Relegated to ${leagueName}` :
    kind === "followers" ? (fa >= fb ? "Fan base grew" : "Fan base shrank") :
    kind === "negative_balance" ? "Club is in the red" :
    `League prize: ${leagueName}`;
  const preview =
    kind === "champion" ? `The club won the ${leagueName} ${seasonYear} title.` :
    kind === "promoted" ? `Next season the club plays in ${leagueName}.` :
    kind === "relegated" ? `Next season the club drops to ${leagueName}.` :
    kind === "followers" ? `After the ${seasonYear} season the club has ${formatCount(fa)} followers (${pct >= 0 ? "+" : ""}${pct}%).` :
    kind === "negative_balance" ? `The club balance has gone negative: ${formatEurosText(bal)}.` :
    `The club earned ${formatEurosText(prizeAmount)} in prize money for its ${seasonYear} finish in ${leagueName}.`;
  return {
    id:        `season-${date}-${kind}-${leagueSlug}-${randomUUID()}`,
    date,
    createdAt: date,
    read:      false,
    category:  "season",
    subject,
    preview:   preview.slice(0, 120),
    kind,
    leagueSlug,
    leagueName,
    ...(fromLeagueSlug ? { fromLeagueSlug } : {}),
    seasonYear,
    ...(kind === "followers" ? { followersBefore: fb, followersAfter: fa } : {}),
    ...(kind === "negative_balance" ? { balance: bal } : {}),
    ...(prize ? { prize } : {}),
  };
}

/**
 * National-cup news for the human club: a draw for the next tie, elimination, or the title.
 * `date` is the message date (day the news is posted); the tie's own date is `tieDate`.
 */
export function buildCupMessage(args: {
  date: string; kind: CupInboxMessage["kind"]; cupSlug: string; cupName: string; stage: string;
  opponentName?: string; tieDate?: string; venue?: CupInboxMessage["venue"];
  /** Prize paid THIS DAY for this event (champion, or the runner-up prize on a final loss), euros. */
  prize?: number;
}): CupInboxMessage {
  const { date, kind, cupSlug, cupName, stage, opponentName, tieDate, venue, prize } = args;
  const subject =
    kind === "draw" ? `${cupName} draw` :
    kind === "eliminated" ? `Out of the ${cupName}` :
    `${cupName} winners!`;
  const preview =
    kind === "draw" ? `Next: ${opponentName ?? "?"} (${venue ?? "?"}) on ${tieDate ?? "?"}.` :
    kind === "eliminated" ? `Knocked out by ${opponentName ?? "?"}.` :
    `The club won the ${cupName}.`;
  return {
    id: `cup-${date}-${kind}-${cupSlug}-${randomUUID()}`,
    date, createdAt: date, read: false, category: "cup",
    subject, preview: preview.slice(0, 120),
    kind, cupSlug, cupName, stage,
    ...(opponentName ? { opponentName } : {}),
    ...(tieDate ? { tieDate } : {}),
    ...(venue ? { venue } : {}),
    ...(prize ? { prize } : {}),
  } as CupInboxMessage;
}

/**
 * Continental-competition (UCL/UEL/Lib/Sud) news for the human club: qualification + group draw at
 * season start, a knockout-stage draw, elimination, or the title. Mirrors `buildCupMessage`.
 * `opponentNames` (group only) builds the preview text but is also kept on the returned message so
 * the inbox UI can render a localized list — see `ContinentalInboxMessage`.
 */
export function buildContinentalMessage(args: {
  date: string; kind: ContinentalInboxMessage["kind"]; competition: ContinentalSlug; competitionName: string;
  stage: ContinentalStageName; group?: string; opponentName?: string; opponentNames?: string[];
  firstLegDate?: string; venue?: ContinentalInboxMessage["venue"];
  /**
   * Prize paid THIS DAY for this event: champion (title), or reaching the round of 16 (the
   * "draw" message for stage "r16"). Never pass one for "eliminated" — continental has no
   * runner-up/elimination payout, unlike `buildCupMessage`'s final-loss `cupRunnerUpPrize`.
   */
  prize?: number;
}): ContinentalInboxMessage {
  const { date, kind, competition, competitionName, stage, group, opponentName, opponentNames, firstLegDate, venue, prize } = args;
  const subject =
    kind === "qualified"  ? `Qualified for the ${competitionName}` :
    kind === "group"      ? `${competitionName} group draw` :
    kind === "draw"       ? `${competitionName} draw` :
    kind === "eliminated" ? `Out of the ${competitionName}` :
    `${competitionName} champions!`;
  const preview =
    kind === "qualified"  ? `The club qualified for the ${competitionName}.` :
    kind === "group"      ? `Group ${group ?? "?"}: ${opponentNames && opponentNames.length > 0 ? opponentNames.join(", ") : "?"}.` :
    kind === "draw"       ? `Next: ${opponentName ?? "?"} (${venue ?? "?"}) on ${firstLegDate ?? "?"}.` :
    kind === "eliminated" ? (opponentName ? `Knocked out by ${opponentName}.` : `Eliminated from the ${competitionName} group stage.`) :
    `The club won the ${competitionName}.`;
  return {
    id: `continental-${date}-${kind}-${competition}-${randomUUID()}`,
    date, createdAt: date, read: false, category: "continental",
    subject, preview: preview.slice(0, 120),
    kind, competition, competitionName, stage,
    ...(group ? { group } : {}),
    ...(opponentNames && opponentNames.length > 0 ? { opponentNames } : {}),
    ...(opponentName ? { opponentName } : {}),
    ...(firstLegDate ? { firstLegDate } : {}),
    ...(venue ? { venue } : {}),
    ...(prize ? { prize } : {}),
  } as ContinentalInboxMessage;
}

/**
 * Injury news for the human club (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1):
 * fired both when a player gets injured (match or heavy training) and when they return.
 */
export function buildInjuryMessage(args: {
  date:        string;
  kind:        InjuryInboxMessage["kind"];
  playerId:    string;
  playerName:  string;
  severity?:   "light" | "medium" | "severe";
  returnDate?: string;
  matches?:    number;
}): InjuryInboxMessage {
  const { date, kind, playerId, playerName, severity, returnDate: retDate, matches } = args;
  const subject = kind === "injured" ? `${playerName} injured`
    : kind === "suspended" ? `${playerName} suspended` : `${playerName} is back`;
  const preview =
    kind === "injured"
      ? `${severity ?? "light"} injury — expected back ${retDate ?? "?"}.`
      : kind === "suspended"
        ? `Suspended for the next ${matches ?? 1} match(es).`
        : `${playerName} has recovered and is available again.`;
  return {
    id:        `injury-${date}-${kind}-${playerId}-${randomUUID()}`,
    date,
    createdAt: date,
    read:      false,
    category:  "injury",
    subject,
    preview:   preview.slice(0, 120),
    kind,
    playerId,
    playerName,
    ...(kind === "injured" ? { severity, returnDate: retDate } : {}),
    ...(kind === "suspended" ? { matches: matches ?? 1 } : {}),
  } as InjuryInboxMessage;
}

/** Contract news for the human club: expiring soon, renewed, or released at the rollover. */
export function buildContractMessage(args: {
  date:    string;
  kind:    ContractInboxMessage["kind"];
  players: { id: string; name: string }[];
  until?:  string;
}): ContractInboxMessage {
  const { date, kind, players, until } = args;
  const names = players.map((p) => p.name).join(", ");
  const subject = kind === "expiring" ? "Contracts ending soon"
    : kind === "renewed" ? "Contract renewed" : "Players left on a free transfer";
  return {
    id:        `contract-${date}-${kind}-${players.map((p) => p.id).join("_")}-${randomUUID()}`,
    date,
    createdAt: date,
    read:      false,
    category:  "contract",
    subject,
    preview:   names.slice(0, 120),
    kind,
    players,
    ...(until ? { until } : {}),
  };
}

/** Academy news for the human club: the new intake, or players released at the age limit. */
export function buildYouthMessage(args: {
  date:     string;
  kind:     YouthInboxMessage["kind"];
  year?:    number;
  count?:   number;
  best?:    YouthInboxMessage["best"];
  players?: { id: string; name: string }[];
}): YouthInboxMessage {
  const { date, kind, year, count, best, players } = args;
  const subject = kind === "intake" ? `Academy intake ${year}: ${count} youngsters` : "Academy players released";
  const preview = kind === "intake" ? (best ? `Standout: ${best.name}` : "") : (players ?? []).map((p) => p.name).join(", ");
  return {
    id:        `youth-${date}-${kind}-${randomUUID()}`,
    date,
    createdAt: date,
    read:      false,
    category:  "youth",
    subject,
    preview:   preview.slice(0, 120),
    kind,
    ...(kind === "intake" ? { year, count, best } : { players }),
  };
}

/** Retirement news for the human club; `reborn` is the world-class retiree offering a second life. */
export function buildRetirementMessage(args: {
  date: string;
  kind: RetirementInboxMessage["kind"];
  retired: RetiredPlayer;
}): RetirementInboxMessage {
  const { date, kind, retired } = args;
  return {
    id:          `retirement-${date}-${kind}-${retired.id}`,
    date,
    createdAt:   date,
    read:        false,
    category:    "retirement",
    subject:     kind === "reborn" ? `${retired.name} retires, a legend` : `${retired.name} retires`,
    preview:     `${retired.name} (${retired.age}) hung up his boots`,
    kind,
    retiredId:   retired.id,
    playerName:  retired.name,
    position:    retired.positions[0] ?? "",
    age:         retired.age,
    appearances: retired.appearances,
    goals:       retired.goals,
  };
}

const BOARD_SUBJECT: Record<BoardInboxMessage["kind"], string> = {
  objective:     "The board sets the season objective",
  warning:       "The board is unhappy",
  ultimatum:     "Board ultimatum",
  ultimatum_met: "The board is satisfied with the response",
  praise:        "The board praises your work",
  bonus:         "Board bonus for the season",
  sacked:        "You have been sacked",
};

/** Board news for the human club (`.claude/rules/game/board-fans.md`); the screen translates it. */
export function buildBoardMessage(args: {
  date: string;
  kind: BoardInboxMessage["kind"];
  objective?: BoardInboxMessage["objective"];
  leagueName?: string;
  board?: number;
  ultimatum?: BoardInboxMessage["ultimatum"];
  bonus?: number;
  reason?: BoardInboxMessage["reason"];
}): BoardInboxMessage {
  const { date, kind, ...rest } = args;
  const preview =
    kind === "ultimatum" && rest.ultimatum
      ? `${rest.ultimatum.points} points in the next ${rest.ultimatum.matches} league games`
      : kind === "bonus" && rest.bonus !== undefined
        ? formatEurosText(rest.bonus)
        : kind === "objective" && rest.objective
          ? `${rest.leagueName ?? rest.objective.leagueSlug}: finish ${rest.objective.target} or better`
          : "";
  return {
    id:        `board-${date}-${kind}-${randomUUID()}`,
    date,
    createdAt: date,
    read:      false,
    category:  "board",
    subject:   BOARD_SUBJECT[kind],
    preview,
    kind,
    ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  };
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}
