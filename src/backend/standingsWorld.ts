// Friends' league standings I/O (multiplayer part 5a, `.claude/rules/game/multiplayer.md`): the seat's open
// passage and the closed rows in `seatSeasons.json`. Pure rules live in `@/Domain/multiplayer/standings`.
import type { SaveService } from "@/backend/SaveService";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { closePassage, passageItems, rankEntries, sumItems, withExtra } from "@/Domain/multiplayer/standings";
import type { BoardState } from "@/types/boardTypes";
import type {
  PassageEnd, SeatSeasonRow, SeatStanding, StandingItem, StandingsEntry, StandingsView,
} from "@/types/standingsTypes";

/** A new passage at a club, from the board's objective (target and season). */
export function newPassage(args: {
  date: string; clubId: string; clubName: string; leagueSlug: string; board: BoardState | null | undefined;
}): SeatStanding {
  const o = args.board?.objective ?? null;
  return {
    from: args.date, clubId: args.clubId, clubName: args.clubName, leagueSlug: args.leagueSlug,
    season: o?.season ?? "", target: o?.target ?? null, extras: [],
  };
}

/** Only friends' leagues keep standings. */
export async function standingsOn(service: SaveService, saveId: string): Promise<boolean> {
  const meta = await service.getMeta(saveId);
  return meta?.mode === "multi" && !!meta.world;
}

/** Adds rows (idempotent by id). */
export async function appendSeatSeasons(service: SaveService, saveId: string, rows: readonly SeatSeasonRow[]): Promise<void> {
  if (rows.length === 0) return;
  const cur = await service.getSeatSeasons(saveId);
  const ids = new Set(cur.map((r) => r.id));
  const fresh = rows.filter((r) => !ids.has(r.id));
  if (fresh.length > 0) await service.writeSeatSeasons(saveId, [...cur, ...fresh]);
}

/** The league position of a club today (null without games). The stored table is sorted. */
export async function positionOf(service: SaveService, saveId: string, leagueSlug: string, clubId: string): Promise<number | null> {
  const table = (await service.getLeagueStandings(saveId, leagueSlug)) ?? [];
  const i = table.findIndex((r) => r.squadId === clubId);
  return i >= 0 && table[i]!.mp > 0 ? i + 1 : null;
}

/** Closes the seat's open passage outside the day (club change): writes the row, clears `standing`. */
export async function closeSeatPassage(
  service: SaveService, saveId: string, seatId: string, date: string, reason: PassageEnd,
): Promise<SeatSeasonRow | null> {
  const seat = await service.getSeat(saveId, seatId);
  const s = seat?.standing;
  if (!s) return null;
  const row = closePassage(s, { seatId, closedOn: date, reason, position: await positionOf(service, saveId, s.leagueSlug, s.clubId) });
  await appendSeatSeasons(service, saveId, [row]);
  await service.updateSeat(saveId, seatId, { standing: undefined });
  return row;
}

/**
 * The friends' league standings (`GET /api/worlds/:saveId/standings`): one entry per member (closed rows + the
 * open passage's partial at today's league position), ranked; the closed rows newest first. Inside the day advance,
 * `extraRows` are the rows closed today (not written yet) and `passages` the seats' working passages.
 */
export async function standingsView(
  service: SaveService, saveId: string,
  day: { extraRows?: readonly SeatSeasonRow[]; passages?: ReadonlyMap<string, SeatStanding | undefined> } = {},
): Promise<StandingsView> {
  const extraRows = day.extraRows ?? [];
  const stored = await service.getSeatSeasons(saveId);
  const ids = new Set(stored.map((r) => r.id));
  const rows = [...stored, ...extraRows.filter((r) => !ids.has(r.id))];
  const bySeat = new Map(listSaveMembers(saveId).map((m) => [m.seatId, m]));
  const entries: StandingsEntry[] = [];
  for (const { seatId, seat } of await service.listSeats(saveId)) {
    const m = bySeat.get(seatId);
    if (!m) continue;
    const closed = rows.filter((r) => r.seatId === seatId);
    const closedTotal = closed.reduce((n, r) => n + r.total, 0);
    const s = day.passages?.has(seatId) ? day.passages.get(seatId) : seat.standing;
    let partial: StandingsEntry["partial"] = null;
    if (s) {
      const position = await positionOf(service, saveId, s.leagueSlug, s.clubId);
      const items = passageItems(s, { position });
      partial = { total: sumItems(items), items, position, target: s.target };
    }
    entries.push({
      seatId,
      nickname: getSocialUser(m.userId)?.nickname ?? null,
      managerName: seat.manager?.name ?? "",
      face: seat.manager?.face ?? null,
      nationalityIso: seat.manager?.nationalityIso ?? null,
      clubId: seat.clubId,
      clubName: seat.clubName,
      clubColors: seat.clubColors,
      partial,
      closedTotal,
      total: closedTotal + (partial?.total ?? 0),
      seasons: closed.length,
    });
  }
  const sorted = [...rows].sort((a, b) => b.closedOn.localeCompare(a.closedOn) || a.id.localeCompare(b.id));
  return { entries: rankEntries(entries), rows: sorted };
}

export { withExtra };
export type { StandingItem };
