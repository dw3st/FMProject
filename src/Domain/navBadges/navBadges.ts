/**
 * Counts on the menu tabs (report 2026-11-16). Every problem and every piece of news is one item with a stable id;
 * opening the tab marks its items as seen, so the number goes away. It comes back only for something new: another
 * player, another item, or the same problem back after it was solved (the client forgets ids no longer listed).
 * Pure: the route gathers the inputs, the client keeps the seen ids.
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

/** One thing behind a tab's number. `name`: a player, a staff member, a facility item id or a staff role id. */
export interface BadgeItem {
  kind: string;
  /** Stable while the thing lasts (`<kind>:<key>`). */
  id: string;
  name?: string;
  /** The player behind it (squad items), for a link to his page. */
  playerId?: string;
}
export interface TabBadge {
  items: BadgeItem[];
}
export type NavBadges = Partial<Record<BadgeTab, TabBadge>>;

/** The reasons of a tab, grouped by kind for its tooltip ("1 lesionado: B. Muniz"). */
export interface BadgeReason {
  kind: string;
  count: number;
  names?: string[];
}

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

const item = (kind: string, key: string, name?: string, playerId?: string): BadgeItem => ({
  kind, id: `${kind}:${key}`, ...(name !== undefined ? { name } : {}), ...(playerId !== undefined ? { playerId } : {}),
});

const put = (out: NavBadges, tab: BadgeTab, items: BadgeItem[]) => {
  if (items.length > 0) out[tab] = { items };
};

export function navBadges(input: NavBadgeInput): NavBadges {
  const { date, squad } = input;
  const players = squad.players;
  const out: NavBadges = {};

  // Squad: injured (each injury), suspended, contracts ending, talks asked, promises close to their deadline.
  const morale = squad.moraleClub ? moraleAttention(squad, date) : { talks: [], promisesDue: [] };
  put(out, "/squad", [
    ...players.filter((p) => p.injury && isInjured(p, date)).map((p) => item("injured", `${p.id}:${p.injury!.returnDate}`, p.name, p.id)),
    ...players.filter((p) => isSuspended(p)).map((p) => item("suspended", p.id, p.name, p.id)),
    ...(input.seasonEnd
      ? players.filter((p) => !p.loan && isExpired(p.contract, input.seasonEnd!, CONTRACT_CONFIG.ROLLOVER_GRACE_DAYS))
        .map((p) => item("contract", `${p.id}:${p.contract?.until ?? ""}`, p.name, p.id))
      : []),
    ...morale.talks.map((x) => item("talk", x.id, x.playerName, x.playerId)),
    ...morale.promisesDue.map((x) => item("promise", x.id, x.playerName, x.playerId)),
  ]);

  // Formation: a starter who cannot play (injured, suspended, away with his country, gone), one not registered for
  // today's match, or an empty slot.
  const byId = new Map(players.map((p) => [p.id, p]));
  const formation: BadgeItem[] = [];
  for (let i = 0; i < input.slots; i++) {
    const id = input.lineup[i] ?? "";
    const p = id ? byId.get(id) : undefined;
    if (!p) formation.push(item("emptySlot", `${i}:${id}`));
    else if (isUnavailable(p, date)) formation.push(item("starterOut", `${p.id}:${p.injury?.returnDate ?? ""}`, p.name));
    else if (input.registeredToday && !input.registeredToday.has(p.id)) formation.push(item("unregistered", `${p.id}:${date}`, p.name));
  }
  put(out, "/formation", formation);

  // Club: facility items below 50% or condemned.
  const items = Object.entries(squad.facilities?.items ?? {}) as [string, FacilityItem][];
  put(out, "/club", [
    ...items.filter(([, it]) => it.condemned).map(([k]) => item("condemned", k, k)),
    ...items.filter(([, it]) => !it.condemned && conditionOf(it) < NAV_BADGES.FACILITY_BELOW).map(([k]) => item("facility", k, k)),
  ]);

  // Finances: a negative balance, sponsor offers waiting.
  put(out, "/finances", [
    ...((squad.finances?.budget ?? 0) < 0 ? [item("negative", "balance")] : []),
    ...(squad.sponsors?.offers ?? []).filter((o) => o.expires >= date).map((o) => item("sponsor", o.id)),
  ]);

  // Staff: contracts ending soon, an empty core role.
  const members = squad.staff?.members ?? [];
  const limit = addDays(date, NAV_BADGES.STAFF_CONTRACT_DAYS);
  put(out, "/staff", [
    ...members.filter((m) => m.contract && m.contract.until >= date && m.contract.until <= limit)
      .map((m) => item("staffContract", `${m.id}:${m.contract!.until}`, m.name)),
    ...(squad.staff ? CORE_STAFF.filter((r) => !members.some((m) => m.role === r)).map((r) => item("staffVacant", r, r)) : []),
  ]);

  // Market: the window closing soon, offers for his players.
  const closing = input.window?.open && input.window.until && daysBetween(date, input.window.until) <= NAV_BADGES.WINDOW_DAYS;
  put(out, "/transfers", [
    ...(closing ? [item("windowClosing", input.window!.until!)] : []),
    ...input.offers.map((id) => item("offer", id)),
  ]);

  // Scouting: gems and shortlist alerts of the last week, youngsters on offer.
  const since = addDays(date, -NAV_BADGES.SCOUT_NEWS_DAYS);
  put(out, "/scout", [
    ...input.scoutNews.filter((m) => m.date >= since).map((m) => item("scoutNews", m.id)),
    ...input.prospects.map((id) => item("prospect", id)),
  ]);
  return out;
}

const unseen = (badge: TabBadge | undefined, seen: ReadonlySet<string>) => (badge?.items ?? []).filter((i) => !seen.has(i.id));

/** The number on a tab: the items not seen yet. */
export function badgeCount(badge: TabBadge | undefined, seen: ReadonlySet<string>): number {
  return unseen(badge, seen).length;
}

/** The unseen items of a tab grouped by kind, in order, with their names. */
export function badgeReasons(badge: TabBadge | undefined, seen: ReadonlySet<string>): BadgeReason[] {
  const out: BadgeReason[] = [];
  for (const i of unseen(badge, seen)) {
    let r = out.find((x) => x.kind === i.kind);
    if (!r) out.push((r = { kind: i.kind, count: 0 }));
    r.count++;
    if (i.name !== undefined) (r.names ??= []).push(i.name);
  }
  return out;
}

/** One kind of a tab's items with every entry, seen or not (the strip on top of the Squad screen, report 8b435dc7). */
export interface BadgeGroup {
  kind: string;
  entries: { name?: string; playerId?: string }[];
}

/** All items of a tab grouped by kind, in order. Unlike `badgeReasons`, seen items stay: the screen explains them. */
export function badgeGroups(badge: TabBadge | undefined): BadgeGroup[] {
  const out: BadgeGroup[] = [];
  for (const i of badge?.items ?? []) {
    let g = out.find((x) => x.kind === i.kind);
    if (!g) out.push((g = { kind: i.kind, entries: [] }));
    g.entries.push({ ...(i.name !== undefined ? { name: i.name } : {}), ...(i.playerId !== undefined ? { playerId: i.playerId } : {}) });
  }
  return out;
}

/** Every id listed now, on every tab: the client forgets seen ids outside it (a solved problem can come back). */
export function badgeIds(badges: NavBadges): Set<string> {
  return new Set(Object.values(badges).flatMap((b) => (b?.items ?? []).map((i) => i.id)));
}
