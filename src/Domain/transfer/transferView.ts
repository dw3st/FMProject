import type { StoredTransferRecord, TransferRecord } from "@/types/transferTypes";

/** The record as the asking seat sees it: "in" when its club bought, "out" when it sold ("in" for AI × AI). */
export function withDirection(r: StoredTransferRecord, clubId: string): TransferRecord {
  return { ...r, direction: r.fromSquadId === clubId && r.toSquadId !== clubId ? "out" : "in" };
}

/** The records of the season that started on `seasonStart` (the seat's league). */
export function seasonTransfers<T extends { date: string }>(log: T[], seasonStart: string): T[] {
  return log.filter((r) => r.date >= seasonStart);
}

/** At a rollover: drop what no running season still covers (older than the earliest season start). */
export function pruneTransferLog<T extends { date: string }>(log: T[], seasonStarts: string[]): T[] {
  if (seasonStarts.length === 0) return log;
  const earliest = [...seasonStarts].sort()[0]!;
  return log.filter((r) => r.date >= earliest);
}
