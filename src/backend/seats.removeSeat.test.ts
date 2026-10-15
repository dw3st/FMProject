import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat, removeSeat, SeatError } from "@/backend/seats";
import { seatManagerId } from "@/Domain/seats/seats";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { startLoan } from "@/backend/negotiationWorld";
import { metaForSeat } from "@/Domain/seats/seats";
import { withOffer } from "@/backend/nationalWorld";
import { takeNationalJob } from "@/Domain/national/nationalCoach";
import type { SaveMeta } from "@/backend/SaveService";
import type { MarketState } from "@/types/transferMarketTypes";

describe("removeSeat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("the club goes back to the AI with an interim and a vacancy; the seat's files and member row go", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, devAutoLogin("rmseat-owner@test.local").user.id);
    const friend = devAutoLogin("rmseat-friend@test.local");
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubB, manager: { name: "Bia", nationalityIso: "br", backgroundId: "analyst" } });

    const removed = await removeSeat(meta.id, b.seatId);
    expect(removed).toMatchObject({ userId: friend.user.id, managerName: "Bia", clubId: clubB, leagueSlug: "premier_league" });

    const world = (await saveService.getMeta(meta.id))!;
    expect(world.seats).toEqual([meta.seatId]);
    expect(world.mode).toBe("multi");
    expect(world.managerVacancies?.[clubB]?.since).toBe(world.currentDate);
    expect(memberOf(meta.id, friend.user.id)).toBeNull();
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${meta.id}/seats/${b.seatId}/seat.json`).exists()).toBe(false);
    expect([...(await saveService.humanClubIds(meta.id))]).toEqual(["33"]);

    const squad = (await saveService.getSquadById(meta.id, clubB))!;
    expect(squad.staff).toBeUndefined();
    expect(squad.financialTier).toBeDefined();

    const managers = await saveService.getManagers(meta.id);
    const me = managers.find((m) => m.id === seatManagerId(b.seatId))!;
    expect(me.squadId).toBe("");
    expect(me.clubs?.at(-1)).toMatchObject({ squadId: clubB, left: "left_world" });
    expect(managers.filter((m) => m.squadId === clubB).map((m) => !!m.interim)).toEqual([true]);

    let err: unknown = null;
    try { await removeSeat(meta.id, b.seatId); } catch (e) { err = e; }
    expect(err instanceof SeatError && err.code).toBe("notFound");
  }, 300_000);

  async function twoSeats(tag: string) {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin(`rmseat-${tag}-owner@test.local`);
    await ownSolo(meta.id, owner.user.id);
    const friend = devAutoLogin(`rmseat-${tag}-friend@test.local`);
    const clubs = (await saveService.getSquadIndex(meta.id)).inLeague("premier_league").filter((e) => e.squadId !== "33").map((e) => e.squadId);
    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubs[0]!, manager: { name: "Bia", nationalityIso: "br", backgroundId: "analyst" } });
    return { meta, owner, friend, b, clubs };
  }

  test("every active loan of the seat ends: lent and borrowed players go back, nobody keeps a loan", async () => {
    const { meta, b, clubs } = await twoSeats("loans");
    const [clubB, clubC, clubD] = [clubs[0]!, clubs[1]!, clubs[2]!];
    const world = (await saveService.getMeta(meta.id))! as SaveMeta;
    const seatMeta = metaForSeat(world, b.seatId, b.seat);
    let market: MarketState = (await saveService.getMarket(meta.id, b.seatId)) ?? { shuffledTeamIds: [], rotationIndex: 0, profiles: {}, playerSellList: [] };
    const sB = (await saveService.getSquadById(meta.id, clubB))!;
    const sC = (await saveService.getSquadById(meta.id, clubC))!;
    const sD = (await saveService.getSquadById(meta.id, clubD))!;
    const lent = sB.players.find((p) => !p.loan)!;
    const borrowed = sD.players.find((p) => !p.loan)!;
    market = await startLoan(saveService, meta.id, b.seatId, seatMeta, market, { player: lent, parent: sB, borrower: sC, wageShare: 0.5, until: "2027-05-30", fee: 0 });
    market = await startLoan(saveService, meta.id, b.seatId, seatMeta, market, {
      player: borrowed, parent: sD, borrower: (await saveService.getSquadById(meta.id, clubB))!, wageShare: 0.5, until: "2027-05-30", fee: 0,
    });
    await saveService.saveMarket(meta.id, market, b.seatId);
    expect((await saveService.getSquadById(meta.id, clubC))!.players.find((p) => p.id === lent.id)?.loan).toBeDefined();

    await removeSeat(meta.id, b.seatId);

    for (const id of [clubB, clubC, clubD]) {
      const sq = (await saveService.getSquadById(meta.id, id))!;
      expect(sq.players.filter((p) => p.loan)).toEqual([]);
    }
    expect((await saveService.getSquadById(meta.id, clubB))!.players.some((p) => p.id === lent.id)).toBe(true);
    expect((await saveService.getSquadById(meta.id, clubD))!.players.some((p) => p.id === borrowed.id)).toBe(true);
    expect((await saveService.getSquadById(meta.id, clubB))!.players.some((p) => p.id === borrowed.id)).toBe(false);
  }, 300_000);

  test("a national team he coaches gets an interim (left_world, no resigned message); his offers go and their vacancies reopen", async () => {
    const { meta, b } = await twoSeats("nat");
    let state = (await saveService.getNationalState(meta.id))!;
    const [teamA, teamB] = Object.keys(state.teams);
    const date = (await saveService.getMeta(meta.id))!.currentDate!;
    state = { ...state, human: { [b.seatId]: { teamId: teamA!, since: date, wage: 10_000 } }, teams: { ...state.teams, [teamA!]: { ...state.teams[teamA!]!, managerId: `seat:${b.seatId}` } } };
    state = { ...state, vacancies: { ...state.vacancies, [teamB!]: { since: date, hireOn: "2027-01-01" } } };
    state = withOffer(state, b.seatId, { id: "natjob_x", teamId: teamB!, nation: "X", date, expires: "2027-12-31", prestige: 0.5, rank: 40, wage: 1 });
    await saveService.writeNationalState(meta.id, state);
    await saveService.writeManagers(meta.id, takeNationalJob(await saveService.getManagers(meta.id), { seatId: b.seatId, teamId: teamA!, date }));

    await removeSeat(meta.id, b.seatId);

    const after = (await saveService.getNationalState(meta.id))!;
    expect(after.human?.[b.seatId]).toBeUndefined();
    expect(after.offers?.[b.seatId]).toBeUndefined();
    expect(after.vacancies[teamA!]).toBeDefined();
    expect(after.vacancies[teamB!]!.hireOn <= date).toBe(true);
    const mgr = (await saveService.getManagers(meta.id)).find((m) => m.seatId === b.seatId)!;
    expect(mgr.national?.at(-1)).toMatchObject({ squadId: teamA, left: "left_world" });
  }, 300_000);

  test("an unemployed manager leaves without touching a club", async () => {
    const { meta, b, clubs } = await twoSeats("unemp");
    await saveService.updateSeat(meta.id, b.seatId, { unemployed: { since: "2026-09-01", lastClubId: clubs[0]!, lastClubName: "X", lastLeagueSlug: "premier_league", board: 50, nextOfferDate: "2026-09-08" } as never });
    const removed = await removeSeat(meta.id, b.seatId);
    expect(removed.clubId).toBe("");
    expect((await saveService.getMeta(meta.id))!.managerVacancies?.[clubs[0]!]).toBeUndefined();
    expect((await saveService.getMeta(meta.id))!.seats).toEqual([meta.seatId]);
  }, 300_000);

  test("sell list and bids die with the seat; a seat without seat.json is just dropped", async () => {
    const { meta, b, clubs } = await twoSeats("lists");
    const sq = (await saveService.getSquadById(meta.id, clubs[0]!))!;
    const market: MarketState = (await saveService.getMarket(meta.id, b.seatId)) ?? { shuffledTeamIds: [], rotationIndex: 0, profiles: {}, playerSellList: [] };
    await saveService.saveMarket(meta.id, { ...market, playerSellList: [{ playerId: sq.players[0]!.id, priority: 1 }] }, b.seatId);
    await removeSeat(meta.id, b.seatId);
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${meta.id}/seats/${b.seatId}/market.json`).exists()).toBe(false);
    expect((await saveService.getMarket(meta.id, b.seatId))?.playerSellList ?? []).toEqual([]);

    // Broken world: the id is in `seats` but the folder is gone.
    const cUserId = devAutoLogin("rmseat-lists-c@test.local").user.id;
    const c = await addSeat(meta.id, { userId: cUserId, clubId: clubs[1]!, manager: { name: "Cy", nationalityIso: "br", backgroundId: "analyst" } });
    const { rm } = await import("fs/promises");
    await rm(`${RUNTIME_DATA_DIR}/saves/${meta.id}/seats/${c.seatId}`, { recursive: true, force: true });
    const r = await removeSeat(meta.id, c.seatId);
    expect(r.managerName).toBe("");
    expect((await saveService.getMeta(meta.id))!.seats).toEqual([meta.seatId]);
    expect(memberOf(meta.id, cUserId)).toBeNull();
  }, 300_000);

  test("the owner and the last seat cannot be removed", async () => {
    const { meta, b } = await twoSeats("guard");
    const code = async (seatId: string) => { try { await removeSeat(meta.id, seatId); return "ok"; } catch (e) { return e instanceof SeatError ? e.code : String(e); } };
    expect(await code(meta.seatId)).toBe("ownerOrLast");
    await removeSeat(meta.id, b.seatId);
    expect(await code(meta.seatId)).toBe("ownerOrLast");
  }, 300_000);
});
