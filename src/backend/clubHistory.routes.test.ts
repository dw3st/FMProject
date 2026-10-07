import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { recordLeagueSeasonHistory, recordTransferHistory } from "@/backend/clubHistoryWorld";
import type { ClubHistoryResponse } from "@/types/clubHistoryTypes";
import type { StandingRow } from "@/types/playerTypes";

describe("club history I/O and GET /api/saves/:saveId/clubs/:squadId/history", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("season rows, transfer records, owner-only route, 404 for unknown clubs", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("club-history@test.local");
    const other = devAutoLogin("club-history-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const index = await saveService.getSquadIndex(saveId);
    const [a, b] = index.inLeague("premier_league");
    const squadA = (await saveService.getSquadById(saveId, a!.squadId))!;
    const squadB = (await saveService.getSquadById(saveId, b!.squadId))!;
    const striker = squadA.players[0]!;
    // A season row for the striker, as the rollover writes it.
    const withRow = {
      ...squadA,
      players: squadA.players.map((p) => p.id === striker.id
        ? { ...p, history: [{ season: "2026-27", squadId: squadA.id, clubName: squadA.name, league: "premier_league",
            apps: 30, goals: 18, assists: 2, avgRating: 7, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] }] }
        : p),
    };
    const row = (id: string, pts: number) => ({ squadId: id, name: id, mp: 38, w: 20, d: 10, l: 8, gf: 60, ga: 40, gd: 20, pts, form: [] }) as unknown as StandingRow;
    const broken = await recordLeagueSeasonHistory(saveService, saveId, {
      league: "premier_league", tier: 1, season: "2026-27", start: "2026-08-15", end: "2027-05-20",
      table: [row(squadA.id, 80), row(squadB.id, 70)],
      fixtures: [{ id: "f1", date: "2026-09-01", competition: "premier_league", round: 1, home: squadA.id, away: squadB.id, played: true, result: { home: 4, away: 1 } }],
      squads: [withRow, squadB], titlesByClub: { [squadA.id]: ["league:premier_league"] }, tierChanges: {},
      nameOf: (id) => index.byId(id)?.name ?? id, watchSquadId: squadA.id,
    });
    expect(broken).toEqual([]);

    // A sale by B to A: B's sale record, A's signing record.
    const bought = squadB.players[0]!;
    const changes = await recordTransferHistory(saveService, saveId, {
      buyer: { ...withRow, players: [...withRow.players, bought] }, seller: squadB, playerId: bought.id, fee: 12_000_000,
      date: "2027-01-10", buyerSeason: "2026-27", sellerSeason: "2026-27",
    });
    expect(changes.map((c) => c.squadId)).toEqual([squadA.id, squadB.id]);

    const handler = apiRoutes["/api/saves/:saveId/clubs/:squadId/history" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const call = (squadId: string, token = session.token) => handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/clubs/${squadId}/history`, { headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId, squadId } },
    ));
    expect((await call(squadA.id, other.session.token)).status).toBe(404);
    expect((await call("nope_unknown")).status).toBe(404);
    expect((await call("../x")).status).toBe(404);

    const res = (await (await call(squadA.id)).json()) as ClubHistoryResponse;
    expect(res.name).toBe(squadA.name);
    expect(res.since).toBe("2026-27");
    expect(res.seasons).toHaveLength(1);
    expect(res.seasons[0]).toMatchObject({ position: 1, points: 80, titles: ["league:premier_league"] });
    expect(res.titles).toEqual([{ title: "league:premier_league", seasons: ["2026-27"] }]);
    expect(res.topScorers[0]).toMatchObject({ playerId: striker.id, goals: 18, current: true, retired: false });
    expect(res.records.biggestWin).toMatchObject({ gf: 4, ga: 1, opponentId: squadB.id });
    expect(res.records.recordSigning).toMatchObject({ playerId: bought.id, fee: 12_000_000, clubId: squadB.id });

    const resB = (await (await call(squadB.id)).json()) as ClubHistoryResponse;
    expect(resB.records.recordSale).toMatchObject({ fee: 12_000_000, clubId: squadA.id });
    expect(resB.records.biggestLoss).toMatchObject({ gf: 1, ga: 4 });

    // A club of the save without history: empty but valid.
    const c = index.inLeague("la_liga")[0]!;
    const resC = (await (await call(c.squadId)).json()) as ClubHistoryResponse;
    expect(resC.seasons).toEqual([]);
    expect(resC.since).toMatch(/^\d{4}/);
  }, 60_000);
});
