import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { saveRoutes } from "@/backend/saves";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

describe("style familiarity: career start + training focus", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("createSave seeds the human club only; PUT style_focus validates and persists", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
      tactical_style: "possession",
    });
    saveId = meta.id;
    const mine = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(mine?.styleFamiliarity?.possession).toBe(70);
    expect(mine?.styleFamiliarity?.high_press).toBe(50);
    const index = await saveService.getSquadIndex(saveId);
    const otherRow = index.inLeague(meta.leagueSlug).find((r) => r.squadId !== mine!.id)!;
    const other = await saveService.getSquadById(saveId, otherRow.squadId);
    expect(other?.styleFamiliarity).toBeUndefined();

    const { user, session } = devAutoLogin(`familiarity-route-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const put = (body: unknown) => saveRoutes["/api/saves/:id"](Object.assign(
      new Request(`http://localhost/api/saves/${saveId}`, {
        method: "PUT",
        headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: { id: saveId } },
    ) as Request & { params: Record<string, string> });

    expect((await put({ style_focus: "nonsense" })).status).toBe(400);
    const ok = await put({ style_focus: "long_ball" });
    expect(ok.status).toBe(200);
    expect((await saveService.getMeta(saveId))?.style_focus).toBe("long_ball");
  }, 120_000);
});
