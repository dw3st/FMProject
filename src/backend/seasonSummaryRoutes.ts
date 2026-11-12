import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
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
    const summary = await seasonSummaryFor(saveId, auth.seatId, year, clubId);
    if (!summary) return Response.json({ error: "club not found" }, { status: 404 });
    return Response.json(summary);
  },
};
