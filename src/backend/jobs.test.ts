import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { compensationFee } from "@/Domain/managers/managerContract";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { advanceOneDay, payloadForSeat } from "@/backend/advanceDay";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordMoney } from "@/backend/FinancialService";
import { generateJobOffers, loadJobWorld, releaseHumanClub, seasonEndExpiry } from "@/backend/jobWorld";
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
  }, 120_000); // several whole-world saves to delete: the default 5 s is too short on a busy disk

  const create = async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    return meta;
  };

  const ledgerSum = async (saveId: string, seatId: string) => {
    let sum = 0;
    for (const season of await saveService.listLedgerSeasons(saveId, seatId)) {
      for (const e of await saveService.getLedger(saveId, season, seatId)) sum += e.amount;
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
    await ownSolo(meta.id, user.id);
    const date = meta.currentDate!;
    // A starting balance, and an academy prospect at the old club.
    await recordMoney(saveService, meta.id, 2026, { leagueSlug: "premier_league", clubSlug: "33" },
      { date, kind: "broadcasting", amount: 5_000_000, label: "x" }, meta.seatId);
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    const kid = { ...old.players.at(-1)!, id: "academy_kid", age: 17 };
    await saveService.saveSquadById(meta.id, { ...old, youth: [kid] });
    // A saved tactic: it follows the manager, without the XI.
    await saveService.saveTactics(meta.id, {
      formation: "4-3-3", tactical_style: "balanced", lineup: [],
      lineupPresets: { A: { formation: "3-5-2", lineup: ["a", "b"], savedOn: date, tacticalStyle: "possession" } },
    }, meta.seatId);

    const index = await saveService.getSquadIndex(meta.id);
    const target = index.inLeague("la_liga")[0]!.squadId;
    const declined = await offerFor(meta, index.inLeague("serie_a")[0]!.squadId, date);
    const expired = { ...(await offerFor(meta, index.inLeague("bundesliga")[0]!.squadId, addDays(date, -1))), id: "job_old" };
    // D3: the offer carries the compensation the new club pays (what the card shows).
    const offerCompensation = compensationFee((await saveService.getSeatMeta(meta.id, meta.seatId))!.managerContract, date);
    const accepted = { ...(await offerFor(meta, target, addDays(date, 3))), budget: 7_777_777, compensation: offerCompensation };
    await saveService.updateSeat(meta.id, meta.seatId, {
      jobOffers: [declined, expired, accepted],
      youthCallUps: { u21: [{ id: "x", duration: "indefinite" }] }, youthCallUpsSkipped: { u21: { date, players: ["x"] } },
    });
    // A reborn offer pending at the old club, and the new club's best player out of contract this season.
    const legend = (id: string): RetiredPlayer => ({
      id, name: id, nationality: "Brazil", positions: ["ST"], preferredFoot: "right",
      profile: { summary: "s", archetype: "a" } as RetiredPlayer["profile"], retiredOn: date, squadId: "33", age: 39,
      wasWorldClass: true, appearances: 1, goals: 1, rebornOffer: "pending", rebornSeatId: meta.seatId,
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
    expect((await saveService.getSeatMeta(meta.id, meta.seatId))!.jobOffers!.map((o) => o.id)).toEqual([expired.id, accepted.id]);

    const get = await call("/api/saves/:saveId/jobs", meta.id, `/api/saves/${meta.id}/jobs`, "GET", session.token);
    const jobs = (await get.json()) as { reputation: number; offers: JobOffer[] };
    expect(jobs.reputation).toBeGreaterThan(0);
    expect(jobs.offers.map((o) => o.id)).toEqual([accepted.id]);

    // D3 (Etapa 25): leaving mid-contract, the new club compensates the old one out of the arrival.
    const compensation = offerCompensation;
    expect(compensation).toBeGreaterThan(0);
    const res = await post(accepted.id, { accept: true });
    expect(res.status).toBe(200);

    const after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
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
    expect(mine.styleFamiliarity?.balanced).toBe(FAMILIARITY.SAVED_STYLE_INITIAL);
    expect(mine.moraleClub).toEqual({ talks: [], promises: [] });
    expect(mine.players.every((p) => p.morale === 65)).toBe(true);
    expect(mine.financialTier).toBeUndefined();
    expect(mine.aiTransferBudget).toBeUndefined();
    expect(mine.finances!.budget).toBe(7_777_777 - compensation);
    // The AI board's renewal of the expiring star happened at the takeover.
    expect(mine.players.find((p) => p.id === star.id)!.contract!.until > laLigaEnd).toBe(true);
    expect(await ledgerSum(meta.id, meta.seatId)).toBe(mine.finances!.budget);

    // Finances screen: the season's totals start at the arrival; the entries stay complete.
    const ledgerRes = await call("/api/saves/:saveId/ledger", meta.id, `/api/saves/${meta.id}/ledger`, "GET", session.token);
    const ledger = (await ledgerRes.json()) as { entries: { kind: string }[]; totals: Record<string, number> };
    expect(ledger.entries.some((e) => e.kind === "broadcasting")).toBe(true);
    expect(ledger.totals.broadcasting).toBe(0);
    expect(ledger.totals.club_change).toBe(7_777_777 - compensation);

    const tactics = (await saveService.getTactics(meta.id, meta.seatId))!;
    expect(tactics.lineupPresets?.A).toMatchObject({ formation: "3-5-2", tacticalStyle: "possession", lineup: [], fromClub: "Test" });
    expect(tactics.formation).toBe(after.formation!);
    expect(tactics.lineup.filter(Boolean).length).toBe(11);
    expect(tactics.lineup.every((id) => !id || mine.players.some((p) => p.id === id))).toBe(true);

    const managers = await saveService.getManagers(meta.id);
    const me = managers.find((m) => !!m.seatId)!;
    expect(me.squadId).toBe(target);
    expect(me.clubs?.map((c) => c.squadId)).toEqual(["33", target]);
    const clubs = managers.filter((m) => m.squadId).map((m) => m.squadId);
    expect(new Set(clubs).size).toBe(clubs.length);
    // D4: no swap — the old club has an interim and a vacancy, the new club's coach went free.
    expect(managers.find((m) => !m.seatId && m.squadId === "33")?.interim).toBe(true);
    expect(after.managerVacancies?.["33"]).toBeDefined();
    expect(after.managerContract).toMatchObject({ squadId: target });
    expect(after.careerStart).toBeUndefined();
    expect(after.managerContract!.wage).toBeGreaterThan(0);

    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(inbox.some((m) => m.category === "job" && m.kind === "hired")).toBe(true);

    // The career goes on at the new club.
    const day = await advanceOneDay(saveService, meta.id);
    expect(day.ok).toBe(true);
  }, 240_000);

  test("sacked: unemployed, old club AI, offers every two weeks, accepted from unemployment", async () => {
    const meta = await create();
    const { user, session } = devAutoLogin("jobs-unemployed@test.local");
    await ownSolo(meta.id, user.id);
    await saveService.updateSeat(meta.id, meta.seatId, { board: { ...meta.board!, board: 5 } });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(payloadForSeat(out, meta.seatId).sacked).toBe(true);

    let after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    expect(after.clubId).toBe("");
    expect(after.board).toBeUndefined();
    expect(after.unemployed).toMatchObject({ lastClubId: "33", since: meta.currentDate, sacking: { reason: "board" } });
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    expect(old.staff).toBeUndefined();
    expect(old.financialTier).toBeDefined();
    expect(await ledgerSum(meta.id, meta.seatId)).toBe(0);
    const managers = await saveService.getManagers(meta.id);
    expect(managers.find((m) => !!m.seatId)!.squadId).toBe("");
    expect(managers.filter((m) => m.squadId === "33").length).toBe(1);

    // Unemployed days advance (no matches of his own); the next batch of offers arrives on schedule.
    await saveService.updateSeat(meta.id, meta.seatId, { unemployed: { ...after.unemployed!, nextOfferDate: after.currentDate! } });
    const day = await advanceOneDay(saveService, meta.id);
    expect(day.ok).toBe(true);
    after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    const offers = after.jobOffers ?? [];
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(offers.every((o) => o.window === "unemployed" && o.squadId !== "33")).toBe(true);
    expect(after.unemployed!.nextOfferDate).toBe(addDays(meta.currentDate!, 15));
    const inbox = await saveService.getInbox(meta.id, meta.seatId);
    expect(inbox.filter((m) => m.category === "job" && m.kind === "offer").length).toBe(offers.length);

    const offer = offers[0]!;
    const res = await call("/api/saves/:saveId/jobs/:offerId", meta.id, `/api/saves/${meta.id}/jobs/${offer.id}`, "POST",
      session.token, { accept: true }, offer.id);
    expect(res.status).toBe(200);
    after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    expect(after.clubId).toBe(offer.squadId);
    expect(after.unemployed).toBeUndefined();
    const mine = (await saveService.getSquadById(meta.id, offer.squadId))!;
    expect(await ledgerSum(meta.id, meta.seatId)).toBe(mine.finances!.budget);
    const ms = await saveService.getManagers(meta.id);
    expect(ms.find((m) => !!m.seatId)!.squadId).toBe(offer.squadId);
    const clubs = ms.filter((m) => m.squadId).map((m) => m.squadId);
    expect(new Set(clubs).size).toBe(clubs.length);
    const inboxAfter = await saveService.getInbox(meta.id, meta.seatId);
    expect(inboxAfter.some((m) => m.category === "job" && m.kind === "offer")).toBe(false);
  }, 240_000);

  test("a human club above the AI cap releases the extras when it becomes AI", async () => {
    const meta = await create();
    const old = (await saveService.getSquadById(meta.id, "33"))!;
    // Up to 33 players (the human cap is 36), the extras copies of the squad's own players.
    const extra = Array.from({ length: 33 - old.players.length }, (_, i) => ({ ...old.players[i % old.players.length]!, id: `extra_${i}` }));
    await saveService.saveSquadById(meta.id, { ...old, players: [...old.players, ...extra] });
    const freeBefore = (await saveService.getFreeAgents(meta.id)).length;
    await releaseHumanClub(saveService, meta.id, meta.seatId, { squadId: "33", date: meta.currentDate! });
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

  test("job offers never come from a club with a seat", async () => {
    const meta = await create();
    const index = await saveService.getSquadIndex(meta.id);
    const world = (await saveService.getMeta(meta.id))!;
    // the seat's club and every other club of its league stand for "clubs with a seat"
    const excluded = new Set([meta.clubId, ...index.inLeague("premier_league").map((t) => t.squadId)]);
    const offers = await generateJobOffers(saveService, meta.id, {
      seatId: meta.seatId, window: "unemployed", date: meta.currentDate!, expires: addDays(meta.currentDate!, 14),
      managers: await saveService.getManagers(meta.id), board: 90, humanSquadId: null,
      unemployed: { lastClubId: meta.clubId, since: meta.currentDate! },
      activeLeagues: world.activeLeagues ?? [], index, excludeClubs: excluded,
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => !excluded.has(o.squadId))).toBe(true);
  }, 300_000);
});

describe("season-end offer validity", () => {
  test("until the eve of the first match, at least one day", () => {
    expect(seasonEndExpiry("2027-05-20", "2027-08-15")).toBe("2027-08-14");
    expect(seasonEndExpiry("2027-05-20", "2027-05-21")).toBe("2027-05-21");
    expect(seasonEndExpiry("2027-05-20", null)).toBe("2027-06-19");
  });

  test("available on the market and resigning (8.9.23)", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    const call = (key: string, saveId: string, path: string, method: string, token: string, body?: unknown) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, {
          method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
    };
    try {
    const { user, session } = devAutoLogin("jobs-exit@test.local");
    await ownSolo(meta.id, user.id);
    const date = meta.currentDate!;
    // On: offers every two weeks from a week later; off clears it.
    let res = await call("/api/saves/:saveId/job-seeking", meta.id, `/api/saves/${meta.id}/job-seeking`, "PUT", session.token, { on: true });
    expect(res.status).toBe(200);
    let seat = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    expect(seat.jobSeeking).toEqual({ since: date, nextOfferDate: addDays(date, 7) });
    res = await call("/api/saves/:saveId/job-seeking", meta.id, `/api/saves/${meta.id}/job-seeking`, "PUT", session.token, { on: "x" });
    expect(res.status).toBe(400);
    // The offers day: offers arrive (smaller clubs allowed), the next date moves two weeks on.
    await saveService.updateSeat(meta.id, meta.seatId, { jobSeeking: { since: date, nextOfferDate: date } });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    seat = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    expect((seat.jobOffers ?? []).length).toBeGreaterThan(0);
    expect(seat.jobSeeking?.nextOfferDate).toBe(addDays(date, 14));
    // Resign: the release fee from his own money; without it, refused.
    res = await call("/api/saves/:saveId/job-resign", meta.id, `/api/saves/${meta.id}/job-resign`, "POST", session.token);
    expect(res.status).toBe(409);
    const refusal = (await res.json()) as { error: string; fee: number };
    expect(refusal.error).toBe("noMoney");
    expect(refusal.fee).toBeGreaterThan(0);
    await saveService.updateSeat(meta.id, meta.seatId, { managerEarnings: refusal.fee + 1000, managerSpent: 0 });
    // Resign: unemployed, no club, an interim at the old club with a vacancy.
    res = await call("/api/saves/:saveId/job-resign", meta.id, `/api/saves/${meta.id}/job-resign`, "POST", session.token);
    expect(res.status).toBe(200);
    seat = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    expect(seat.managerSpent).toBe(refusal.fee);
    expect(seat.clubId).toBe("");
    expect(seat.unemployed?.sacking?.reason).toBe("resigned");
    expect(seat.unemployed?.lastClubId).toBe("33");
    expect(seat.jobSeeking).toBeUndefined();
    const world = (await saveService.getMeta(meta.id))!;
    expect(world.managerVacancies?.["33"]).toBeDefined();
    const managers = await saveService.getManagers(meta.id);
    expect(managers.filter((m) => m.squadId === "33").length).toBe(1);
    expect(managers.find((m) => m.seatId === meta.seatId)?.clubs?.at(-1)?.left).toBe("resigned");
    // Again: no club.
    res = await call("/api/saves/:saveId/job-resign", meta.id, `/api/saves/${meta.id}/job-resign`, "POST", session.token);
    expect(res.status).toBe(409);
    // The next day runs without a club.
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    } finally {
      await saveService.deleteSave(meta.id);
    }
  }, 300_000);

  test("job posts and applications (8.9.29)", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    const call = (key: string, saveId: string, path: string, method: string, token: string, body?: unknown) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, {
          method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
    };
    try {
      const { user, session } = devAutoLogin("jobs-posts@test.local");
      await ownSolo(meta.id, user.id);
      const path = `/api/saves/${meta.id}`;
      let res = await call("/api/saves/:saveId/job-posts", meta.id, `${path}/job-posts`, "GET", session.token);
      expect(res.status).toBe(200);
      const view = (await res.json()) as { rows: { squadId: string; level: unknown; blocked: string | null }[]; application: unknown };
      expect(view.rows.length).toBe(20);
      expect(view.rows.find((r) => r.squadId === "33")?.blocked).toBe("own");
      expect(view.application).toBeNull();
      const other = view.rows.find((r) => r.blocked === null)!;
      expect([1, 2, 3, 4, 5, "vacant"]).toContain(other.level as number);
      res = await call("/api/saves/:saveId/job-posts", meta.id, `${path}/job-posts?league=..`, "GET", session.token);
      expect(res.status).toBe(400);
      // Apply: one at a time, the own club refused.
      res = await call("/api/saves/:saveId/job-applications", meta.id, `${path}/job-applications`, "POST", session.token, { squadId: "33" });
      expect(res.status).toBe(409);
      res = await call("/api/saves/:saveId/job-applications", meta.id, `${path}/job-applications`, "POST", session.token, { squadId: other.squadId });
      expect(res.status).toBe(200);
      res = await call("/api/saves/:saveId/job-applications", meta.id, `${path}/job-applications`, "POST", session.token, { squadId: other.squadId });
      expect(res.status).toBe(409);
      // Force a refusal and deliver it: the club is blocked, a message arrives.
      const seat = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
      const app = seat.jobApplication!;
      await saveService.updateSeat(meta.id, meta.seatId, { jobApplication: { ...app, accepted: false, offer: undefined, answerOn: meta.currentDate! } });
      expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
      let after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
      expect(after.jobApplication).toBeUndefined();
      expect(after.jobRefused?.[other.squadId]).toBe(meta.currentDate);
      const inbox = await saveService.getInbox(meta.id, meta.seatId);
      expect(inbox.some((m) => m.category === "job" && m.kind === "application_refused")).toBe(true);
      // An accepted one becomes an offer.
      const third = view.rows.find((r) => r.blocked === null && r.squadId !== other.squadId)!;
      res = await call("/api/saves/:saveId/job-applications", meta.id, `${path}/job-applications`, "POST", session.token, { squadId: third.squadId });
      expect(res.status).toBe(200);
      after = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
      const app2 = after.jobApplication!;
      res = await call("/api/saves/:saveId/job-applications", meta.id, `${path}/job-applications`, "DELETE", session.token);
      expect(res.status).toBe(200);
      expect((await saveService.getSeatMeta(meta.id, meta.seatId))!.jobApplication).toBeUndefined();
      if (app2.offer) {
        await saveService.updateSeat(meta.id, meta.seatId, { jobApplication: { ...app2, answerOn: after.currentDate! } });
        expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
        const s3 = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
        expect(s3.jobOffers?.some((o) => o.squadId === third.squadId && o.window === "application")).toBe(true);
      }
    } finally {
      await saveService.deleteSave(meta.id);
    }
  }, 300_000);
});
