import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { saveRoutes } from "@/backend/saves";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { GAME_VERSION } from "@/Domain/saveVersion";

/** #155: a new save records the game version; the save list flags saves from older versions. */
describe("save version", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const { session } = devAutoLogin("save-version@test.local");
  const headers = { cookie: `fs_session=${session.token}`, "content-type": "application/json" };
  const list = async () => {
    const res = await saveRoutes["/api/saves"](new Request("http://localhost/api/saves", { headers }));
    expect(res.status).toBe(200);
    return (await res.json()) as (SaveMeta & { compatible: boolean })[];
  };

  test("createSave stores the version and the list reports compatibility", async () => {
    const res = await saveRoutes["/api/saves"](new Request("http://localhost/api/saves", {
      method: "POST",
      headers,
      body: JSON.stringify({
        leagueSlug: "premier_league", leagueName: "Premier League",
        clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      }),
    }));
    expect(res.status).toBe(201);
    const meta = (await res.json()) as SaveMeta;
    created.push(meta.id);
    expect((await saveService.getMeta(meta.id))?.gameVersion).toBe(GAME_VERSION);

    let entry = (await list()).find((m) => m.id === meta.id);
    expect(entry?.gameVersion).toBe(GAME_VERSION);
    expect(entry?.compatible).toBe(true);

    await saveService.updateMeta(meta.id, { gameVersion: "4.21.2" });
    entry = (await list()).find((m) => m.id === meta.id);
    expect(entry?.compatible).toBe(false);

    await saveService.updateMeta(meta.id, { gameVersion: undefined });
    entry = (await list()).find((m) => m.id === meta.id);
    expect(entry?.compatible).toBe(false);
  }, 120_000);
});
