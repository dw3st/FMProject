import { randomUUID } from "crypto";
import { saveService } from "@/backend/SaveService";
import type {
  DevelopmentInboxChange,
  DevelopmentInboxMessage,
  InboxMessage,
  TransferInInboxMessage,
  TransferOutInboxMessage,
} from "@/types/inboxTypes";

export async function emitInboxMessage(
  saveId: string,
  message: InboxMessage,
): Promise<void> {
  await saveService.appendInbox(saveId, message);
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

function formatFee(euros: number): string {
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`;
  if (euros >= 1_000)     return `€${Math.round(euros / 1_000)}k`;
  return `€${euros}`;
}
