import { afterAll, describe, expect, test } from "bun:test";
import { compensationFee } from "@/Domain/managers/managerContract";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { recordMoney } from "@/backend/FinancialService";
import { loadJobWorld, releaseHumanClub, seasonEndExpiry } from "@/backend/jobWorld";
import { MAX_SQUAD, MIN_BY_ROLE, roleOf } from "@/Domain/contracts/freeAgents";
import { overallAvg } from "@/Domain/playerRating";
import type { RetiredPlayer } from "@/types/playerTypes";
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
      { params: { saveId, offerId, retiredId: path.split("/")[5] ?? "" } },
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
    // D3: the offer carries the compensation the new club pays (what the card shows).
    const offerCompensation = compensationFee((await saveService.getMeta(meta.id))!.managerContract, date);
    const accepted = { ...(await offerFor(meta, target, addDays(date, 3))), budget: 7_777_777, compensation: offerCompensation };
    await saveService.updateMeta(meta.id, {
      jobOffers: [declined, expired, accepted],
      youthCallUps: { u21: ["x"] }, youthCallUpsSkipped: { u21: { date, players: ["x"] } },
    });
    // A reborn offer pending at the old club, and the new club's best player out of contract this season.
    const legend = (id: string): RetiredPlayer => ({
      id, name: id, nationality: "Brazil", positions: ["ST"], preferredFoot: "right",
      profile: { summary: "s", archetype: "a" } as RetiredPlayer["profile"], retiredOn: date, squadId: "33", age: 39,
      wasWorldClass: true, appearances: 1, goals: 1, rebornOffer: "pending",
      statsAtRetirement: old.players[0]!.stats,
    });
    await saveService.writeRetired(meta.id, [legend("legend_a")]);
    const laLigaEnd = meta.activeLeagues!.find((l) => l.leagueSlug === "la_liga")!.end;
    const targetSquad = (await saveService.getSquadById(meta.id, target))!;
    const star = [...targetSquad.players].filter((p) => p.age < 30).sort((a, b) => overallAvg(b) - overallAvg(a))[0]!;
    await saveService.saveSquadById(meta.id, {
      ...targetSquad,
      players: targetSquad.players.map((p) => (p.id === star.id ? { ...p, contract: { ...p.contract!, until: laLigaEnd } } : p)),
    });

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

    // D3 (Etapa 25): leaving mid-contract, the new club compensates the old one out of the arrival.
    const compensation = offerCompensation;
    expect(compensation).toBeGreaterThan(0);
    const res = await post(accepted.id, { accept: true });
    expect(res.status).toBe(200);

    const after = (await saveService.getMeta(meta.id))!;
    expect(after.clubId).toBe(target);
    expect(after.leagueSlug).toBe("la_liga");
    expect(after.jobOffers).toEqual([]);
    expect(after.youthCallUps).toBeUndefined();
    expect(after.youthCallUpsSkipped).toBeUndefined();
    expect(after.board).toMatchObject({ board: 60, fans: 60 });
    expect(after.board?.objective?.leagueSlug).toBe("la_liga");
    const ll = after.activeLeagues!.find((l) => l.leagueSlug === "la_liga")!;
    expect(after.jobsMidSeason).toBe(`${ll.year}-${String((ll.year + 1) % 100).padStart(2, "0")}`);
    // The old club's reborn offer closed, and cannot be accepted from the new club.
    expect((await saveService.getRetired(meta.id)).find((r) => r.id === "legend_a")!.rebornOffer).toBe("expired");
    await saveService.writeRetired(meta.id, [{ ...legend("legend_b") }]);
    const reborn = await call("/api/saves/:saveId/reborn/:retiredId", meta.id, `/api/saves/${meta.id}/reborn/legend_b`, "POST",
      session.token, { accept: true });
    expect(reborn.status).toBe(409);

    const oldNow = (await saveService.getSquadById(meta.id, "33"))!;
    expect(oldNow.staff).toBeUndefined();
    expect(oldNow.styleFamiliarity).toBeUndefined();
    // Morale ends with the club (`.claude/rules/game/morale.md`).
    expect(oldNow.moraleClub).toBeUndefined();
    expect(oldNow.players.every((p) => p.morale === undefined && !p.moraleLog)).toBe(true);
    expect(oldNow.youth).toBeUndefined();
    expect(oldNow.financialTier).toBeDefined();
    expect(oldNow.aiTransferBudget).toBeGreaterThan(0);
    const kidPromoted = oldNow.players.some((p) => p.id === "academy_kid");
    const kidFree = (await saveService.getFreeAgents(meta.id)).some((f) => f.player.id === "academy_kid");
    expect(kidPromoted || kidFree).toBe(true);

    const mine = (await saveService.getSquadById(meta.id, target))!;
    expect(mine.staff?.members.length ?? 0).toBeGreaterThan(8);
    expect(mine.styleFamiliarity?.balanced).toBe(75);
    expect(mine.moraleClub).toEqual({ talks: [], promises: [] });
    expect(mine.players.every((p) => p.morale === 65)).toBe(true);
    expect(mine.financialTier).toBeUndefined();
    expect(mine.aiTransferBudget).toBeUndefined();
    expect(mine.finances!.budget).toBe(7_777_777 - compensation);
    // The AI board's renewal of the expiring star happened at the takeover.
    expect(mine.players.find((p) => p.id === star.id)!.contract!.until > laLigaEnd).toBe(true);
    expect(await ledgerSum(meta.id)).toBe(mine.finances!.budget);

    // Finances screen: the season's totals start at the arrival; the entries stay complete.
    const ledgerRes = await call("/api/saves/:saveId/ledger", meta.id, `/api/saves/${meta.id}/ledger`, "GET", session.token);
    const ledger = (await ledgerRes.json()) as { entries: { kind: string }[]; totals: Record<string, number> };
    expect(ledger.entries.some((e) => e.kind === "broadcasting")).toBe(true);
    expect(ledger.totals.broadcasting).toBe(0);
    expect(ledger.totals.club_change).toBe(7_777_777 - compensation);

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
    // D4: no swap — the old club has an interim and a vacancy, the new club's coach went free.
    expect(managers.find((m) => !m.isPlayer && m.squadId === "33")?.interim).toBe(true);
    expect(after.managerVacancies?.["33"]).toBeDefined();
    expect(after.managerContract).toMatchObject({ squadId: target });
    expect(after.careerStart).toBeUndefined();
    expect(after.managerContract!.wage).toBeGreaterThan(0);

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

  test("a human club above the AI cap releases the extras when it becomes AI", async () => {
    const meta = await create();
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    // Up to 33 players (the human cap is 36), the extras copies of the squad's own players.
    const extra = Array.from({ length: 33 - old.players.length }, (_, i) => ({ ...old.players[i % old.players.length]!, id: `extra_${i}` }));
    await saveService.saveSquadById(meta.id, { ...old, players: [...old.players, ...extra] });
    const freeBefore = (await saveService.getFreeAgents(meta.id)).length;
    await releaseHumanClub(saveService, meta.id, { squadId: "33", date: meta.currentDate! });
    const ai = (await saveService.getSquadById(meta.id, "33"))!;
    expect(ai.players.length).toBe(MAX_SQUAD);
    for (const [role, min] of Object.entries(MIN_BY_ROLE)) {
      expect(ai.players.filter((p) => roleOf(p) === role).length).toBeGreaterThanOrEqual(min);
    }
    const free = await saveService.getFreeAgents(meta.id);
    expect(free.length - freeBefore).toBe(3);
    const kept = new Set(ai.players.map((p) => p.id));
    expect(free.slice(freeBefore).every((f) => !kept.has(f.player.id) && !f.player.contract)).toBe(true);
  }, 120_000);

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

describe("season-end offer validity", () => {
  test("until the eve of the first match, at least one day", () => {
    expect(seasonEndExpiry("2027-05-20", "2027-08-15")).toBe("2027-08-14");
    expect(seasonEndExpiry("2027-05-20", "2027-05-21")).toBe("2027-05-21");
    expect(seasonEndExpiry("2027-05-20", null)).toBe("2027-06-19");
  });
});
