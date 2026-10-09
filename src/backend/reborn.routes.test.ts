import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { RetiredPlayer, RosterPlayer } from "@/types/playerTypes";

describe("reborn routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner check, decline, accept into the academy, closed offer, full academy", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("reborn-route@test.local");
    const other = devAutoLogin("reborn-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (key: string, path: string, method: string, token: string, body?: unknown) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, {
          method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: { saveId, retiredId: path.split("/")[5] ?? "" } },
      ));
    };
    const key = "/api/saves/:saveId/reborn/:retiredId";
    const mkRetired = (id: string): RetiredPlayer => ({
      id, name: `Legend ${id}`, nationality: "Brazil", positions: ["ST"], preferredFoot: "right",
      profile: { summary: "s", archetype: "a" }, retiredOn: "2027-06-01", squadId: meta.clubId, age: 39,
      wasWorldClass: true, appearances: 30, goals: 20, rebornOffer: "pending",
      statsAtRetirement: {
        passing: 6, vision: 7, finishing: 10, dribbling: 8, speed: 5, acceleration: 6, tackling: 2,
        pressing: 3, stamina: 5, heading: 9, strength: 7, reflex: 0, jump: 0,
      } as RosterPlayer["stats"],
    });
    await saveService.writeRetired(saveId, [mkRetired("a"), mkRetired("b"), mkRetired("c")]);

    expect((await call(key, `/api/saves/${saveId}/reborn/a`, "POST", other.session.token, { accept: true })).status).toBe(404);

    // Retired list: owner only, newest first, with the last club's name, paginated, `mine` filter.
    const rKey = "/api/saves/:saveId/retired";
    const list = async (qs = "") => {
      const res = await call(rKey, `/api/saves/${saveId}/retired${qs}`, "GET", session.token);
      expect(res.status).toBe(200);
      return (await res.json()) as { total: number; items: (RetiredPlayer & { clubName: string | null })[] };
    };
    expect((await call(rKey, `/api/saves/${saveId}/retired`, "GET", other.session.token)).status).toBe(404);
    const all = await list();
    expect(all.total).toBe(3);
    expect(all.items.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(typeof all.items[0]!.clubName).toBe("string");
    expect("statsAtRetirement" in all.items[0]!).toBe(false);
    const page = await list("?offset=1&limit=1");
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.id)).toEqual(["b"]);
    await saveService.writeRetired(saveId, [{ ...mkRetired("x"), squadId: "not-mine" }, mkRetired("a"), mkRetired("b"), mkRetired("c")]);
    expect((await list()).total).toBe(4);
    const mine = await list("?mine=1");
    expect(mine.total).toBe(3);
    expect(mine.items.map((r) => r.id)).toEqual(["c", "b", "a"]);
    await saveService.writeRetired(saveId, [mkRetired("a"), mkRetired("b"), mkRetired("c")]);
    for (const bad of ["?limit=0", "?limit=101", "?offset=-1", "?limit=abc"]) {
      expect((await call(rKey, `/api/saves/${saveId}/retired${bad}`, "GET", session.token)).status).toBe(400);
    }
    expect((await call(key, `/api/saves/${saveId}/reborn/a`, "POST", session.token, {})).status).toBe(400);
    expect((await call(key, `/api/saves/${saveId}/reborn/zzz`, "POST", session.token, { accept: true })).status).toBe(404);

    // Decline closes the offer.
    expect((await call(key, `/api/saves/${saveId}/reborn/a`, "POST", session.token, { accept: false })).status).toBe(200);
    expect((await call(key, `/api/saves/${saveId}/reborn/a`, "POST", session.token, { accept: true })).status).toBe(409);

    // Accept: new 17-year-old in the academy.
    const ref = (await saveService.resolveSquadId(saveId, meta.clubId))!;
    const res = await call(key, `/api/saves/${saveId}/reborn/b`, "POST", session.token, { accept: true });
    expect(res.status).toBe(200);
    const squad = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    const born = squad.youth!.find((p) => p.reborn?.fromId === "b")!;
    expect(born.age).toBe(17);
    expect(born.name).toBe("Legend b");
    expect(born.contract?.until).toBeTruthy();
    expect(born.academyOf).toBe(squad.id);
    expect((await saveService.getRetired(saveId)).find((r) => r.id === "b")!.rebornOffer).toBe("accepted");

    // Full academy blocks the accept (offer stays pending).
    const filler = Array.from({ length: YOUTH.MAX_SIZE }, (_, i) => ({ ...born, id: `f${i}`, reborn: undefined }));
    await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, youth: filler });
    const full = await call(key, `/api/saves/${saveId}/reborn/c`, "POST", session.token, { accept: true });
    expect(full.status).toBe(400);
    expect((await full.json() as any).error).toBe("youthFull");
    expect((await saveService.getRetired(saveId)).find((r) => r.id === "c")!.rebornOffer).toBe("pending");
  }, 60_000);
});
