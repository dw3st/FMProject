import { ownSolo, soloMeta, updateSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";

/** `POST /api/saves/:id/staff/slot-request` (`.claude/rules/game/staff.md` → "Vaga a mais pela diretoria"). */
describe("staff slot request route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("approved with the board at 60, refused below with a cooldown", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("staff-slot@test.local");
    await ownSolo(saveId, user.id);
    const post = (body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/staff/slot-request" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/staff/slot-request`, {
          method: "POST",
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
    };

    expect((await post({ role: "nope" })).status).toBe(400);
    // Field scouts start empty: the role has room, nothing to ask.
    expect(await (await post({ role: "fieldScout" })).json()).toMatchObject({ error: "notFull" });

    const board = (await soloMeta(saveId))!.board!;
    await updateSolo(saveId, { board: { ...board, board: 60 } });
    const ok = await post({ role: "medic" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ approved: true, extra: 1, limit: 2 });
    expect((await saveService.getSquadById(saveId, "33"))!.staff!.extraSlots).toEqual({ medic: 1 });

    await updateSolo(saveId, { board: { ...board, board: 40 } });
    // The medic role now has room again (2 places, 1 medic).
    expect(await (await post({ role: "medic" })).json()).toMatchObject({ error: "notFull" });
    const low = await post({ role: "analyst" });
    expect(low.status).toBe(409);
    const lowBody = await low.json() as any;
    expect(lowBody.error).toBe("board_low");
    expect(lowBody.view.limits.analyst.request).toMatchObject({ canAsk: false, blocked: "cooldown" });
    await updateSolo(saveId, { board: { ...board, board: 90 } });
    expect(await (await post({ role: "analyst" })).json()).toMatchObject({ error: "cooldown" });
  }, 240_000);
});
