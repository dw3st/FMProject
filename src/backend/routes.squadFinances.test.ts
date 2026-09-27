import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

// Design spec §2 "Brecha": all money on the player's club goes through the ledger
// (FinancialService.recordMoney); the squad PUT route must never let a client write `finances`
// directly. See .claude/rules/game/finances.md.
describe("PUT /api/saves/:saveId/squad/:league/:club ignores finances from the body", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a PUT with finances.budget in the body does not change the stored budget", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const before = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(before?.finances).toBeTruthy();
    const originalBudget = before!.finances!.budget;

    const { user, session } = devAutoLogin(`squad-finances-route-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const handler = apiRoutes["/api/saves/:saveId/squad/:league/:club"];

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/squad/${meta.leagueSlug}/${meta.clubId}`, {
        method: "PUT",
        headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ finances: { budget: originalBudget + 999_999_999 } }),
      }),
      { params: { saveId, league: meta.leagueSlug, club: meta.clubId } },
    );
    const res = await handler(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { finances?: { budget: number } };
    // The response itself never reflects the client's finances — it echoes the untouched squad.
    expect(body.finances?.budget).toBe(originalBudget);

    const after = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);
    expect(after?.finances?.budget).toBe(originalBudget);
  }, 60_000);
});
