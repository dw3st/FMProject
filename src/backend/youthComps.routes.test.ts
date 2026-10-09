import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";

describe("youth competition routes", () => {
  let saveId = "";
  let token = "";
  let other = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("youthcomp-route@test.local");
    token = session.token;
    other = devAutoLogin("youthcomp-other@test.local").session.token;
    recordSaveOwnership(saveId, user.id);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const call = (key: string, path: string, method = "GET", body?: unknown, tok = token, params: Record<string, string> = {}) => {
    const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost${path}`, {
        method, headers: { cookie: `fs_session=${tok}`, "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      { params: { saveId, ...params } },
    ));
  };

  test("country competitions and one competition", async () => {
    const list = await (await call("/api/saves/:saveId/youth-comps", `/api/saves/${saveId}/youth-comps?country=England`)).json() as any;
    expect(list).toEqual({ u21: "u21_england", u19: "u19_england" });
    const none = await (await call("/api/saves/:saveId/youth-comps", `/api/saves/${saveId}/youth-comps?country=Atlantis`)).json() as any;
    expect(none).toEqual({ u21: null, u19: null });

    const key = "/api/saves/:saveId/youth-comps/:slug";
    const one = await call(key, `/api/saves/${saveId}/youth-comps/u21_england`, "GET", undefined, token, { slug: "u21_england" });
    expect(one.status).toBe(200);
    const data = await one.json() as any;
    expect(data.meta.kind).toBe("youth");
    expect(data.fixtures.length).toBe(380);
    expect(data.standings.length).toBe(20);
    expect(Object.keys(data.names).length).toBe(20);
    expect(data.leaders).toEqual({});
    expect(data.leagueOf[data.meta.youth.clubs[0]]).toBe("premier_league");
    expect((await call(key, "/x", "GET", undefined, token, { slug: "cup_england" })).status).toBe(400);
    expect((await call(key, "/x", "GET", undefined, token, { slug: "u21_atlantis" })).status).toBe(404);
    expect((await call(key, "/x", "GET", undefined, other, { slug: "u21_england" })).status).toBeGreaterThanOrEqual(403);
  }, 60_000);

  test("call-ups: next games, eligible, validation", async () => {
    const key = "/api/saves/:saveId/youth-callups";
    const got = await (await call(key, `/api/saves/${saveId}/youth-callups`)).json() as any;
    expect(got.next.u21.slug).toBe("u21_england");
    expect(got.next.u19.slug).toBe("u19_england");
    expect(got.eligible.u19.every((p: any) => p.age <= 19)).toBe(true);
    expect(got.eligible.u21.length).toBeGreaterThan(got.eligible.u19.length);

    const squad = (await saveService.getSquadById(saveId, "33"))!;
    const old = squad.players.find((p) => p.age > 21)!;
    const ok = await call(key, "/x", "PUT", { u21: [old.id] });
    expect(ok.status).toBe(200);
    expect((await saveService.getMeta(saveId))!.youthCallUps).toEqual({ u21: [old.id] });

    const foreign = (await saveService.getSquadById(saveId, "40"))!.players[0]!.id;
    for (const bad of [
      { u21: [foreign] }, { u21: [old.id, old.id] }, { u21: squad.players.slice(0, 12).map((p) => p.id) }, { u19: [old.id] },
    ]) {
      const res = await call(key, "/x", "PUT", bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error).toBe("invalidPlayers");
    }
    expect((await call(key, "/x", "PUT", { u21: [] })).status).toBe(200);
    expect((await saveService.getMeta(saveId))!.youthCallUps).toBeUndefined();
  }, 60_000);

  test("season calendar: youth games apart from the match calendar", async () => {
    const res = await call("/api/saves/:id", `/api/saves/${saveId}`, "GET", undefined, token, { id: saveId });
    const data = await res.json() as any;
    expect(data.season.calendar.some((f: any) => isYouthCompSlug(f.competition))).toBe(false);
    expect(data.season.youthCalendar.length).toBe(76);
    expect(data.season.youthCalendar.every((f: any) => isYouthCompSlug(f.competition) && (f.home === "33" || f.away === "33"))).toBe(true);
  }, 60_000);

  test("without a club: 409 noClub", async () => {
    await saveService.updateMeta(saveId, { clubId: "" });
    expect((await call("/api/saves/:saveId/youth-callups", "/x")).status).toBe(409);
    expect((await call("/api/saves/:saveId/youth-callups", "/x", "PUT", { u21: [] })).status).toBe(409);
    await saveService.updateMeta(saveId, { clubId: "33" });
  }, 60_000);
});
