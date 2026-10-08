import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import { contractEndFor } from "@/Domain/contracts/contracts";
import { wageFactorOf } from "@/Domain/finance/wages";
import { memberStars, roleLimit, squadStaffWages, staffWageFor } from "@/Domain/staff/staff";
import { COACH_AREAS } from "@/Domain/staff/staffTypes";

/**
 * Coaching-staff routes (`.claude/rules/game/staff.md`): owner only, the staff view, the pool search,
 * the role limit, firing with severance (ledger sum = balance, back to the pool), hiring from the pool,
 * renewal limits and the coach area assignments.
 */
describe("staff routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("view, pool, limits, fire, hire, renew, areas", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("staff-route@test.local");
    const other = devAutoLogin("staff-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown) => {
      const [route, query] = path.split("?");
      const key = `/api/saves/:saveId/staff${route}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/staff${route}${query ? `?${query}` : ""}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    // Owner only (indistinguishable from a missing save).
    expect((await call("", "GET", other.session.token)).status).toBe(404);
    expect((await call("/pool", "GET", other.session.token)).status).toBe(404);

    // The starting staff: every role but field scouts, coaches up to the tier's limit.
    const view = await (await call("", "GET", session.token)).json() as any;
    const saved = (await saveService.getSquadById(saveId, "33"))!;
    const roles = (view.members as { role: string }[]).map((m) => m.role);
    for (const r of ["assistant", "fitness", "goalkeeping", "medic", "analyst", "scout", "groundskeeper"]) {
      expect(roles.filter((x) => x === r)).toHaveLength(1);
    }
    const coachMax = roleLimit(saved, "coach");
    expect(view.limits.coach).toEqual({ used: coachMax, max: coachMax });
    expect(view.limits.fieldScout).toEqual({ used: 0, max: 4 });
    expect(view.members.length).toBe(7 + coachMax);
    expect(view.areas).toHaveLength(7);
    expect(view.weeklyTotal).toBe(squadStaffWages(saved.staff));

    // The Monday ledger carries a staff line equal to the contracts' wages.
    const entries = computeAdvanceDayMoney({ currentDate: "2027-03-01", playerSquad: saved, homeFixturesToday: [] });
    expect(-entries.find((e) => e.kind === "staff")!.amount).toBe(squadStaffWages(saved.staff));

    // Pool search.
    const coaches = await (await call("/pool?role=coach&minStars=3", "GET", session.token)).json() as any;
    expect(coaches.items.length).toBeGreaterThan(1);
    expect(coaches.items.every((m: any) => m.role === "coach" && m.stars >= 3)).toBe(true);
    expect((await call("/pool?role=chef", "GET", session.token)).status).toBe(400);
    expect((await call("/pool?limit=500", "GET", session.token)).status).toBe(400);

    // Coaches at the limit: hiring another is refused.
    const candidate = coaches.items[0];
    expect((await call("/hire", "POST", session.token, { memberId: candidate.id, years: 1 })).status).toBe(409);
    expect((await call("/hire", "POST", session.token, { memberId: "nobody", years: 1 })).status).toBe(404);

    // Firing a coach: severance in the ledger, ledger sum = balance, back in the pool.
    expect((await call("/fire", "POST", session.token, { role: "cook" })).status).toBe(400);
    expect((await call("/fire", "POST", session.token, { memberId: "nobody" })).status).toBe(404);
    const fired = view.members.find((m: any) => m.role === "coach");
    const fireRes = await call("/fire", "POST", session.token, { memberId: fired.id });
    expect(fireRes.status).toBe(200);
    const fireBody = await fireRes.json() as any;
    expect(fireBody.severance).toBeGreaterThan(0);
    expect(fireBody.limits.coach.used).toBe(coachMax - 1);
    const season = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    const line = (await saveService.getLedger(saveId, season)).find((e) => e.kind === "staff" && e.ref?.stage === "severance");
    expect(line!.amount).toBe(-fireBody.severance);
    let total = 0;
    for (const s of await saveService.listLedgerSeasons(saveId)) {
      total += (await saveService.getLedger(saveId, s)).reduce((a, e) => a + e.amount, 0);
    }
    expect(total).toBe((await saveService.getSquadById(saveId, "33"))!.finances!.budget);
    const pooled = (await saveService.getStaffPool(saveId, meta.currentDate!)).members.find((m) => m.id === fired.id);
    expect(pooled).toBeDefined();
    expect(pooled!.contract).toBeUndefined();

    // Hire another coach for 2 seasons: contract end and frozen wage.
    expect((await call("/hire", "POST", session.token, { memberId: candidate.id, years: 4 })).status).toBe(400);
    expect((await call("/hire", "POST", session.token, { memberId: candidate.id, years: 2 })).status).toBe(200);
    const club = (await saveService.getSquadById(saveId, "33"))!;
    const hired = club.staff!.members.find((m) => m.id === candidate.id)!;
    const freshMeta = (await saveService.getMeta(saveId))!;
    const seasonEnd = freshMeta.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.end;
    expect(hired.contract!.until).toBe(contractEndFor(freshMeta.currentDate!, seasonEnd, 2));
    expect(hired.contract!.wage).toBe(staffWageFor("coach", memberStars(hired), wageFactorOf(club)));
    expect((await saveService.getStaffPool(saveId, meta.currentDate!)).members.some((m) => m.id === candidate.id)).toBe(false);

    // Areas: a manual choice shows; a coach leads at most two areas; only coaches, only field areas.
    expect((await call("/areas", "PUT", session.token, { setPieces: candidate.id })).status).toBe(200);
    const areaView = await (await call("", "GET", session.token)).json() as any;
    expect(areaView.areas.find((a: any) => a.area === "setPieces").memberId).toBe(candidate.id);
    const three = Object.fromEntries(COACH_AREAS.slice(0, 3).map((a) => [a, candidate.id]));
    expect((await call("/areas", "PUT", session.token, three)).status).toBe(400);
    expect((await call("/areas", "PUT", session.token, { goalkeeping: candidate.id })).status).toBe(400);
    const medicId = areaView.members.find((m: any) => m.role === "medic").id;
    expect((await call("/areas", "PUT", session.token, { defending: medicId })).status).toBe(400);
    expect((await call("/areas", "PUT", session.token, { setPieces: null })).status).toBe(200);

    // Renewal: 3 more seasons on a 2-season contract is too long; 1 is fine.
    expect((await call("/renew", "POST", session.token, { memberId: candidate.id, years: 3 })).status).toBe(400);
    expect((await call("/renew", "POST", session.token, { memberId: candidate.id, years: 1 })).status).toBe(200);

    // Firing by role leaves it vacant (2 stars = the old rating 3).
    const fitnessFired = await (await call("/fire", "POST", session.token, { role: "fitness" })).json() as any;
    expect((fitnessFired.members as { role: string }[]).some((m) => m.role === "fitness")).toBe(false);
    expect(fitnessFired.effects.injuryMult).toBeGreaterThan(1);

    // Unemployed: no hiring, the pool still lists.
    await saveService.updateMeta(saveId, { clubId: "" });
    expect((await call("/hire", "POST", session.token, { memberId: coaches.items[1].id, years: 1 })).status).toBe(409);
    expect((await call("/pool", "GET", session.token)).status).toBe(200);
  }, 240_000);
});
