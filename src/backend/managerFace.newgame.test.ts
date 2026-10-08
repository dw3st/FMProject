import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import { saveRoutes } from "@/backend/saves";
import { devAutoLogin } from "@/backend/auth/AuthService";
import type { ManagerFace } from "@/Domain/faces/managerFace";

/** New game (Etapa 31b): the manager's avatar is saved as parameters; invalid ones are a 400. */
describe("POST /api/saves with the manager's avatar", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const { session } = devAutoLogin("manager-face@test.local");
  const post = (manager: unknown) => saveRoutes["/api/saves"](new Request("http://localhost/api/saves", {
    method: "POST",
    headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      manager,
    }),
  }));

  test("an invalid face is refused before anything is written", async () => {
    for (const face of [{ seed: "1" }, { seed: 1, skin: 9 }, { seed: 1, svg: "<svg/>" }, null]) {
      const res = await post({ name: "Zé", nationalityIso: "br", backgroundId: "former-player", face });
      expect(res.status).toBe(400);
    }
  });

  test("the picked face is stored in the save meta", async () => {
    const face: ManagerFace = { seed: 1234, skin: 6, hairColor: "black", hairLength: "short", beard: "stubble", glasses: true };
    const res = await post({ name: "Zé", nationalityIso: "br", backgroundId: "former-player", face });
    expect(res.status).toBe(201);
    const meta = (await res.json()) as SaveMeta;
    created.push(meta.id);
    const stored = await saveService.getMeta(meta.id);
    expect(stored?.manager?.face).toEqual(face);
  }, 120_000);
});
