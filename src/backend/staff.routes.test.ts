import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import { roleLimit, squadStaffWages } from "@/Domain/staff/staff";

describe("staff routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner-only, starting staff, fire, ledger line", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("staff-route@test.local");
    const other = devAutoLogin("staff-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown) => {
      const key = `/api/saves/:saveId/staff${path}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/staff${path}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    // Not the owner: indistinguishable from a missing save.
    expect((await call("", "GET", other.session.token)).status).toBe(404);

    // The human club starts with every role (coaches to the tier limit, no field scouts).
    const start = await (await call("", "GET", session.token)).json() as any;
    const saved = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    const roles = (start.staff.members as { role: string }[]).map((m) => m.role);
    for (const r of ["assistant", "fitness", "goalkeeping", "medic", "analyst", "scout", "groundskeeper"]) {
      expect(roles.filter((x) => x === r)).toHaveLength(1);
    }
    expect(roles.filter((x) => x === "coach")).toHaveLength(roleLimit(saved, "coach"));
    expect(roles.filter((x) => x === "fieldScout")).toHaveLength(0);
    expect(start.weeklyTotal).toBeGreaterThan(0);

    // The weekly market is gone (the staff pool replaces it).
    expect((await call("/market", "GET", session.token)).status).toBe(410);

    // The Monday ledger carries a staff line equal to the contracts' wages.
    const entries = computeAdvanceDayMoney({ currentDate: "2027-03-01", playerSquad: saved, homeFixturesToday: [] });
    const line = entries.find((e) => e.kind === "staff");
    expect(line).toBeDefined();
    expect(-line!.amount).toBe(squadStaffWages(saved.staff));
    expect(computeAdvanceDayMoney({ currentDate: "2027-03-02", playerSquad: saved, homeFixturesToday: [] }).some((e) => e.kind === "staff")).toBe(false);

    // Validation and fire: the role stays vacant (2 stars = the old rating 3).
    expect((await call("/fire", "POST", session.token, { role: "cook" })).status).toBe(400);
    expect((await call("/fire", "POST", session.token, { memberId: "nope" })).status).toBe(404);
    const fitness = (start.staff.members as { id: string; role: string }[]).find((m) => m.role === "fitness")!;
    const fired = await (await call("/fire", "POST", session.token, { memberId: fitness.id })).json() as any;
    expect((fired.staff.members as { role: string }[]).some((m) => m.role === "fitness")).toBe(false);
    expect(fired.effects.injuryMult).toBeGreaterThan(1);
  }, 60_000);
});
