import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { emptyClubHistory, titleGallery, topPlayers } from "@/Domain/clubHistory/clubHistory";
import { seasonLabel } from "@/Domain/history/history";
import type { ClubHistoryResponse } from "@/types/clubHistoryTypes";

type Req = Request & { params: Record<string, string> };

/** Squad ids are plain file stems ("33", "of_x", "es_1"); anything else is never a club. */
const SQUAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Club history and records (`.claude/rules/game/club-history.md`). */
export const clubHistoryRoutes = {
  /**
   * `GET` — any club of the save (owner only), 404 when the club is not in the save. The history
   * starts empty: only seasons played since the career began.
   */
  "/api/saves/:saveId/clubs/:squadId/history": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const squadId = req.params.squadId ?? "";
    if (!SQUAD_ID.test(squadId)) return Response.json({ error: "club not found" }, { status: 404 });
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const squad = await saveService.getSquadById(saveId, squadId);
    if (!squad) return Response.json({ error: "club not found" }, { status: 404 });

    const history = (await saveService.getClubHistory(saveId, squadId)) ?? emptyClubHistory(squadId);
    const index = await saveService.getSquadIndex(saveId);
    const leagueSlug = index.byId(squadId)?.leagueSlug ?? squad.leagueSlug ?? "";
    const league = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === leagueSlug);
    const currentSeason = league ? seasonLabel(league.year, league.start, league.end) : null;

    const current = new Set(squad.players.map((p) => p.id));
    const scorers = topPlayers(history.scorers, "goals");
    const apps = topPlayers(history.scorers, "apps");
    const listed = new Set([...scorers, ...apps].map((s) => s.playerId).filter((id) => !current.has(id)));
    const retired = new Set(
      listed.size > 0 ? (await saveService.getRetired(saveId)).filter((r) => listed.has(r.id)).map((r) => r.id) : [],
    );
    const flag = <T extends { playerId: string }>(s: T) => ({ ...s, current: current.has(s.playerId), retired: retired.has(s.playerId) });

    const managers = await saveService.getManagers(saveId);
    const currentManager = managers.find((m) => m.squadId === squadId)?.name ?? null;
    // Previous managers from their passages (`managers.json`, Etapa 25), most recent first, then the
    // names of the season lines (a manager whose record is gone).
    const fromPassages = managers
      .flatMap((m) => (m.clubs ?? []).filter((c) => c.squadId === squadId && c.to).map((c) => ({ name: m.name, to: c.to! })))
      .sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : 0))
      .map((x) => x.name);
    const pastManagers = [...new Set([...fromPassages, ...history.seasons.map((s) => s.manager).filter((m): m is string => !!m)])]
      .filter((m) => m !== currentManager);

    const body: ClubHistoryResponse = {
      squadId, name: squad.name, colors: squad.colors, leagueSlug,
      venue: squad.venue ? { name: squad.venue.name, city: squad.venue.city, capacity: squad.venue.capacity } : null,
      manager: currentManager, pastManagers,
      since: history.seasons[0]?.season ?? currentSeason,
      seasons: history.seasons,
      titles: titleGallery(history.seasons),
      topScorers: scorers.map(flag),
      topApps: apps.map(flag),
      records: history.records,
    };
    return Response.json(body);
  },
};
