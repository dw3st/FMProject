import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService, type SeatMeta } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { appendSeatSeasons, newPassage } from "@/backend/standingsWorld";
import { objectiveItems } from "@/Domain/multiplayer/standings";
import type { SeatContext } from "@/types/seatTypes";
import type { SeatSeasonRow, StandingsView } from "@/types/standingsTypes";

type Login = ReturnType<typeof devAutoLogin>;

const get = (saveId: string, token: string) => {
  const handler = apiRoutes["/api/worlds/:saveId/standings" as keyof typeof apiRoutes] as unknown as { GET: (r: Request) => Promise<Response> };
  return handler.GET(Object.assign(
    new Request(`http://localhost/api/worlds/${saveId}/standings`, { headers: { cookie: `fs_session=${token}` } }),
    { params: { saveId } },
  ));
};

/** `GET /api/worlds/:saveId/standings` (multiplayer part 5a): members see the ranked entries and the closed rows. */
describe("friends' league standings route", () => {
  let meta: SeatMeta;
  let seatB: SeatContext;
  let a: Login;
  let b: Login;
  let stranger: Login;
  const created: string[] = [];

  beforeAll(async () => {
    a = devAutoLogin("standings-a@test.local");
    b = devAutoLogin("standings-b@test.local");
    stranger = devAutoLogin("standings-x@test.local");
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, a.user.id);
    await saveService.updateMeta(meta.id, {
      mode: "multi",
      world: { phase: "running", inviteCode: "STANDINGS1", deadlineHours: 24, createdBy: a.user.id },
    });
    await saveService.updateSeat(meta.id, meta.seatId, {
      standing: newPassage({
        date: meta.currentDate!, clubId: "33", clubName: "Man Utd", leagueSlug: "premier_league", board: meta.board,
      }),
    });
    const index = await saveService.getSquadIndex(meta.id);
    seatB = await addSeat(meta.id, {
      userId: b.user.id, clubId: index.inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId,
      manager: { name: "Técnico B", nationalityIso: "gb", backgroundId: "former-player" },
    });
  }, 120_000);

  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id).catch(() => {});
  }, 120_000);

  /** Puts `clubId` at `position` (1-based) with one game for everybody. */
  const placeClub = async (clubId: string, position: number) => {
    const table = (await saveService.getLeagueStandings(meta.id, "premier_league"))!;
    const rest = table.filter((r) => r.squadId !== clubId);
    const mine = table.find((r) => r.squadId === clubId)!;
    rest.splice(position - 1, 0, mine);
    await saveService.writeLeagueStandings(meta.id, "premier_league", rest.map((r) => ({ ...r, mp: 1 })));
  };

  test("members see the entries in order with the members' closed rows; the partial follows the table", async () => {
    const row: SeatSeasonRow = {
      id: `${seatB.seatId}:old`, seatId: seatB.seatId, clubId: "x", clubName: "Old Club", leagueSlug: "premier_league",
      season: "2025-26", from: "2025-08-01", closedOn: "2026-05-20", reason: "rollover", position: 3, target: 5,
      items: [{ key: "objective_met", points: 10 }, { key: "above_target", points: 2 }], total: 12,
    };
    // A seat that left the league keeps its row on disk, but the view only shows the current members'.
    const gone: SeatSeasonRow = { ...row, id: "left-seat:old", seatId: "left-seat" };
    await appendSeatSeasons(saveService, meta.id, [row, gone]);
    await placeClub("33", 18);

    for (const login of [a, b]) {
      const res = await get(meta.id, login.session.token);
      expect(res.status).toBe(200);
      const view = (await res.json()) as StandingsView;
      expect(view.entries.map((e) => e.seatId)).toEqual([seatB.seatId, meta.seatId]);
      expect(view.entries[0]).toMatchObject({ closedTotal: 12, seasons: 1, managerName: "Técnico B" });
      expect(view.rows).toEqual([row]);
    }

    const target = (await saveService.getSeat(meta.id, meta.seatId))!.standing!.target;
    const low = ((await (await get(meta.id, a.session.token)).json()) as StandingsView).entries.find((e) => e.seatId === meta.seatId)!;
    expect(low.partial).toMatchObject({ position: 18, target, items: objectiveItems(18, target) });
    expect(low.total).toBe(low.partial!.total);

    await placeClub("33", 1);
    const top = ((await (await get(meta.id, a.session.token)).json()) as StandingsView).entries.find((e) => e.seatId === meta.seatId)!;
    expect(top.partial).toMatchObject({ position: 1, items: objectiveItems(1, target) });
    expect(top.partial!.total).toBeGreaterThan(low.partial!.total);
  }, 60_000);

  test("a non-member gets 404", async () => {
    expect((await get(meta.id, stranger.session.token)).status).toBe(404);
  });

  test("a solo save is 409 notMulti", async () => {
    const solo = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Man Utd", clubColors: ["#da291c", "#ffffff"],
    });
    created.push(solo.id);
    const owner = devAutoLogin("standings-solo@test.local");
    await ownSolo(solo.id, owner.user.id);
    const res = await get(solo.id, owner.session.token);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "notMulti" });
  }, 60_000);
});
