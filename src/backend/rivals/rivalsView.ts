// `GET /api/worlds/:saveId/rivals` (multiplayer part 6): one row per member.
import type { SaveService } from "@/backend/SaveService";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { seatMatchOn } from "@/backend/groupAdvance";
import { positionOf, standingsView } from "@/backend/standingsWorld";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { logError } from "@/Logger";
import { formOf } from "@/Domain/rivals/results";
import { knockoutComp, leagueComp, tableAround } from "@/Domain/rivals/competitionStatus";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { rankOf } from "@/Domain/multiplayer/standings";
import type { RivalComp, RivalNextMatch, RivalRow, RivalTableRow, RivalsView } from "@/types/rivalsTypes";

async function nextMatchOf(
  service: SaveService, saveId: string, seatId: string, from: string, nameOf: (id: string) => string,
  nations: Map<string, string>, myNationId: string | null,
): Promise<RivalNextMatch | null> {
  try {
    const date = await seatNextMatchDate(service, saveId, seatId, from);
    if (!date) return null;
    const seat = await service.getSeat(saveId, seatId);
    const f = await seatMatchOn(service, saveId, seatId, date);
    if (!f) return null;
    if (f.home !== seat?.clubId && f.away !== seat?.clubId && myNationId) {
      // A game of his national team (tester report, 8.8.7: it showed the raw id of his own nation).
      const myNation = nations.get(myNationId) ?? myNationId;
      const home = f.home === myNationId;
      const opponentId = home ? f.away : f.home;
      return { date, opponentId, opponentName: nations.get(opponentId) ?? opponentId, home, competition: f.competition, national: myNation };
    }
    const home = f.home === seat?.clubId;
    const opponentId = home ? f.away : f.home;
    return { date, opponentId, opponentName: nameOf(opponentId), home, competition: f.competition };
  } catch (e) {
    // Display only: a calendar read failure shows no next game.
    logError("world", `save ${saveId}: rivals next match of ${seatId} failed`, e);
    return null;
  }
}

/** His club's competitions (8.9.9): display only, a read failure shows none. */
async function compsOf(service: SaveService, saveId: string, leagueSlug: string, clubId: string): Promise<{ comps: RivalComp[]; table: RivalTableRow[] }> {
  try {
    const table = (await service.getLeagueStandings(saveId, leagueSlug)) ?? [];
    const comps: RivalComp[] = [];
    const league = leagueComp(leagueSlug, table, clubId);
    if (league) comps.push(league);
    for (const slug of [await playerCupSlug(leagueSlug), await playerContinentalSlug(service, saveId, clubId)]) {
      if (!slug) continue;
      const [meta, fixtures] = await Promise.all([service.getLeagueMeta(saveId, slug).catch(() => null), service.getAllFixturesForLeague(saveId, slug).catch(() => [])]);
      const c = meta ? knockoutComp(slug, meta, fixtures, clubId) : null;
      if (c) comps.push(c);
    }
    return { comps, table: tableAround(table, clubId) };
  } catch (e) {
    logError("world", `save ${saveId}: rivals competitions of ${clubId} failed`, e);
    return { comps: [], table: [] };
  }
}

export async function rivalsView(service: SaveService, saveId: string, viewerSeatId: string, now = Date.now()): Promise<RivalsView> {
  const meta = await service.getMeta(saveId);
  const today = meta?.currentDate ?? "";
  const feed = await service.getRivalsFeed(saveId);
  const standings = await standingsView(service, saveId);
  const live = liveScoresOf(saveId, now);
  const index = await service.getSquadIndex(saveId);
  const nameOf = (id: string) => index.byId(id)?.name ?? id;
  const national = await service.getNationalState(saveId);
  const nations = new Map(Object.values(national?.teams ?? {}).map((tm) => [tm.id, tm.nation] as const));
  const rows: RivalRow[] = [];
  for (const e of standings.entries) {
    const seat = await service.getSeat(saveId, e.seatId);
    const employed = !!seat?.clubId && !seat.unemployed;
    const natId = national?.human?.[e.seatId]?.teamId;
    const myNation = natId ? nations.get(natId) ?? null : null;
    const bets = await service.getBets(saveId, e.seatId);
    const where = employed && seat ? await compsOf(service, saveId, seat.leagueSlug, seat.clubId) : null;
    rows.push({
      seatId: e.seatId,
      nickname: e.nickname,
      managerName: e.managerName,
      face: e.face,
      nationalityIso: e.nationalityIso,
      clubId: employed ? e.clubId : "",
      clubName: employed ? e.clubName : "",
      clubColors: e.clubColors,
      nationalTeam: myNation,
      leagueSlug: seat?.leagueSlug ?? "",
      leaguePosition: employed && seat ? await positionOf(service, saveId, seat.leagueSlug, seat.clubId) : null,
      form: formOf(feed, e.seatId),
      last: feed.find((r) => r.seatId === e.seatId) ?? null,
      next: (employed || myNation) && today ? await nextMatchOf(service, saveId, e.seatId, today, nameOf, nations, natId ?? null) : null,
      friendsRank: rankOf(standings.entries, e.seatId),
      friendsTotal: e.total,
      live: live.find((l) => l.seatId === e.seatId) ?? null,
      bets: { open: bets.open.length, net: seat?.betNet ?? 0 },
      ...(where ? { comps: where.comps, table: where.table } : {}),
      me: e.seatId === viewerSeatId,
    });
  }
  return { rows };
}
