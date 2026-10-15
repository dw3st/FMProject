import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import type { NewsItem } from "@/types/newsTypes";

/** News feed route (Etapa 42, `.claude/rules/game/press.md` → "Notícias"). */
describe("news route", () => {
  let saveId = "";
  let token = "";
  const item = (id: string, date: string, over: Partial<NewsItem>): NewsItem => ({
    id: `${date}:thrashing:${id}`, date, kind: "thrashing", importance: 1, clubIds: [], playerIds: [], params: {}, ...over,
  });
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    await saveService.updateSeat(saveId, meta.seatId, { followedLeagues: ["la_liga"] });
    const { user, session } = devAutoLogin("news-route@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    await saveService.appendNews(saveId, [
      item("a", "2027-03-05", { clubIds: ["33", "40"], league: "premier_league", importance: 2 }),
      item("b", "2027-03-05", { clubIds: ["33"], league: "premier_league" }),
      item("c", "2027-03-04", { clubIds: ["50"], league: "premier_league" }),
      item("d", "2027-03-03", { clubIds: ["60"], league: "la_liga" }),
      item("e", "2027-03-02", { clubIds: ["70"], league: "serie_a" }),
    ]);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const get = (query: string) => {
    const handler = apiRoutes["/api/saves/:saveId/news" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/news${query}`, { headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId } },
    ));
  };
  const short = (items: NewsItem[]) => items.map((n) => n.id.split(":")[2]);
  const ids = async (query: string) => short((await (await get(query)).json()).items as NewsItem[]);

  test("invalid scope, limit and before are 400", async () => {
    expect((await get("?scope=nope")).status).toBe(400);
    expect((await get("?limit=0")).status).toBe(400);
    expect((await get("?limit=101")).status).toBe(400);
    expect((await get("?before=2027-02-30")).status).toBe(400);
  });

  test("each scope filters and orders by date, importance, id", async () => {
    expect(await ids("")).toEqual(["a", "b", "c", "d", "e"]);
    expect(await ids("?scope=club")).toEqual(["a", "b"]);
    expect(await ids("?scope=league")).toEqual(["a", "b", "c"]);
    expect(await ids("?scope=followed")).toEqual(["d"]);
  });

  test("limit cuts with nextBefore and the next pages have the rest", async () => {
    const first = await (await get("?limit=2")).json();
    expect(short(first.items)).toEqual(["a", "b"]);
    expect(first.nextBefore).toBe("2027-03-05");
    const second = await (await get(`?limit=2&before=${first.nextBefore}`)).json();
    expect(short(second.items)).toEqual(["c", "d"]);
    const third = await (await get(`?limit=2&before=${second.nextBefore}`)).json();
    expect(short(third.items)).toEqual(["e"]);
    expect(third.nextBefore).toBeNull();
  });

  test("a cut that splits a day returns the whole day", async () => {
    const page = await (await get("?limit=1")).json();
    expect(short(page.items)).toEqual(["a", "b"]);
  });
});
