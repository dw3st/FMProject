import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import { wageFactorOf } from "@/Domain/finance/wages";
import { squadStaffWages } from "@/Domain/staff/staff";

describe("staff routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner-only, starting staff, market, hire, fire, ledger line", async () => {
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

    // The human club starts with three professionals.
    const start = await (await call("", "GET", session.token)).json() as any;
    expect(Object.keys(start.staff).sort()).toEqual(["assistant", "fitness", "scout"]);
    expect(start.weeklyTotal).toBeGreaterThan(0);

    // Market: 5 per role, deterministic.
    const market = await (await call("/market", "GET", session.token)).json() as any;
    for (const role of ["assistant", "fitness", "scout"]) expect(market.candidates[role]).toHaveLength(5);
    const again = await (await call("/market", "GET", session.token)).json() as any;
    expect(again).toEqual(market);

    // Validation.
    expect((await call("/hire", "POST", session.token, { role: "cook", candidateId: "x" })).status).toBe(400);
    expect((await call("/hire", "POST", session.token, { role: "fitness", candidateId: "nope" })).status).toBe(404);

    // Hire replaces the current one.
    const pick = market.candidates.fitness[0];
    const hired = await (await call("/hire", "POST", session.token, { role: "fitness", candidateId: pick.id })).json() as any;
    expect(hired.staff.fitness.id).toBe(pick.id);
    const saved = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    expect(saved.staff!.fitness!.id).toBe(pick.id);

    // The Monday ledger carries a staff line equal to the staff bill.
    const entries = computeAdvanceDayMoney({ currentDate: "2027-03-01", playerSquad: saved, homeFixturesToday: [] });
    const line = entries.find((e) => e.kind === "staff");
    expect(line).toBeDefined();
    expect(-line!.amount).toBe(squadStaffWages(saved.staff, wageFactorOf(saved)));
    expect(computeAdvanceDayMoney({ currentDate: "2027-03-02", playerSquad: saved, homeFixturesToday: [] }).some((e) => e.kind === "staff")).toBe(false);

    // Fire leaves the role vacant.
    const fired = await (await call("/fire", "POST", session.token, { role: "fitness" })).json() as any;
    expect(fired.staff.fitness).toBeUndefined();
    expect(fired.effects.injuryMult).toBeGreaterThan(1); // vacant = rating 3
  }, 60_000);
});
