import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";

const get = (key: string, path: string, saveId: string, token: string, params: Record<string, string> = {}) => {
  const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost${path}`, { headers: { cookie: `fs_session=${token}` } }),
    { params: { saveId, ...params } },
  ));
};

describe("world routes answer any member of the world", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("news and standings: owner and member 200, stranger 404", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin("world-owner@test.local");
    const friend = devAutoLogin("world-friend@test.local");
    const stranger = devAutoLogin("world-stranger@test.local");
    await ownSolo(meta.id, owner.user.id);
    // A member of the world (his seat file comes with `addSeat`, Task 28; the world routes never read it).
    addSaveMember(meta.id, friend.user.id, "seat-friend", "member");

    for (const token of [owner.session.token, friend.session.token]) {
      expect((await get("/api/saves/:saveId/news", `/api/saves/${meta.id}/news`, meta.id, token)).status).toBe(200);
      expect((await get("/api/saves/:saveId/leagues/:leagueSlug/standings", `/api/saves/${meta.id}/leagues/premier_league/standings`,
        meta.id, token, { leagueSlug: "premier_league" })).status).toBe(200);
    }
    const s = await get("/api/saves/:saveId/news", `/api/saves/${meta.id}/news`, meta.id, stranger.session.token);
    expect(s.status).toBe(404);
  }, 300_000);
});
