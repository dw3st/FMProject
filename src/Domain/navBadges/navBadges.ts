/**
 * Counts on the menu tabs (report 2026-11-16): problems (stay until solved) and news (gone once the tab is opened).
 * Pure: the route gathers the inputs, the client hides the news already seen.
 */
import type { Squad } from "@/types/playerTypes";
import type { FacilityItem } from "@/types/facilityTypes";
import type { StaffRole } from "@/types/staffTypes";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended, isUnavailable } from "@/Domain/discipline/discipline";
import { isExpired } from "@/Domain/contracts/contracts";
import { CONTRACT_CONFIG } from "@/Domain/contracts/contractConfig";
import { moraleAttention } from "@/Domain/morale/morale";
import { addDays, daysBetween } from "@/Domain/dates";
import { conditionOf } from "@/Domain/facilities/facilityItems";

export const NAV_BADGES = {
  /** A facility item below this condition (%) lights the club tab. */
  FACILITY_BELOW: 50,
  /** A staff contract ending within this many days. */
  STAFF_CONTRACT_DAYS: 60,
  /** The transfer window closing within this many days. */
  WINDOW_DAYS: 7,
  /** Scouting news of the last this many days. */
  SCOUT_NEWS_DAYS: 7,
} as const;

/** The staff roles whose empty seat is a problem (field scouts, groundsmen and the youth coach are optional). */
const CORE_STAFF: readonly StaffRole[] = ["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout"];

export type BadgeTab = "/squad" | "/formation" | "/club" | "/finances" | "/staff" | "/transfers" | "/scout";
export interface TabBadge {
  /** Problems: shown until they are solved. */
  alerts: number;
  /** News: stable ids, hidden by the client once the tab was opened. */
  news: string[];
}
export type NavBadges = Partial<Record<BadgeTab, TabBadge>>;

export interface NavBadgeInput {
  date: string;
  squad: Squad;
  /** Last day of the club's league season (contracts ending); null when unknown. */
  seasonEnd: string | null;
  /** The saved XI (slot order) and the number of slots of the saved formation. */
  lineup: string[];
  slots: number;
  /** Players registered for today's match; null when there is no match today. */
  registeredToday: Set<string> | null;
  /** The club's transfer window today. */
  window: { open: boolean; until?: string } | null;
  /** Ids of the offers for the club's players waiting for an answer (AI bids, offers between managers on his turn). */
  offers: string[];
  /** Scouting inbox messages (gems and shortlist alerts). */
  scoutNews: { id: string; date: string }[];
  /** Club-less youngsters still on offer. */
  prospects: string[];
}

const put = (out: NavBadges, tab: BadgeTab, alerts: number, news: string[] = []) => {
  if (alerts > 0 || news.length > 0) out[tab] = { alerts, news };
};

export function navBadges(input: NavBadgeInput): NavBadges {
  const { date, squad } = input;
  const players = squad.players;
  const out: NavBadges = {};

  // Squad: injured, suspended, contracts ending, talks asked, promises close to their deadline.
  const morale = squad.moraleClub ? moraleAttention(squad, date) : { talks: [], promisesDue: [] };
  const squadAlerts =
    players.filter((p) => p.injury && isInjured(p, date)).length
    + players.filter((p) => isSuspended(p)).length
    + (input.seasonEnd ? players.filter((p) => !p.loan && isExpired(p.contract, input.seasonEnd!, CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS)).length : 0)
    + morale.talks.length + morale.promisesDue.length;
  put(out, "/squad", squadAlerts);

  // Formation: a starter who cannot play (injured, suspended, away with his country, not registered today, gone) or an
  // empty slot.
  const byId = new Map(players.map((p) => [p.id, p]));
  let formation = 0;
  for (let i = 0; i < input.slots; i++) {
    const id = input.lineup[i] ?? "";
    const p = id ? byId.get(id) : undefined;
    if (!p || isUnavailable(p, date) || (input.registeredToday && !input.registeredToday.has(p.id))) formation++;
  }
  put(out, "/formation", formation);

  // Club: facility items below 50% or condemned.
  const items = Object.values(squad.facilities?.items ?? {}) as FacilityItem[];
  put(out, "/club", items.filter((it) => it.condemned || conditionOf(it) < NAV_BADGES.FACILITY_BELOW).length);

  // Finances: a negative balance, sponsor offers waiting.
  const sponsorOffers = (squad.sponsors?.offers ?? []).filter((o) => o.expires >= date).length;
  put(out, "/finances", ((squad.finances?.budget ?? 0) < 0 ? 1 : 0) + sponsorOffers);

  // Staff: contracts ending soon, an empty core role.
  const members = squad.staff?.members ?? [];
  const limit = addDays(date, NAV_BADGES.STAFF_CONTRACT_DAYS);
  const ending = members.filter((m) => m.contract && m.contract.until >= date && m.contract.until <= limit).length;
  const vacant = squad.staff ? CORE_STAFF.filter((r) => !members.some((m) => m.role === r)).length : 0;
  put(out, "/staff", ending + vacant);

  // Market: the window closing soon (problem), offers for his players (news).
  const closing = input.window?.open && input.window.until && daysBetween(date, input.window.until) <= NAV_BADGES.WINDOW_DAYS ? 1 : 0;
  put(out, "/transfers", closing, input.offers.map((id) => `offer:${id}`));

  // Scouting: gems and shortlist alerts of the last week, youngsters on offer (news).
  const since = addDays(date, -NAV_BADGES.SCOUT_NEWS_DAYS);
  put(out, "/scout", 0, [
    ...input.scoutNews.filter((m) => m.date >= since).map((m) => `msg:${m.id}`),
    ...input.prospects.map((id) => `prospect:${id}`),
  ]);
  return out;
}

/** The number on a tab: its problems plus the news not seen yet. */
export function badgeCount(badge: TabBadge | undefined, seen: ReadonlySet<string>): number {
  if (!badge) return 0;
  return badge.alerts + badge.news.filter((id) => !seen.has(id)).length;
}
