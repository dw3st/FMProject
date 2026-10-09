import type { RegistrationInboxMessage } from "@/types/inboxTypes";
import type { RegistrationNotice } from "@/types/registrationTypes";

/**
 * Inbox message of a registration notice (`.claude/rules/game/registration.md`). Subject and preview are the English
 * fallback; the screen translates by kind. The id is stable per club list + kind (+ day for the per-arrival kinds),
 * so a day replayed after a failed flush does not duplicate it.
 */
export function buildRegistrationMessage(args: {
  date: string;
  notice: RegistrationNotice;
  competitionName: string;
  players?: { id: string; name: string }[];
}): RegistrationInboxMessage {
  const { date, notice, competitionName, players } = args;
  const names = (players ?? []).map((p) => p.name).join(", ");
  const subject =
    notice.kind === "auto_list" ? `${competitionName}: squad list registered`
    : notice.kind === "not_fit" ? `${competitionName}: no room on the squad list`
    : notice.kind === "waiting" ? `${competitionName}: registration closed`
    : notice.kind === "closing" ? `${competitionName}: registration closes on ${notice.until}`
    : `${competitionName}: squad list completed to 18 players`;
  const preview =
    notice.kind === "not_fit" ? names
    : notice.kind === "waiting" ? `${names}${notice.opensOn ? ` — from ${notice.opensOn}` : ""}`
    : notice.kind === "closing" && notice.counts ? `${notice.counts.counted}${notice.counts.max != null ? `/${notice.counts.max}` : ""} registered`
    : "";
  const perDay = notice.kind === "not_fit" || notice.kind === "waiting" || notice.kind === "closing";
  return {
    id: `registration-${notice.competition}-${notice.season}-${notice.kind}${perDay ? `-${date}` : ""}`,
    date,
    createdAt: date,
    read: false,
    category: "registration",
    subject,
    preview: preview.slice(0, 120),
    kind: notice.kind,
    competition: notice.competition,
    competitionName,
    season: notice.season,
    ...(players && players.length > 0 ? { players } : {}),
    ...(notice.opensOn ? { opensOn: notice.opensOn } : {}),
    ...(notice.until ? { until: notice.until } : {}),
    ...(notice.counts ? { counts: notice.counts } : {}),
  };
}
