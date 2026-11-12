import { ownSolo, updateSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { releaseHumanClub, takeOverClub } from "@/backend/jobWorld";
import { advanceOneDay } from "@/backend/advanceDay";
import { memberStars } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import { TRUSTED, coursePriceOf } from "@/Domain/staff/trustedStaff";
import type { StaffMember } from "@/Domain/staff/staffTypes";

/**
 * The manager's trusted staff (`.claude/rules/game/staff.md` → "Comissão de confiança"): the three places, the
 * course paid from his wallet (away, role vacant), and the trusted professionals following him to a new club.
 */
describe("trusted staff routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("trust, course, and the move to a new club", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("staff-trusted@test.local");
    const seatId = await ownSolo(saveId, user.id);

    const call = async (route: string, method: string, body?: unknown) => {
      const handler = apiRoutes[`/api/saves/:saveId/staff${route}` as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/staff${route}`, {
          method,
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
      return { status: res.status, json: await res.json() as any };
    };

    const first = await call("", "GET");
    expect(first.json.trusted).toEqual({ used: 0, max: TRUSTED.MAX });
    expect(first.json.wallet).toBe(0);
    const members = first.json.members as (StaffMember & { stars: number })[];
    const fitness = members.find((m) => m.role === "fitness")!;
    const medic = members.find((m) => m.role === "medic")!;
    const analyst = members.find((m) => m.role === "analyst")!;
    const assistant = members.find((m) => m.role === "assistant")!;

    // Three places.
    expect((await call("/trusted", "PUT", { memberId: "nobody", trusted: true })).status).toBe(404);
    for (const m of [fitness, medic, analyst]) expect((await call("/trusted", "PUT", { memberId: m.id, trusted: true })).status).toBe(200);
    const full = await call("/trusted", "PUT", { memberId: assistant.id, trusted: true });
    expect(full.status).toBe(409);
    expect(full.json.error).toBe("trustedFull");
    expect((await call("", "GET")).json.trusted.used).toBe(3);

    // The course: only trusted, only with the money.
    expect((await call("/course", "POST", { memberId: assistant.id })).json.error).toBe("notTrusted");
    expect((await call("/course", "POST", { memberId: fitness.id })).json.error).toBe("noMoney");
    await updateSolo(saveId, { managerEarnings: 2_000_000 });
    const price = coursePriceOf(fitness)!;
    const sent = await call("/course", "POST", { memberId: fitness.id });
    expect(sent.status).toBe(200);
    expect(sent.json.wallet).toBe(2_000_000 - price);
    const away = (sent.json.members as StaffMember[]).find((m) => m.id === fitness.id)!;
    expect(away.course?.specialty).toBe("physical");
    expect((await saveService.getSeat(saveId, seatId))!.managerSpent).toBe(price);
    // Away: the physical area has nobody.
    expect(sent.json.areas.find((a: { area: string }) => a.area === "physical").stars).toBeNull();
    expect(sent.json.areas.find((a: { area: string }) => a.area === "physical").mult).toBe(STAFF.AREA_VACANT_MULT);
    // One course at a time.
    expect((await call("/course", "POST", { memberId: medic.id })).json.error).toBe("courseBusy");
    expect((await call("/course", "POST", { memberId: fitness.id })).json.error).toBe("onCourse");

    // The day the course ends he is back with half a star more, and the inbox says so.
    const today = (await saveService.getMeta(saveId))!.currentDate!;
    const club = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, {
      ...club,
      staff: { ...club.staff!, members: club.staff!.members.map((m) => (m.id === fitness.id ? { ...m, course: { ...m.course!, until: today } } : m)) },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const back = (await saveService.getSquadById(saveId, "33"))!.staff!.members.find((m) => m.id === fitness.id)!;
    expect(back.course).toBeUndefined();
    expect(back.lastCourse).toBeDefined();
    expect(memberStars(back)).toBe(Math.min(STAFF.MAX_STARS, fitness.stars + TRUSTED.STAR_GAIN));
    const inbox = await saveService.getInbox(saveId, seatId);
    expect(inbox.some((m) => m.category === "contract" && (m as { kind?: string }).kind === "staff_course_done")).toBe(true);
    // The starting staff is drawn per save: a coach who reached the top is refused for that, else for the yearly gap.
    const again = memberStars(back) >= STAFF.MAX_STARS ? "atBest" : "tooSoon";
    expect((await call("/course", "POST", { memberId: fitness.id })).json.error).toBe(again);

    // He leaves the club: the trusted three wait on the seat, then join the new club's staff.
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    await releaseHumanClub(saveService, saveId, seatId, { squadId: "33", date });
    const waiting = (await saveService.getSeat(saveId, seatId))!.trustedStaff ?? [];
    expect(waiting.map((m) => m.id).sort()).toEqual([fitness.id, medic.id, analyst.id].sort());
    expect(waiting.every((m) => !m.contract)).toBe(true);
    expect((await saveService.getSquadById(saveId, "33"))!.staff).toBeUndefined();

    const world = (await saveService.getMeta(saveId))!;
    await takeOverClub(saveService, saveId, seatId, { squadId: "50", date, activeLeagues: world.activeLeagues ?? [] });
    const next = (await saveService.getSquadById(saveId, "50"))!.staff!;
    for (const m of [fitness, medic, analyst]) {
      const joined = next.members.find((x) => x.id === m.id)!;
      expect(joined.trusted).toBe(true);
      expect(joined.contract).toBeDefined();
    }
    // One of each single role: the new club's own fitness coach, medic and analyst gave way.
    for (const role of ["fitness", "medic", "analyst"] as const) expect(next.members.filter((m) => m.role === role)).toHaveLength(1);
    expect(memberStars(next.members.find((m) => m.id === medic.id)!)).toBe(medic.stars);
    expect((await saveService.getSeat(saveId, seatId))!.trustedStaff).toBeUndefined();
  }, 120_000);
});
