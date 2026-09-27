import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { applyBroadcasting } from "@/backend/FinancialService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

/**
 * `GET /api/saves/:saveId/ledger` — Task 7 of the prizes-and-finances plan. See design spec §2
 * "Extrato" and §4.
 */
describe("GET /api/saves/:saveId/ledger", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  async function newOwnedSave(emailSuffix: string) {
    let meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    meta = await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
    const { user, session } = devAutoLogin(`ledger-route-${emailSuffix}@test.local`);
    recordSaveOwnership(meta.id, user.id);
    return { meta, session };
  }

  const handler = () => apiRoutes["/api/saves/:saveId/ledger"];

  test("default season (no query) returns the player's current league year with totals/weekly/balance", async () => {
    const { meta, session } = await newOwnedSave("default");
    saveId = meta.id;

    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);
    const squad = await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId);

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/ledger`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId } },
    );
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      season: number; seasons: number[];
      entries: Array<{ kind: string; amount: number }>;
      totals: Record<string, number>;
      weekly: Array<{ weekStart: string; net: number }>;
      balance: number;
    };

    expect(body.season).toBe(leagueMeta!.year);
    expect(body.seasons).toContain(leagueMeta!.year);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.kind).toBe("broadcasting");
    expect(body.totals.broadcasting).toBe(squad!.finances!.budget);
    expect(body.balance).toBe(squad!.finances!.budget);
    expect(body.weekly).toHaveLength(1);
    expect(body.weekly[0]!.net).toBe(squad!.finances!.budget);
  }, 60_000);

  test("?season= an explicit known year returns the same ledger", async () => {
    const { meta, session } = await newOwnedSave("explicit");
    saveId = meta.id;
    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/ledger?season=${leagueMeta!.year}`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId } },
    );
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { season: number };
    expect(body.season).toBe(leagueMeta!.year);
  }, 60_000);

  test("?season= a year with no ledger file returns 404", async () => {
    const { meta, session } = await newOwnedSave("missing-season");
    saveId = meta.id;
    const leagueMeta = await saveService.getLeagueMeta(saveId, meta.leagueSlug);

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/ledger?season=${leagueMeta!.year + 50}`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId } },
    );
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(404);
  }, 60_000);

  test("?season= a non-numeric value returns 400", async () => {
    const { meta, session } = await newOwnedSave("bad-season");
    saveId = meta.id;

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/ledger?season=not-a-number`, {
        headers: { cookie: `fs_session=${session.token}` },
      }),
      { params: { saveId } },
    );
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(400);
  }, 60_000);

  test("no session cookie returns 401", async () => {
    const { meta } = await newOwnedSave("unauth");
    saveId = meta.id;

    const req = Object.assign(new Request(`http://localhost/api/saves/${saveId}/ledger`), {
      params: { saveId },
    });
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(401);
  }, 60_000);

  test("a non-owner's session returns 404 (save not found)", async () => {
    const { meta } = await newOwnedSave("owner");
    saveId = meta.id;
    const { session: otherSession } = devAutoLogin("ledger-route-not-the-owner@test.local");

    const req = Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/ledger`, {
        headers: { cookie: `fs_session=${otherSession.token}` },
      }),
      { params: { saveId } },
    );
    const res = await handler()(req as Request & { params: Record<string, string> });
    expect(res.status).toBe(404);
  }, 60_000);
});
