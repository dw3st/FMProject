import type { WorldAdvanceInboxMessage } from "@/types/inboxTypes";

/** Inbox `world` / `auto_advanced` (the screen translates `world.advance.inbox.*`; the subject is the fallback). */
export function buildAutoAdvancedMessage(a: { date: string; until: string; simulated: string | null }): WorldAdvanceInboxMessage {
  return {
    id: `world-auto-${a.date}-${a.until}`,
    date: a.date,
    createdAt: a.date,
    read: false,
    category: "world",
    kind: "auto_advanced",
    subject: "The assistant advanced for you",
    preview: `Ready until ${a.until}`,
    until: a.until,
    simulated: a.simulated,
  };
}
