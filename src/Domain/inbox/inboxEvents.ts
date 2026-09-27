import { randomUUID } from "crypto";
import { saveService, type SaveService } from "@/backend/SaveService";
import type { ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";
import type {
  ContinentalInboxMessage,
  CupInboxMessage,
  DevelopmentInboxChange,
  DevelopmentInboxMessage,
  InboxMessage,
  SeasonInboxMessage,
  TransferInInboxMessage,
  TransferOutInboxMessage,
} from "@/types/inboxTypes";

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
  const feeText = formatFee(feeEuros);
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
  const feeText = formatFee(feeEuros);
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
}): SeasonInboxMessage {
  const { date, kind, leagueSlug, leagueName, fromLeagueSlug, seasonYear, followersBefore, followersAfter } = args;
  const fb = followersBefore ?? 0;
  const fa = followersAfter ?? 0;
  const pct = fb > 0 ? Math.round(((fa - fb) / fb) * 100) : 0;
  const subject =
    kind === "champion" ? `Champion of ${leagueName}` :
    kind === "promoted" ? `Promoted to ${leagueName}` :
    kind === "followers" ? (fa >= fb ? "Fan base grew" : "Fan base shrank") :
    `Relegated to ${leagueName}`;
  const preview =
    kind === "champion" ? `The club won the ${leagueName} ${seasonYear} title.` :
    kind === "promoted" ? `Next season the club plays in ${leagueName}.` :
    kind === "followers" ? `After the ${seasonYear} season the club has ${formatCount(fa)} followers (${pct >= 0 ? "+" : ""}${pct}%).` :
    `Next season the club drops to ${leagueName}.`;
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
  };
}

/**
 * National-cup news for the human club: a draw for the next tie, elimination, or the title.
 * `date` is the message date (day the news is posted); the tie's own date is `tieDate`.
 */
export function buildCupMessage(args: {
  date: string; kind: CupInboxMessage["kind"]; cupSlug: string; cupName: string; stage: string;
  opponentName?: string; tieDate?: string; venue?: CupInboxMessage["venue"];
}): CupInboxMessage {
  const { date, kind, cupSlug, cupName, stage, opponentName, tieDate, venue } = args;
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
}): ContinentalInboxMessage {
  const { date, kind, competition, competitionName, stage, group, opponentName, opponentNames, firstLegDate, venue } = args;
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
  } as ContinentalInboxMessage;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

function formatFee(euros: number): string {
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`;
  if (euros >= 1_000)     return `€${Math.round(euros / 1_000)}k`;
  return `€${euros}`;
}
