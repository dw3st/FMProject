// src/Domain/multiplayer/standings.ts
import { STANDINGS } from "@/Domain/multiplayer/standingsConfig";
import type { PassageEnd, SeatSeasonRow, SeatStanding, StandingItem, StandingItemKey } from "@/types/standingsTypes";

/** Keys where only the best result of the passage counts (one cup, one continental campaign). */
const MAX_KEYS: ReadonlySet<StandingItemKey> = new Set(["cup", "continental"]);

export const sumItems = (items: readonly StandingItem[]): number => items.reduce((n, i) => n + i.points, 0);

/** Points of a league position against the board's target (none without games or target). */
export function objectiveItems(position: number | null, target: number | null): StandingItem[] {
  if (position === null || target === null) return [];
  const cap = STANDINGS.MAX_POSITIONS;
  if (position <= target) {
    const above = Math.min(cap, target - position) * STANDINGS.PER_POSITION;
    return above > 0
      ? [{ key: "objective_met", points: STANDINGS.OBJECTIVE_MET }, { key: "above_target", points: above }]
      : [{ key: "objective_met", points: STANDINGS.OBJECTIVE_MET }];
  }
  return [{ key: "below_target", points: -Math.min(cap, position - target) * STANDINGS.PER_POSITION }];
}

/** Adds an extra: cup/continental keep the highest, the others add up. */
export function withExtra(s: SeatStanding, item: StandingItem): SeatStanding {
  const i = s.extras.findIndex((x) => x.key === item.key);
  if (i < 0) return { ...s, extras: [...s.extras, item] };
  const cur = s.extras[i]!;
  const next = MAX_KEYS.has(item.key)
    ? (item.points > cur.points ? item : cur)
    : { ...cur, points: cur.points + item.points };
  return next === cur ? s : { ...s, extras: s.extras.map((x, k) => (k === i ? next : x)) };
}

/** The passage's items with a position (the partial: today's; the close: the final one). */
export function passageItems(s: SeatStanding, at: { position: number | null }): StandingItem[] {
  return [...objectiveItems(at.position, s.target), ...s.extras];
}

/** Closes a passage into a season row. */
export function closePassage(s: SeatStanding, end: {
  seatId: string; closedOn: string; reason: PassageEnd; position: number | null;
  leagueTitle?: boolean; move?: "promoted" | "relegated" | null;
}): SeatSeasonRow {
  const objective = objectiveItems(end.position, s.target);
  const items: StandingItem[] = [...objective];
  if (end.reason === "rollover") {
    if (end.leagueTitle) items.push({ key: "league_title", points: STANDINGS.LEAGUE_TITLE });
    if (end.move === "promoted") items.push({ key: "promoted", points: STANDINGS.PROMOTED });
    if (end.move === "relegated") items.push({ key: "relegated", points: STANDINGS.RELEGATED });
  } else {
    const o = sumItems(objective);
    const half = Math.trunc(o / 2) - o;              // the objective part counts half, rounded toward zero
    if (half !== 0) items.push({ key: "half", points: half });
    if (end.reason === "sacked") items.push({ key: "sacked", points: STANDINGS.SACKED });
  }
  items.push(...s.extras);
  return {
    id: `${end.seatId}:${s.clubId}:${s.season}:${end.closedOn}`,
    seatId: end.seatId, clubId: s.clubId, clubName: s.clubName, leagueSlug: s.leagueSlug, season: s.season,
    from: s.from, closedOn: end.closedOn, reason: end.reason, position: end.position, target: s.target,
    items, total: sumItems(items),
  };
}

/** Standings order: total, then the partial, then the manager's name. */
export function rankEntries<T extends { total: number; managerName: string; partial: { total: number } | null }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    b.total - a.total || (b.partial?.total ?? 0) - (a.partial?.total ?? 0) || a.managerName.localeCompare(b.managerName));
}

/** A seat's place: 1 + how many have a higher total (equal totals share the place); 0 when the seat is absent. */
export function rankOf(entries: readonly { seatId: string; total: number }[], seatId: string): number {
  const me = entries.find((e) => e.seatId === seatId);
  return me ? 1 + entries.filter((e) => e.total > me.total).length : 0;
}

/** Points of a continental campaign stage (the best one counts). */
export function continentalPoints(reached: "groups" | "semifinal" | "finalist" | "champion"): number {
  return STANDINGS.CONTINENTAL[reached];
}
