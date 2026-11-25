import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { advanceOneDay } from "@/backend/advanceDay";
import { addDays } from "@/Domain/dates";

/** Naturalization (`.claude/rules/game/naturalization.md`): the manager's answer and the process ending in the day. */
describe("naturalization", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  }, 120_000);

  const call = (saveId: string, playerId: string, token: string, body: unknown) => {
    const handler = apiRoutes["/api/saves/:saveId/naturalization/:playerId" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/naturalization/${playerId}`, {
        method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: { saveId, playerId } },
    ));
  };

  test("support starts the process, which ends on its day with the second nationality", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const saveId = meta.id;
    const { user, session } = devAutoLogin("naturalization@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const today = meta.currentDate!;
    const squad = (await saveService.getSquadById(saveId, "33"))!;
    const foreign = squad.players.find((p) => p.nationality && p.nationality !== "England" && !p.national?.caps)!;

    // Nothing asked yet.
    expect((await call(saveId, foreign.id, session.token, { support: true })).status).toBe(404);
    expect((await call(saveId, foreign.id, session.token, { support: "yes" })).status).toBe(400);

    await saveService.updateSeat(saveId, seatId, {
      naturalizationAsks: [{ playerId: foreign.id, playerName: foreign.name, country: "England", expires: addDays(today, 30) }],
    });
    const res = await call(saveId, foreign.id, session.token, { support: true });
    expect(res.status).toBe(200);
    const after = (await saveService.getSquadById(saveId, "33"))!.players.find((p) => p.id === foreign.id)!;
    expect(after.naturalization?.country).toBe("England");
    expect((await saveService.getSeatMeta(saveId, seatId))!.naturalizationAsks ?? []).toEqual([]);
    // Answered once: a second answer has nothing to act on.
    expect((await call(saveId, foreign.id, session.token, { support: false })).status).toBe(404);

    // The process ends today: the day (run on today) gives him the second nationality.
    const s2 = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, {
      ...s2,
      players: s2.players.map((p) => (p.id === foreign.id ? { ...p, naturalization: { country: "England", since: addDays(today, -100), until: today } } : p)),
    });
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const done = (await saveService.getSquadById(saveId, "33"))!.players.find((p) => p.id === foreign.id)!;
    expect(done.secondNationality).toBe("England");
    expect(done.naturalization).toBeUndefined();
    const inbox = await saveService.getInbox(saveId, seatId);
    expect(inbox.some((m) => m.category === "player" && (m as { kind: string }).kind === "naturalized")).toBe(true);
  }, 300_000);
});
