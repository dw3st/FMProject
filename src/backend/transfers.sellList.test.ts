import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

/**
 * M3: the sell-list POST is a read-modify-write over the save's market file. Without a lock, two
 * concurrent toggles for the SAME save can each read the list before either writes, and the
 * second write silently discards the first toggle (lost update). `withSaveLock` serialises them.
 */
describe("POST /api/saves/:saveId/sell-list is serialised per save (M3)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("two concurrent toggles for different players both land in the final list", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(squad?.players?.length).toBeGreaterThanOrEqual(2);
    const [playerA, playerB] = squad!.players;

    const { user, session } = devAutoLogin(`sell-list-lock-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const handler = apiRoutes["/api/saves/:saveId/sell-list"];

    const post = (playerId: string) =>
      handler(
        Object.assign(
          new Request(`http://localhost/api/saves/${saveId}/sell-list`, {
            method: "POST",
            headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
            body: JSON.stringify({ playerId }),
          }),
          { params: { saveId } },
        ) as Request & { params: Record<string, string> },
      );

    const [resA, resB] = await Promise.all([post(playerA!.id), post(playerB!.id)]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const getRes = await handler(
      Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/sell-list`, {
          method: "GET",
          headers: { cookie: `fs_session=${session.token}` },
        }),
        { params: { saveId } },
      ) as Request & { params: Record<string, string> },
    );
    const finalList = (await getRes.json()) as { playerId: string }[];
    const ids = finalList.map((c) => c.playerId);
    expect(ids).toContain(playerA!.id);
    expect(ids).toContain(playerB!.id);
    expect(finalList).toHaveLength(2);

    // Only the human club's own players; nobody while unemployed (`.claude/rules/game/jobs.md`).
    const index = await saveService.getSquadIndex(saveId);
    const other = await saveService.getSquadById(saveId, index.inLeague("la_liga")[0]!.squadId);
    expect((await post(other!.players[0]!.id)).status).toBe(400);
    const m = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, { clubId: "" });
    expect((await post(playerA!.id)).status).toBe(409);
    await saveService.updateMeta(saveId, { clubId: m.clubId });
  }, 60_000);
});
