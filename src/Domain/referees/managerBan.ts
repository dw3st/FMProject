/**
 * The human manager's ban after a red card for complaining (`.claude/rules/game/var.md` §4). Pure.
 * One official match of the club (any competition) serves one match of the ban; a ban given in a match is never
 * served by that same match.
 */
import { banMatches } from "@/GameEngine/Domain/Var";
import type { ManagerCardRecord } from "@/Domain/advanceDay/matches";

export interface ManagerBan {
  /** Official matches still to serve. */
  matches: number;
  /** Day of the red card. */
  since: string;
}

export interface BanStep {
  ban: ManagerBan | undefined;
  /** Matches of a new ban given today (for the inbox), else null. */
  given: number | null;
}

/**
 * The ban after today: `before` loses a match when the club played an official match today, then a red card of
 * today's live match (`cards`) starts a new ban (1 match, 2 from the 3rd complaint).
 */
export function nextManagerBan(before: ManagerBan | undefined, playedToday: boolean, cards: readonly ManagerCardRecord[], date: string): BanStep {
  let ban = before;
  if (ban && playedToday) ban = ban.matches > 1 ? { ...ban, matches: ban.matches - 1 } : undefined;
  const red = cards.find((c) => c.card === "red");
  if (!red) return { ban, given: null };
  const matches = banMatches(red.complaint);
  return { ban: { matches: Math.max(matches, ban?.matches ?? 0), since: date }, given: matches };
}

/** Accepts only well-formed manager cards from a client recording (at most a yellow and a red). */
export function sanitizeManagerCards(raw: unknown): ManagerCardRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ManagerCardRecord[] = [];
  for (const c of raw.slice(0, 2)) {
    if (!c || typeof c !== "object") continue;
    const { card, minute, complaint } = c as Record<string, unknown>;
    if ((card !== "yellow" && card !== "red") || typeof minute !== "number" || typeof complaint !== "number") continue;
    if (!Number.isFinite(minute) || !Number.isInteger(complaint) || complaint < 1 || complaint > 50) continue;
    out.push({ card, minute: Math.max(0, Math.min(130, Math.round(minute))), complaint });
  }
  return out;
}
