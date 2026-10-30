/**
 * The task a news item asks for, as one button under its body (tester report: "Repair it in the Club screen" had no
 * way to get there). Pure: the href and the i18n key of the label (`inbox.actions.*`), or null.
 */
import type { InboxMessage } from "@/types/inboxTypes";

export interface InboxAction {
  href: string;
  label: "repair" | "rebuild" | "renew" | "contracts" | "staff" | "registration" | "lineup" | "youth" | "finances";
}

export function inboxAction(message: InboxMessage, club: { leagueSlug: string; clubId: string } | null): InboxAction | null {
  const squad = club ? `/squad/${encodeURIComponent(club.leagueSlug)}/${encodeURIComponent(club.clubId)}` : null;
  switch (message.category) {
    case "facilities":
      if (message.kind === "worn") return { href: "/club", label: "repair" };
      if (message.kind === "condemned") return { href: "/club", label: "rebuild" };
      return null;
    case "contract":
      if (message.kind === "staff_expiring") return { href: "/staff", label: "staff" };
      if (message.kind !== "expiring" || !club || !squad) return null;
      if (message.players.length === 1) {
        const p = message.players[0]!;
        return {
          href: `/player/${encodeURIComponent(club.leagueSlug)}/${encodeURIComponent(club.clubId)}/${encodeURIComponent(p.id)}?action=renew`,
          label: "renew",
        };
      }
      return message.players.length > 1 ? { href: squad, label: "contracts" } : null;
    case "registration":
      return squad ? { href: `${squad}?tab=registration`, label: "registration" } : null;
    case "injury":
      return message.kind === "returned" ? null : { href: "/formation", label: "lineup" };
    case "youth":
      return message.kind === "intake" && squad ? { href: `${squad}?tab=youth`, label: "youth" } : null;
    case "season":
      return message.kind === "negative_balance" ? { href: "/finances", label: "finances" } : null;
    default:
      return null;
  }
}
