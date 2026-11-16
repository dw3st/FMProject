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
/** Why a tab is lit (report 2026-11-16: a bare number did not say what to look for). `names`: players, items, staff. */
export interface BadgeReason {
  kind: string;
  count: number;
  names?: string[];
}
export interface TabBadge {
  /** Problems: shown until they are solved. */
  alerts: number;
  /** The problems, by kind. */
  why: BadgeReason[];
  /** News: stable ids (`<kind>:<id>`), hidden by the client once the tab was opened. */
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

const named = (kind: string, names: string[]): BadgeReason => ({ kind, count: names.length, names });
const counted = (kind: string, count: number): BadgeReason => ({ kind, count });

const put = (out: NavBadges, tab: BadgeTab, reasons: BadgeReason[], news: string[] = []) => {
  const why = reasons.filter((r) => r.count > 0);
  const alerts = why.reduce((n, r) => n + r.count, 0);
  if (alerts > 0 || news.length > 0) out[tab] = { alerts, why, news };
};

export function navBadges(input: NavBadgeInput): NavBadges {
  const { date, squad } = input;
  const players = squad.players;
  const out: NavBadges = {};
  const nameOf = (p: { name: string }) => p.name;

  // Squad: injured, suspended, contracts ending, talks asked, promises close to their deadline.
  const morale = squad.moraleClub ? moraleAttention(squad, date) : { talks: [], promisesDue: [] };
  put(out, "/squad", [
    named("injured", players.filter((p) => p.injury && isInjured(p, date)).map(nameOf)),
    named("suspended", players.filter((p) => isSuspended(p)).map(nameOf)),
    named("contract", input.seasonEnd
      ? players.filter((p) => !p.loan && isExpired(p.contract, input.seasonEnd!, CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS)).map(nameOf)
      : []),
    named("talk", morale.talks.map((x) => x.playerName)),
    named("promise", morale.promisesDue.map((x) => x.playerName)),
  ]);

  // Formation: a starter who cannot play (injured, suspended, away with his country, gone), one not registered for
  // today's match, or an empty slot.
  const byId = new Map(players.map((p) => [p.id, p]));
  const unavailable: string[] = [];
  const unregistered: string[] = [];
  let empty = 0;
  for (let i = 0; i < input.slots; i++) {
    const id = input.lineup[i] ?? "";
    const p = id ? byId.get(id) : undefined;
    if (!p) empty++;
    else if (isUnavailable(p, date)) unavailable.push(p.name);
    else if (input.registeredToday && !input.registeredToday.has(p.id)) unregistered.push(p.name);
  }
  put(out, "/formation", [named("starterOut", unavailable), named("unregistered", unregistered), counted("emptySlot", empty)]);

  // Club: facility items below 50% or condemned (names = item ids, translated by the client).
  const items = Object.entries(squad.facilities?.items ?? {}) as [string, FacilityItem][];
  put(out, "/club", [
    named("condemned", items.filter(([, it]) => it.condemned).map(([k]) => k)),
    named("facility", items.filter(([, it]) => !it.condemned && conditionOf(it) < NAV_BADGES.FACILITY_BELOW).map(([k]) => k)),
  ]);

  // Finances: a negative balance, sponsor offers waiting.
  put(out, "/finances", [
    counted("negative", (squad.finances?.budget ?? 0) < 0 ? 1 : 0),
    counted("sponsor", (squad.sponsors?.offers ?? []).filter((o) => o.expires >= date).length),
  ]);

  // Staff: contracts ending soon, an empty core role (names = role ids).
  const members = squad.staff?.members ?? [];
  const limit = addDays(date, NAV_BADGES.STAFF_CONTRACT_DAYS);
  put(out, "/staff", [
    named("staffContract", members.filter((m) => m.contract && m.contract.until >= date && m.contract.until <= limit).map(nameOf)),
    named("staffVacant", squad.staff ? CORE_STAFF.filter((r) => !members.some((m) => m.role === r)) : []),
  ]);

  // Market: the window closing soon (problem), offers for his players (news).
  const closing = input.window?.open && input.window.until && daysBetween(date, input.window.until) <= NAV_BADGES.WINDOW_DAYS ? 1 : 0;
  put(out, "/transfers", [counted("windowClosing", closing)], input.offers.map((id) => `offer:${id}`));

  // Scouting: gems and shortlist alerts of the last week, youngsters on offer (news).
  const since = addDays(date, -NAV_BADGES.SCOUT_NEWS_DAYS);
  put(out, "/scout", [], [
    ...input.scoutNews.filter((m) => m.date >= since).map((m) => `scoutNews:${m.id}`),
    ...input.prospects.map((id) => `prospect:${id}`),
  ]);
  return out;
}

/** The number on a tab: its problems plus the news not seen yet. */
export function badgeCount(badge: TabBadge | undefined, seen: ReadonlySet<string>): number {
  if (!badge) return 0;
  return badge.alerts + badge.news.filter((id) => !seen.has(id)).length;
}

/** The reasons behind a tab's number: its problems, then the unseen news counted by kind (the id's prefix). */
export function badgeReasons(badge: TabBadge | undefined, seen: ReadonlySet<string>): BadgeReason[] {
  if (!badge) return [];
  const news = new Map<string, number>();
  for (const id of badge.news) {
    if (seen.has(id)) continue;
    const kind = id.slice(0, id.indexOf(":"));
    news.set(kind, (news.get(kind) ?? 0) + 1);
  }
  return [...badge.why, ...[...news].map(([kind, count]) => ({ kind, count }))];
}
