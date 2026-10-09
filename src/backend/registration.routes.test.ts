import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import type { RegistrationCompView } from "@/types/registrationTypes";

const HUMAN = "33";

describe("registration routes", () => {
  let saveId = "";
  let token = "";
  let other = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("registration-route@test.local");
    token = session.token;
    other = devAutoLogin("registration-other@test.local").session.token;
    recordSaveOwnership(saveId, user.id);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const call = (key: string, path: string, method = "GET", body?: unknown, tok = token, params: Record<string, string> = {}) => {
    const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost${path}`, {
        method, headers: { cookie: `fs_session=${tok}`, "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      { params: { saveId, ...params } },
    ));
  };
  const LIST = "/api/saves/:saveId/registration";
  const ONE = "/api/saves/:saveId/registration/:competition";
  const AUTO = "/api/saves/:saveId/registration/:competition/auto";
  const get = async () => (await (await call(LIST, `/api/saves/${saveId}/registration`)).json()) as { competitions: RegistrationCompView[] };

  test("GET: competitions of the club with rule, deadline, counters and rows", async () => {
    expect((await call(LIST, `/api/saves/${saveId}/registration`, "GET", undefined, other)).status).toBe(404);
    const data = await get();
    const pl = data.competitions.find((c) => c.slug === "premier_league")!;
    expect(pl.rule.id).toBe("premier_league");
    expect(pl.status.open).toBe(true);
    expect(pl.counts.counted).toBeLessThanOrEqual(25);
    expect(pl.rows.length).toBeGreaterThan(18);
    expect(pl.rows.filter((r) => r.registered).length).toBeGreaterThanOrEqual(18);
    expect(data.competitions.some((c) => c.slug === "cup_england")).toBe(true);
  }, 60_000);

  test("PUT and auto with the deadline open; errors", async () => {
    const pl = (await get()).competitions.find((c) => c.slug === "premier_league")!;
    const ids = pl.rows.filter((r) => r.registered && !r.free).map((r) => r.id);
    const removed = ids[0]!;
    const p = { competition: "premier_league" };
    const ok = await call(ONE, `/api/saves/${saveId}/registration/premier_league`, "PUT", { ids: ids.slice(1) }, token, p);
    expect(ok.status).toBe(200);
    const view = (await ok.json()) as RegistrationCompView;
    expect(view.manual).toBe(true);
    expect(view.rows.find((r) => r.id === removed)!.registered).toBe(false);
    const squad = (await saveService.getSquadById(saveId, HUMAN))!;
    expect(squad.registrations!.premier_league!.out).toEqual([removed]);

    expect((await call(ONE, `/api/saves/${saveId}/registration/premier_league`, "PUT", { ids: ["nobody"] }, token, p)).status).toBe(400);
    // Ten extra adults make the whole squad more than the 25 counted places.
    const extra = Array.from({ length: 10 }, (_, i) => ({ ...squad.players[0]!, id: `reg_extra_${i}`, age: 27 }));
    await saveService.saveSquadById(saveId, { ...squad, players: [...squad.players, ...extra] });
    const tooMany = [...squad.players, ...extra].map((x) => x.id);
    const bad = await call(ONE, `/api/saves/${saveId}/registration/premier_league`, "PUT", { ids: tooMany }, token, p);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("ruleViolation");
    expect((await call(ONE, `/api/saves/${saveId}/registration/ucl_x`, "PUT", { ids: [] }, token, { competition: "la_liga" })).status).toBe(404);

    const auto = await call(AUTO, `/api/saves/${saveId}/registration/premier_league/auto`, "POST", undefined, token, p);
    expect(auto.status).toBe(200);
    expect(((await auto.json()) as RegistrationCompView).manual).toBe(false);
  }, 60_000);

  test("match-setup swaps an unregistered starter; closed deadline refuses changes", async () => {
    const meta = (await saveService.getMeta(saveId))!;
    const fixtures = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    const first = fixtures.filter((f) => !f.played && (f.home === HUMAN || f.away === HUMAN)).sort((a, b) => a.date.localeCompare(b.date))[0]!;
    await saveService.updateMeta(saveId, { currentDate: first.date });
    const squad = (await saveService.getSquadById(saveId, HUMAN))!;
    const lineup = autoLineupDefaultFormation(squad, first.date);
    await saveService.saveTactics(saveId, { formation: "4-3-3", tactical_style: meta.tactical_style ?? "balanced", lineup });
    const pl = (await get()).competitions.find((c) => c.slug === "premier_league")!;
    const starter = lineup.find((id) => pl.rows.find((r) => r.id === id && r.registered && !r.free))!;
    const ids = pl.rows.filter((r) => r.registered && !r.free && r.id !== starter).map((r) => r.id);
    expect((await call(ONE, `/api/saves/${saveId}/registration/premier_league`, "PUT", { ids }, token, { competition: "premier_league" })).status).toBe(200);

    const setup = await apiRoutes["/api/match-setup"](Object.assign(
      new Request(`http://localhost/api/match-setup?saveId=${saveId}`, { headers: { cookie: `fs_session=${token}` } }),
    ));
    expect(setup.status).toBe(200);
    const body = (await setup.json()) as { injuredReplaced: { out: string; reason: string }[]; registered: { mine: string[]; opp: string[] }; oppLineup: string[]; myLineup: string[] };
    expect(body.injuredReplaced.some((r) => r.out === starter && r.reason === "unregistered")).toBe(true);
    expect(body.myLineup).not.toContain(starter);
    expect(body.registered.mine).not.toContain(starter);
    const opp = new Set(body.registered.opp);
    expect(body.oppLineup.every((id) => opp.has(id))).toBe(true);

    // October, past the arrival grace: the English window is closed.
    await saveService.updateMeta(saveId, { currentDate: "2026-10-10" });
    const closed = await call(AUTO, `/api/saves/${saveId}/registration/premier_league/auto`, "POST", undefined, token, { competition: "premier_league" });
    expect(closed.status).toBe(409);
    const err = (await closed.json()) as { error: string; opensOn?: string };
    expect(err.error).toBe("registrationClosed");
    expect(err.opensOn).toBe("2027-01-01");
  }, 120_000);
});
