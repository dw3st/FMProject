import { randomUUID } from "crypto";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import type { ClubRecordInboxMessage } from "@/types/inboxTypes";
import { formatEurosText } from "@/Domain/money";

const LABEL: Record<ClubRecordBroken["kind"], string> = {
  biggestWin: "biggest win",
  biggestLoss: "heaviest defeat",
  mostGoalsSeason: "most goals in a season",
  recordSigning: "record signing",
  recordSale: "record sale",
  highestFinish: "highest league finish",
  unbeaten: "longest unbeaten run",
};

/** English fallback of a broken record's new value (the inbox screen translates it). */
function recordDetail(r: ClubRecordBroken): string {
  switch (r.kind) {
    case "biggestWin":
    case "biggestLoss":
      return `${r.value.gf}–${r.value.ga} vs ${r.value.opponentName}`;
    case "mostGoalsSeason":
      return `${r.value.name}, ${r.value.goals} goals (${r.value.season})`;
    case "recordSigning":
    case "recordSale":
      return `${r.value.name}, ${formatEurosText(r.value.fee)}`;
    case "highestFinish":
      return `${r.value.position}º (${r.value.season})`;
    case "unbeaten":
      return `${r.value.matches} league games (${r.value.season})`;
  }
}

/** Inbox news: a record of the human club fell. */
export function buildClubRecordMessage(date: string, record: ClubRecordBroken): ClubRecordInboxMessage {
  return {
    id: `club-record-${date}-${record.kind}-${randomUUID()}`,
    date,
    createdAt: date,
    read: false,
    category: "club_record",
    subject: `New club record: ${LABEL[record.kind]}`,
    preview: recordDetail(record).slice(0, 120),
    record,
  };
}
