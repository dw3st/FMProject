// `GET /api/worlds/:saveId/rivals` (multiplayer part 6): one row per member.
import type { SaveService } from "@/backend/SaveService";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { seatMatchOn } from "@/backend/groupAdvance";
import { positionOf, standingsView } from "@/backend/standingsWorld";
import { liveScoresOf } from "@/backend/rivals/liveScores";
import { logError } from "@/Logger";
import { formOf } from "@/Domain/rivals/results";
import { rankOf } from "@/Domain/multiplayer/standings";
import type { RivalNextMatch, RivalRow, RivalsView } from "@/types/rivalsTypes";

async function nextMatchOf(
  service: SaveService, saveId: string, seatId: string, from: string, nameOf: (id: string) => string,
): Promise<RivalNextMatch | null> {
  try {
    const date = await seatNextMatchDate(service, saveId, seatId, from);
    if (!date) return null;
    const seat = await service.getSeat(saveId, seatId);
    const f = await seatMatchOn(service, saveId, seatId, date);
    if (!f) return null;
    const home = f.home === seat?.clubId;
    const opponentId = home ? f.away : f.home;
    return { date, opponentId, opponentName: nameOf(opponentId), home, competition: f.competition };
  } catch (e) {
    // Display only: a calendar read failure shows no next game.
    logError("world", `save ${saveId}: rivals next match of ${seatId} failed`, e);
    return null;
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
  const rows: RivalRow[] = [];
  for (const e of standings.entries) {
    const seat = await service.getSeat(saveId, e.seatId);
    const employed = !!seat?.clubId && !seat.unemployed;
    rows.push({
      seatId: e.seatId,
      nickname: e.nickname,
      managerName: e.managerName,
      face: e.face,
      nationalityIso: e.nationalityIso,
      clubId: employed ? e.clubId : "",
      clubName: employed ? e.clubName : "",
      clubColors: e.clubColors,
      leagueSlug: seat?.leagueSlug ?? "",
      leaguePosition: employed && seat ? await positionOf(service, saveId, seat.leagueSlug, seat.clubId) : null,
      form: formOf(feed, e.seatId),
      last: feed.find((r) => r.seatId === e.seatId) ?? null,
      next: employed && today ? await nextMatchOf(service, saveId, e.seatId, today, nameOf) : null,
      friendsRank: rankOf(standings.entries, e.seatId),
      friendsTotal: e.total,
      live: live.find((l) => l.seatId === e.seatId) ?? null,
      me: e.seatId === viewerSeatId,
    });
  }
  return { rows };
}
