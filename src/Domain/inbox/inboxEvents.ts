import { randomUUID } from "crypto";
import { saveService, type SaveService } from "@/backend/SaveService";
import type {
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
}): SeasonInboxMessage {
  const { date, kind, leagueSlug, leagueName, fromLeagueSlug, seasonYear } = args;
  const subject =
    kind === "champion" ? `Champion of ${leagueName}` :
    kind === "promoted" ? `Promoted to ${leagueName}` :
    `Relegated to ${leagueName}`;
  const preview =
    kind === "champion" ? `The club won the ${leagueName} ${seasonYear} title.` :
    kind === "promoted" ? `Next season the club plays in ${leagueName}.` :
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
  };
}

function formatFee(euros: number): string {
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`;
  if (euros >= 1_000)     return `€${Math.round(euros / 1_000)}k`;
  return `€${euros}`;
}
