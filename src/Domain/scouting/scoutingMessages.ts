import { randomUUID } from "crypto";
import type { ScoutingInboxMessage } from "@/types/inboxTypes";
import type { ScoutTarget } from "@/types/scoutingTypes";
import type { ScoutingNews } from "@/Domain/scouting/missions";

/** Builds a `scouting` inbox message. Subject/preview are English fallbacks; the screen translates (`inbox.scouting.*`). */
export type ScoutingMessageArgs = Omit<ScoutingInboxMessage, "id" | "createdAt" | "read" | "category" | "subject" | "preview">;

function targetText(t: ScoutTarget | undefined): string {
  if (!t) return "";
  return t.playerName ?? t.country ?? t.league ?? t.continent ?? "";
}

export function buildScoutingMessage(args: ScoutingMessageArgs): ScoutingInboxMessage {
  const who = args.playerName ?? "";
  const subject =
    args.kind === "report" ? `Scouting report: ${targetText(args.target)}`
    : args.kind === "mission_done" ? `Scouting mission finished: ${targetText(args.target)}`
    : args.kind === "gem" ? `Gem found: ${who}`
    : args.kind === "recommendation" ? "Chief scout's recommendations"
    : args.kind === "shortlist" ? `Shortlist: ${who}`
    : args.kind === "prospect" ? `Prospect available: ${who}`
    : `Prospect signed: ${who}`;
  const preview =
    args.kind === "report" || args.kind === "recommendation"
      ? (args.players ?? []).map((p) => `${p.name} (${p.grade})`).join(", ")
      : args.kind === "mission_done" ? `${args.count ?? 0} players observed`
      : args.kind === "shortlist" ? (args.reason ?? "")
      : who;
  return {
    id: `scouting-${args.date}-${args.kind}-${randomUUID()}`,
    createdAt: args.date,
    read: false,
    category: "scouting",
    subject,
    preview,
    ...args,
  };
}

/** The inbox message of one week's news (`advanceScoutingWeek` / `addProspects`). */
export function newsToMessageArgs(date: string, n: ScoutingNews): ScoutingMessageArgs {
  switch (n.kind) {
    case "report":
      return { date, kind: "report", target: n.target, count: n.count, players: n.best.map((b) => ({ playerId: "", name: b.name, grade: b.grade })) };
    case "mission_done":
      return { date, kind: "mission_done", target: n.target, count: n.observed };
    case "gem":
      return { date, kind: "gem", playerId: n.report.playerId, playerName: n.report.name, clubName: n.report.club, grade: n.report.grade, reportId: n.report.id };
    case "prospect":
      return { date, kind: "prospect", playerId: n.report.playerId, playerName: n.report.name, grade: n.report.grade, reportId: n.report.id, fee: n.fee, expires: n.expires, clubName: n.report.country };
  }
}
