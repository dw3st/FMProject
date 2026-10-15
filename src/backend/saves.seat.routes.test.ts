import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";

const call = (saveId: string, method: string, token: string, body?: unknown) => {
  const handler = apiRoutes["/api/saves/:id"] as (r: Request) => Promise<Response>;
  return handler(Object.assign(
    new Request(`http://localhost/api/saves/${saveId}`, {
      method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: { id: saveId } },
  ));
};

describe("/api/saves/:id acts on the requester's seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("GET returns the merged meta with seatId; PUT writes the seat and ignores currentDate", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const { user, session } = devAutoLogin("seat-route@test.local");
    await ownSolo(meta.id, user.id);
    const token = session.token;

    const got = await (await call(meta.id, "GET", token)).json();
    expect(got.seatId).toBe(meta.seatId);
    expect(got.clubId).toBe("33");
    expect(got.season?.restDays).toBeArray();

    const put = await call(meta.id, "PUT", token, { training_intensity: "heavy", currentDate: "2099-01-01" });
    expect(put.status).toBe(200);
    expect((await saveService.getSeat(meta.id, meta.seatId))?.training_intensity).toBe("heavy");
    expect((await saveService.getMeta(meta.id))?.currentDate).toBe(meta.currentDate);
  }, 300_000);

  test("the inbox route reads the requester's seat", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const { user, session } = devAutoLogin("seat-inbox@test.local");
    await ownSolo(meta.id, user.id);
    await saveService.appendInbox(meta.id, { id: "only-mine", category: "season", read: false, createdAt: "2027-01-01T00:00:00Z" } as never, meta.seatId);
    const handler = apiRoutes["/api/saves/:saveId/inbox"] as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${meta.id}/inbox`, { headers: { cookie: `fs_session=${session.token}` } }),
      { params: { saveId: meta.id } },
    ));
    expect((await res.json()).map((m: { id: string }) => m.id)).toContain("only-mine");
  }, 300_000);
});
