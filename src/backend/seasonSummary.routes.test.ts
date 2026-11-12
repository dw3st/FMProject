import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { seasonLabelsOf } from "@/backend/seasonSummaryRoutes";
import { emptyClubHistory } from "@/Domain/clubHistory/clubHistory";
import type { SeasonSummary } from "@/types/seasonSummaryTypes";

describe("GET /api/saves/:saveId/season-summary", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("season labels of a year", () => {
    expect(seasonLabelsOf(2027)).toEqual(["2027", "2027-28"]);
    expect(seasonLabelsOf(2099)).toEqual(["2099", "2099-00"]);
  });

  test("the seat's season at its club: history row, ledger, objective; members only", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("season-summary@test.local");
    const other = devAutoLogin("season-summary-other@test.local");
    const seatId = await ownSolo(saveId, user.id);

    await saveService.writeClubHistory(saveId, {
      ...emptyClubHistory("33"),
      seasons: [{
        season: "2026-27", league: "premier_league", tier: 1, position: 3, played: 38, won: 22, drawn: 9, lost: 7,
        gf: 70, ga: 38, points: 75, titles: ["cup:cup_england"], topScorer: { playerId: "gone", name: "Left Striker", goals: 21 },
      }],
    });
    await saveService.appendLedger(saveId, 2026, [
      { date: "2026-08-17", kind: "broadcasting", amount: 1000, label: "tv" },
      { date: "2026-08-17", kind: "wages", amount: -400, label: "wages" },
      { date: "2026-11-01", kind: "prize", amount: 50, label: "ucl", ref: { competition: "ucl", stage: "qf" } },
      { date: "2027-01-10", kind: "transfer_out", amount: -300, label: "buy", ref: { playerId: "x1", playerName: "New Man" } },
    ], seatId);
    await saveService.updateSeat(saveId, seatId, { lastSeason: { year: 2026, clubId: "33", target: 4, met: true } });

    const handler = apiRoutes["/api/saves/:saveId/season-summary" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const call = (query: string, token = session.token) => handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/season-summary${query}`, { headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId } },
    ));

    const res = await call("?year=2026");
    expect(res.status).toBe(200);
    const s = (await res.json()) as SeasonSummary;
    expect(s.season).toBe("2026-27");
    expect(s.clubId).toBe("33");
    expect(s.table).toMatchObject({ position: 3, played: 38, won: 22, points: 75 });
    expect(s.titles).toEqual(["cup:cup_england"]);
    expect(s.cup).toEqual({ competition: "cup_england", stage: "champion" });
    expect(s.continental).toEqual({ competition: "ucl", stage: "qf" });
    expect(s.objective).toEqual({ target: 4, met: true });
    expect(s.money).toMatchObject({ income: 1050, expenses: 700, net: 350, prizes: 50, wages: 400 });
    expect(s.market).toMatchObject({ signings: 1, spent: 300, sales: 0, biggestBuy: { name: "New Man", fee: 300 } });
    expect(s.highlights.find((h) => h.kind === "scorer")).toMatchObject({ playerId: "gone", value: 21 });

    // A season without a ledger or a history row still answers (an empty report).
    const empty = (await (await call("?year=2031")).json()) as SeasonSummary;
    expect(empty.table).toBeNull();
    expect(empty.money.income).toBe(0);
    expect(empty.objective).toBeUndefined();

    expect((await call("")).status).toBe(400);
    expect((await call("?year=abc")).status).toBe(400);
    expect((await call("?year=2026&club=nope")).status).toBe(404);
    expect((await call("?year=2026&club=../x")).status).toBe(404);
    expect((await call("?year=2026", other.session.token)).status).toBe(404);
  }, 120_000);
});
