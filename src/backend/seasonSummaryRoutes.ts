import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { logError } from "@/Logger";
import { buildSeasonSummary } from "@/Domain/season/seasonSummary";
import type { SeasonSummary } from "@/types/seasonSummaryTypes";

type Req = Request & { params: Record<string, string> };

const SQUAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The two labels a season that began in `year` can have ("2027" or "2027-28"). */
export function seasonLabelsOf(year: number): string[] {
  return [String(year), `${year}-${String((year + 1) % 100).padStart(2, "0")}`];
}

/**
 * The report of the season `year` of a club the seat managed: the club's history row, the seat's ledger of that
 * season, the squad's career rows and the home attendances. Null when the club is not in the save.
 */
export async function seasonSummaryFor(saveId: string, seatId: string, year: number, clubId: string): Promise<SeasonSummary | null> {
  const seat = await saveService.getSeat(saveId, seatId);
  const squad = await saveService.getSquadById(saveId, clubId);
  if (!seat || !squad) return null;
  const labels = seasonLabelsOf(year);
  const history = await saveService.getClubHistory(saveId, clubId);
  const row = history?.seasons.findLast((s) => labels.includes(s.season)) ?? null;
  const index = await saveService.getSquadIndex(saveId);
  const league = row?.league ?? index.byId(clubId)?.leagueSlug ?? seat.leagueSlug;
  const archive = await saveService.readLeagueSeasonArchive(saveId, league, year);
  const entries = (await saveService.listLedgerSeasons(saveId, seatId)).includes(year)
    ? await saveService.getLedger(saveId, year, seatId)
    : [];
  return buildSeasonSummary({
    year,
    season: row?.season ?? labels[0]!,
    club: { id: clubId, name: squad.name, colors: squad.colors },
    league,
    row,
    teams: archive?.standings.length ?? 0,
    entries,
    players: [...squad.players, ...(squad.youth ?? [])].map((p) => ({
      id: p.id, name: p.name, nationality: p.nationality ?? undefined, history: p.history, arrival: p.arrival,
    })),
    attendance: squad.facilities?.attendance ?? [],
    seasonEnd: archive?.end ?? "",
    last: seat.lastSeason,
  });
}

/** Reports kept per seat: the newest first, at most this many. */
const MAX_REPORTS = 60;
const sameReport = (r: SeasonSummary, year: number, clubId: string) => r.year === year && r.clubId === clubId;

/** The stored report of a season, or a fresh one stored on the way (a report is frozen once seen). */
export async function keptSeasonReport(saveId: string, seatId: string, year: number, clubId: string): Promise<SeasonSummary | null> {
  const stored = await saveService.getSeasonReports(saveId, seatId);
  const hit = stored.find((r) => sameReport(r, year, clubId));
  if (hit) return hit;
  const fresh = await seasonSummaryFor(saveId, seatId, year, clubId);
  if (!fresh || !fresh.table) return fresh;
  const next = [fresh, ...stored].sort((a, b) => b.year - a.year).slice(0, MAX_REPORTS);
  await saveService.writeSeasonReports(saveId, seatId, next);
  return fresh;
}

/**
 * The seasons the seat managed to the end: the last one (`lastSeason`) and every club-history row signed with his
 * manager's name at a club of his career. Each is stored the first time it is listed.
 */
export async function seatSeasonReports(saveId: string, seatId: string): Promise<SeasonSummary[]> {
  const seat = await saveService.getSeat(saveId, seatId);
  if (!seat) return [];
  const stored = await saveService.getSeasonReports(saveId, seatId);
  const wanted: { year: number; clubId: string }[] = [];
  if (seat.lastSeason) wanted.push({ year: seat.lastSeason.year, clubId: seat.lastSeason.clubId });
  const record = (await saveService.getManagers(saveId)).find((m) => m.seatId === seatId);
  if (record) {
    for (const squadId of new Set((record.clubs ?? []).map((c) => c.squadId).filter(Boolean))) {
      const history = await saveService.getClubHistory(saveId, squadId);
      for (const row of history?.seasons ?? []) {
        const year = Number(row.season.slice(0, 4));
        if (row.manager === record.name && Number.isInteger(year)) wanted.push({ year, clubId: squadId });
      }
    }
  }
  for (const w of wanted) {
    if (stored.some((r) => sameReport(r, w.year, w.clubId))) continue;
    await keptSeasonReport(saveId, seatId, w.year, w.clubId);
  }
  return (await saveService.getSeasonReports(saveId, seatId)).sort((a, b) => b.year - a.year);
}

/** After a day: freeze the report of every seat whose season just ended (never fails the day). */
export async function captureSeasonReports(saveId: string): Promise<void> {
  try {
    for (const { seatId, seat } of await saveService.listSeats(saveId)) {
      const last = seat.lastSeason;
      if (!last) continue;
      const stored = await saveService.getSeasonReports(saveId, seatId);
      if (!stored.some((r) => sameReport(r, last.year, last.clubId))) await keptSeasonReport(saveId, seatId, last.year, last.clubId);
    }
  } catch (err) {
    logError("season-summary", `failed to keep the season reports of save ${saveId}`, err);
  }
}

/** End-of-season report (`.claude/rules/game/season-summary.md`). */
export const seasonSummaryRoutes = {
  /** `GET ?year=YYYY[&club=<squadId>]` — the seat's season at that club (default: its club now). */
  "/api/saves/:saveId/season-summary": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year"));
    if (!Number.isInteger(year) || year < 1900 || year > 3000) return Response.json({ error: "invalid year" }, { status: 400 });
    const seat = await saveService.getSeat(saveId, auth.seatId);
    if (!seat) return Response.json({ error: "save not found" }, { status: 404 });
    const clubId = url.searchParams.get("club") ?? seat.clubId;
    if (!SQUAD_ID.test(clubId)) return Response.json({ error: "club not found" }, { status: 404 });
    const summary = await withSaveLock(saveId, () => keptSeasonReport(saveId, auth.seatId, year, clubId));
    if (!summary) return Response.json({ error: "club not found" }, { status: 404 });
    return Response.json(summary);
  },
  /** `GET` — every season report the seat can reopen, the newest first (the manager page). */
  "/api/saves/:saveId/season-reports": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const reports = await withSaveLock(saveId, () => seatSeasonReports(saveId, auth.seatId));
    return Response.json({ reports });
  },
};
