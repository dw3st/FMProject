import type { InboxCategory } from "@/types/inboxTypes";

/** Reader-facing grouping of the inbox categories (#87). */
export type InboxTheme =
  | "health"
  | "growth"
  | "transfers"
  | "contracts"
  | "club"
  | "competitions"
  | "jobs";

/** Display order of the theme filter (after "all"). */
export const INBOX_THEMES: readonly InboxTheme[] = [
  "health", "growth", "transfers", "contracts", "club", "competitions", "jobs",
];

/** Exhaustive on purpose: a new `InboxCategory` does not compile until it gets a theme. */
const THEME_OF: Record<InboxCategory, InboxTheme> = {
  injury: "health",
  development: "growth",
  youth: "growth",
  transfer: "transfers",
  transfer_in: "transfers",
  transfer_out: "transfers",
  scouting: "transfers",
  contract: "contracts",
  board: "club",
  facilities: "club",
  retirement: "club",
  player: "club",
  club_record: "club",
  season: "competitions",
  cup: "competitions",
  continental: "competitions",
  awards: "competitions",
  registration: "competitions",
  schedule: "competitions",
  job: "jobs",
  manager_news: "jobs",
};

export function inboxThemeOf(category: InboxCategory): InboxTheme {
  return THEME_OF[category];
}

/** Unread count per theme, only for themes that have at least one message (read or not). */
export function themeCounts(messages: readonly { category: InboxCategory; read: boolean }[]): Map<InboxTheme, { total: number; unread: number }> {
  const out = new Map<InboxTheme, { total: number; unread: number }>();
  for (const m of messages) {
    const theme = THEME_OF[m.category];
    const c = out.get(theme) ?? { total: 0, unread: 0 };
    c.total += 1;
    if (!m.read) c.unread += 1;
    out.set(theme, c);
  }
  return out;
}
