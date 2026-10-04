import { afterAll, describe, expect, test } from "bun:test";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { recordMoney } from "@/backend/FinancialService";
import { loadJobWorld } from "@/backend/jobWorld";
import { addDays } from "@/Domain/dates";
import type { JobOffer } from "@/types/jobTypes";

/**
 * Job offers and club changes (`.claude/rules/game/jobs.md`): the sacking leaves the manager without
 * a club, offers arrive while unemployed, the route answers them (owner only, expired → 409) and an
 * accepted offer switches club in one unit of work.
 */
describe("jobs: sacking, offers, changing club", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const create = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    return meta;
  };

  const ledgerSum = async (saveId: string) => {
    let sum = 0;
    for (const season of await saveService.listLedgerSeasons(saveId)) {
      for (const e of await saveService.getLedger(saveId, season)) sum += e.amount;
    }
    return sum;
  };

  const offerFor = async (meta: SaveMeta, squadId: string, expires: string): Promise<JobOffer> => {
    const index = await saveService.getSquadIndex(meta.id);
    const e = index.byId(squadId)!;
    return {
      id: `job_test_${squadId}`, squadId, clubName: e.name, leagueSlug: e.leagueSlug, leagueName: e.leagueSlug,
      window: "season_end", date: meta.currentDate!, expires, objective: null, budget: 0, expectedPosition: 1,
      leagueSize: 20, prestige: 0.5,
    };
  };

  const call = (key: string, saveId: string, path: string, method: string, token: string, body?: unknown, offerId = "") => {
    const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost${path}`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: { saveId, offerId } },
    ));
  };

  test("employed: decline, expired 409, accept switches club, staff, ledger, managers, tactics", async () => {
    const meta = await create();
    const { user, session } = devAutoLogin("jobs-route@test.local");
    const other = devAutoLogin("jobs-other@test.local");
    recordSaveOwnership(meta.id, user.id);
    const date = meta.currentDate!;
    // A starting balance, and an academy prospect at the old club.
    await recordMoney(saveService, meta.id, 2026, { leagueSlug: "premier_league", clubSlug: "33" },
      { date, kind: "broadcasting", amount: 5_000_000, label: "x" });
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    const kid = { ...old.players.at(-1)!, id: "academy_kid", age: 17 };
    await saveService.saveSquadById(meta.id, { ...old, youth: [kid] });

    const index = await saveService.getSquadIndex(meta.id);
    const target = index.inLeague("la_liga")[0]!.squadId;
    const declined = await offerFor(meta, index.inLeague("serie_a")[0]!.squadId, date);
    const expired = { ...(await offerFor(meta, index.inLeague("bundesliga")[0]!.squadId, addDays(date, -1))), id: "job_old" };
    const accepted = await offerFor(meta, target, addDays(date, 3));
    await saveService.updateMeta(meta.id, { jobOffers: [declined, expired, accepted] });

    const key = "/api/saves/:saveId/jobs/:offerId";
    const post = (id: string, body: unknown, token = session.token) =>
      call(key, meta.id, `/api/saves/${meta.id}/jobs/${id}`, "POST", token, body, id);
    expect((await post(accepted.id, { accept: true }, other.session.token)).status).toBe(404);
    expect((await post(accepted.id, {})).status).toBe(400);
    expect((await post("nope", { accept: true })).status).toBe(409);
    expect((await post(expired.id, { accept: true })).status).toBe(409);
    expect((await post(declined.id, { accept: false })).status).toBe(200);
    expect((await saveService.getMeta(meta.id))!.jobOffers!.map((o) => o.id)).toEqual([expired.id, accepted.id]);

    const get = await call("/api/saves/:saveId/jobs", meta.id, `/api/saves/${meta.id}/jobs`, "GET", session.token);
    const jobs = (await get.json()) as { reputation: number; offers: JobOffer[] };
    expect(jobs.reputation).toBeGreaterThan(0);
    expect(jobs.offers.map((o) => o.id)).toEqual([accepted.id]);

    const res = await post(accepted.id, { accept: true });
    expect(res.status).toBe(200);

    const after = (await saveService.getMeta(meta.id))!;
    expect(after.clubId).toBe(target);
    expect(after.leagueSlug).toBe("la_liga");
    expect(after.jobOffers).toEqual([]);
    expect(after.board).toMatchObject({ board: 60, fans: 60 });
    expect(after.board?.objective?.leagueSlug).toBe("la_liga");

    const oldNow = (await saveService.getSquadById(meta.id, "33"))!;
    expect(oldNow.staff).toBeUndefined();
    expect(oldNow.styleFamiliarity).toBeUndefined();
    expect(oldNow.youth).toBeUndefined();
    expect(oldNow.financialTier).toBeDefined();
    expect(oldNow.aiTransferBudget).toBeGreaterThan(0);
    const kidPromoted = oldNow.players.some((p) => p.id === "academy_kid");
    const kidFree = (await saveService.getFreeAgents(meta.id)).some((f) => f.player.id === "academy_kid");
    expect(kidPromoted || kidFree).toBe(true);

    const mine = (await saveService.getSquadById(meta.id, target))!;
    expect(Object.keys(mine.staff ?? {}).length).toBe(3);
    expect(mine.styleFamiliarity?.balanced).toBe(75);
    expect(mine.financialTier).toBeUndefined();
    expect(mine.aiTransferBudget).toBeUndefined();
    expect(mine.finances!.budget).toBeGreaterThan(0);
    expect(await ledgerSum(meta.id)).toBe(mine.finances!.budget);

    const tactics = (await saveService.getTactics(meta.id))!;
    expect(tactics.formation).toBe(after.formation!);
    expect(tactics.lineup.filter(Boolean).length).toBe(11);
    expect(tactics.lineup.every((id) => !id || mine.players.some((p) => p.id === id))).toBe(true);

    const managers = await saveService.getManagers(meta.id);
    const me = managers.find((m) => m.isPlayer)!;
    expect(me.squadId).toBe(target);
    expect(me.clubs?.map((c) => c.squadId)).toEqual(["33", target]);
    const clubs = managers.filter((m) => m.squadId).map((m) => m.squadId);
    expect(new Set(clubs).size).toBe(clubs.length);
    expect(managers.some((m) => !m.isPlayer && m.squadId === "33")).toBe(true);

    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.some((m) => m.category === "job" && m.kind === "hired")).toBe(true);

    // The career goes on at the new club.
    const day = await advanceOneDay(saveService, meta.id);
    expect(day.ok).toBe(true);
  }, 240_000);

  test("sacked: unemployed, old club AI, offers every two weeks, accepted from unemployment", async () => {
    const meta = await create();
    const { user, session } = devAutoLogin("jobs-unemployed@test.local");
    recordSaveOwnership(meta.id, user.id);
    await saveService.updateMeta(meta.id, { board: { ...meta.board!, board: 5 } });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.sacked).toBe(true);

    let after = (await saveService.getMeta(meta.id))!;
    expect(after.clubId).toBe("");
    expect(after.board).toBeUndefined();
    expect(after.unemployed).toMatchObject({ lastClubId: "33", since: meta.currentDate, sacking: { reason: "board" } });
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    expect(old.staff).toBeUndefined();
    expect(old.financialTier).toBeDefined();
    expect(await ledgerSum(meta.id)).toBe(0);
    const managers = await saveService.getManagers(meta.id);
    expect(managers.find((m) => m.isPlayer)!.squadId).toBe("");
    expect(managers.filter((m) => m.squadId === "33").length).toBe(1);

    // Unemployed days advance (no matches of his own); the next batch of offers arrives on schedule.
    await saveService.updateMeta(meta.id, { unemployed: { ...after.unemployed!, nextOfferDate: after.currentDate! } });
    const day = await advanceOneDay(saveService, meta.id);
    expect(day.ok).toBe(true);
    after = (await saveService.getMeta(meta.id))!;
    const offers = after.jobOffers ?? [];
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(offers.every((o) => o.window === "unemployed" && o.squadId !== "33")).toBe(true);
    expect(after.unemployed!.nextOfferDate).toBe(addDays(meta.currentDate!, 15));
    const inbox = await saveService.getInbox(meta.id);
    expect(inbox.filter((m) => m.category === "job" && m.kind === "offer").length).toBe(offers.length);

    const offer = offers[0]!;
    const res = await call("/api/saves/:saveId/jobs/:offerId", meta.id, `/api/saves/${meta.id}/jobs/${offer.id}`, "POST",
      session.token, { accept: true }, offer.id);
    expect(res.status).toBe(200);
    after = (await saveService.getMeta(meta.id))!;
    expect(after.clubId).toBe(offer.squadId);
    expect(after.unemployed).toBeUndefined();
    const mine = (await saveService.getSquadById(meta.id, offer.squadId))!;
    expect(await ledgerSum(meta.id)).toBe(mine.finances!.budget);
    const ms = await saveService.getManagers(meta.id);
    expect(ms.find((m) => m.isPlayer)!.squadId).toBe(offer.squadId);
    const clubs = ms.filter((m) => m.squadId).map((m) => m.squadId);
    expect(new Set(clubs).size).toBe(clubs.length);
    const inboxAfter = await saveService.getInbox(meta.id);
    expect(inboxAfter.some((m) => m.category === "job" && m.kind === "offer")).toBe(false);
  }, 240_000);

  test("world: every employer has a prestige in 0..1", async () => {
    const meta = await create();
    const index = await saveService.getSquadIndex(meta.id);
    const t0 = performance.now();
    const world = await loadJobWorld(saveService, meta.id, index, meta.activeLeagues ?? []);
    console.log(`job world: ${world.candidates.length} clubs in ${Math.round(performance.now() - t0)} ms`);
    expect(world.candidates.length).toBeGreaterThan(1000);
    expect(world.candidates.every((c) => c.prestige >= 0 && c.prestige <= 1)).toBe(true);
  }, 120_000);
});
