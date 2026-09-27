import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

// Design spec §2 "Brecha": all money on the player's club goes through the ledger
// (FinancialService.recordMoney); the squad PUT route must never let a client write `finances`
// directly. See .claude/rules/game/finances.md.
//
// L4 hardening: the route used to re-write the squad it had just read (with the body's
// `finances` discarded) back to disk — a pointless, UNLOCKED write. Re-writing a stale in-memory
// copy risked clobbering a concurrent write to the same squad (e.g. advance-day, a transfer) that
// landed between this route's read and its write. The fix makes the PUT a true no-op: it never
// calls `saveSquad` at all, it only echoes the current squad.
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

  test("the route never writes the squad — a concurrent write's field is never clobbered (L3)", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    const { user, session } = devAutoLogin(`squad-finances-route-nowrite-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const handler = apiRoutes["/api/saves/:saveId/squad/:league/:club"];

    // Prove the route makes NO call to saveSquad at all (a stale-copy write would silently
    // "work" in a single-threaded test — the real risk is only visible under concurrency — so
    // asserting zero calls is the direct, deterministic way to prove the fix).
    const originalSaveSquad = saveService.saveSquad.bind(saveService);
    let saveSquadCalls = 0;
    saveService.saveSquad = (async (...args: Parameters<typeof originalSaveSquad>) => {
      saveSquadCalls++;
      return originalSaveSquad(...args);
    }) as typeof saveService.saveSquad;

    try {
      const req = Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/squad/${meta.leagueSlug}/${meta.clubId}`, {
          method: "PUT",
          headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
          body: JSON.stringify({ finances: { budget: 123 }, name: "Hijacked FC" }),
        }),
        { params: { saveId, league: meta.leagueSlug, club: meta.clubId } },
      );
      const res = await handler(req as Request & { params: Record<string, string> });
      expect(res.status).toBe(200);
    } finally {
      saveService.saveSquad = originalSaveSquad;
    }

    expect(saveSquadCalls).toBe(0);
  }, 60_000);
});
