import type { LiveRefusedReason, WorldAdvanceInboxMessage, WorldInactiveInboxMessage, WorldLiveRefusedInboxMessage } from "@/types/inboxTypes";

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

/** The day's refusal text (`advanceOneDay`, 400) as a reason the screen translates. */
export function liveRefusedReason(error: string): LiveRefusedReason {
  if (error.includes("unregistered")) return "unregistered";
  if (error.includes("knockout")) return "knockout";
  if (error.includes("two seats")) return "two_seats";
  return "other";
}

/** Inbox `world` / `live_refused` (the screen translates `world.advance.refused.*`; the subject is the fallback). */
export function buildLiveRefusedMessage(a: { date: string; reason: LiveRefusedReason }): WorldLiveRefusedInboxMessage {
  return {
    id: `world-live-refused-${a.date}`,
    date: a.date,
    createdAt: a.date,
    read: false,
    category: "world",
    kind: "live_refused",
    subject: "Your live match was simulated",
    preview: a.reason,
    match: a.date,
    reason: a.reason,
  };
}

/** Inbox `world` / `inactive_warning` (public world, part 5b; the screen translates `world.inbox.inactive_warning.*`). */
export function buildInactiveWarningMessage(a: { date: string; removeOn: string }): WorldInactiveInboxMessage {
  return {
    id: `world-inactive-${a.date}-${a.removeOn}`,
    date: a.date,
    createdAt: a.date,
    read: false,
    category: "world",
    kind: "inactive_warning",
    subject: "You have not opened the public world for 5 days",
    preview: `Removed on ${a.removeOn}`,
    removeOn: a.removeOn,
  };
}
