import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";

describe("GET /api/saves/:saveId/managers/:managerId (8.9.31)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("an AI manager: rank, club league, passages with leagues and job security; 404 for unknown", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("manager-page@test.local");
    const other = devAutoLogin("manager-page-other@test.local");
    await ownSolo(saveId, user.id);
    const managers = await saveService.getManagers(saveId);
    const ai = managers.find((m) => !m.seatId && m.squadId && !m.squadId.startsWith("nat_") && m.squadId !== "33")!;

    const handler = apiRoutes["/api/saves/:saveId/managers/:managerId" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const call = (managerId: string, token = session.token) => handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/managers/${encodeURIComponent(managerId)}`, { headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId, managerId } },
    ));

    const res = await call(ai.id);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; rank: number; total: number; leagueSlug: string | null; clubName: string | null;
      clubs: { leagueSlug: string | null }[]; job: { level: unknown } | null };
    expect(body.id).toBe(ai.id);
    expect(body.rank).toBeGreaterThanOrEqual(1);
    expect(body.total).toBeGreaterThan(100);
    expect(body.leagueSlug).toBeTruthy();
    expect(body.clubName).toBeTruthy();
    expect(body.clubs[0]?.leagueSlug).toBeTruthy();
    expect(body.job?.level).not.toBeNull();

    expect((await call("nobody_here")).status).toBe(404);
    expect((await call("bad/id")).status).toBe(404);
    expect((await call(ai.id, other.session.token)).status).toBe(404);
  }, 120_000);
});
