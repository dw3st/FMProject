import type { DisciplineInboxMessage } from "@/types/inboxTypes";

/** The manager's touchline ban (`.claude/rules/game/var.md` §4). English fallback; the screen translates. */
export function buildManagerBanMessage(date: string, matches: number): DisciplineInboxMessage {
  return {
    id: `discipline-manager-ban-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "discipline",
    subject: "You have been sent to the stands",
    preview: `Banned from the touchline for ${matches} match${matches === 1 ? "" : "es"}`,
    kind: "manager_banned",
    matches,
  };
}
