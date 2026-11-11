import { afterAll, describe, expect, test } from "bun:test";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { COURSES } from "@/Domain/managers/courses";

describe("manager course route (9.3)", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("language and licence courses: validation, money, one at a time", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("manager-course@test.local");
    const other = devAutoLogin("manager-course-other@test.local");
    await ownSolo(saveId, user.id);
    const seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    const post = async (token: string, body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/manager-course" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/manager-course`, {
          method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
      return { status: res.status, data: await res.json() as Record<string, any> };
    };

    expect((await post(other.session.token, { kind: "a" })).status).toBe(404);
    expect((await post(session.token, { kind: "phd" })).status).toBe(400);
    expect((await post(session.token, { kind: "language", language: "klingon" })).status).toBe(400);
    expect((await post(session.token, { kind: "a" })).data.error).toBe("noMoney");
    expect((await post(session.token, { kind: "pro" })).data.error).toBe("needsA");

    await saveService.updateSeat(saveId, seatId, { managerEarnings: 1_000_000 });
    const ok = await post(session.token, { kind: "language", language: "spanish" });
    expect(ok.status).toBe(200);
    expect(ok.data.managerStudies.course.language).toBe("spanish");
    expect(ok.data.managerSpent).toBe(COURSES.LANGUAGE.price);
    expect((await post(session.token, { kind: "a" })).data.error).toBe("busy");
  }, 60_000);
});
