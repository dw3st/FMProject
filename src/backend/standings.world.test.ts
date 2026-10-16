import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { setKickScheduler } from "@/backend/groupAdvance";
import { addSeat } from "@/backend/seats";
import { acceptJobOffer } from "@/backend/jobWorld";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import { addDays } from "@/Domain/dates";
import type { JobOffer } from "@/types/jobTypes";

/** Friends' league standings: where a passage opens and closes outside the day advance (part 5a). */
describe("standings: passages outside the day", () => {
  const created: string[] = [];
  beforeAll(() => setKickScheduler(() => {}));
  afterAll(async () => {
    setKickScheduler(null);
    for (const id of created) await saveService.deleteSave(id).catch(() => {});
  }, 120_000);

  const offerFor = async (saveId: string, squadId: string, date: string): Promise<JobOffer> => {
    const e = (await saveService.getSquadIndex(saveId)).byId(squadId)!;
    return {
      id: `job_test_${squadId}`, squadId, clubName: e.name, leagueSlug: e.leagueSlug, leagueName: e.leagueSlug,
      window: "season_end", date, expires: addDays(date, 3), objective: null, budget: 0, expectedPosition: 1,
      leagueSize: 20, prestige: 0.5,
    };
  };

  test("friends' league: the member joins with a passage, the start opens the owner's, a club change closes it", async () => {
    const owner = devAutoLogin("standings-owner@test.local");
    const made = await createMultiWorld(owner.session.token);
    expect(made.status).toBe(201);
    const saveId = made.json.id as string;
    created.push(saveId);
    const ownerSeatId = (await saveService.getMeta(saveId))!.seats[0]!;
    expect((await saveService.getSeat(saveId, ownerSeatId))?.standing).toBeUndefined();

    // The member: the board's objective of the new club.
    const clubB = (await saveService.getSquadIndex(saveId)).inLeague("la_liga")[0]!.squadId;
    const member = await addSeat(saveId, { userId: devAutoLogin("standings-member@test.local").user.id, clubId: clubB, manager: TEST_MANAGER });
    const objective = member.seat.board!.objective!;
    expect(member.seat.standing).toMatchObject({
      clubId: clubB, leagueSlug: "la_liga", season: objective.season, target: objective.target, extras: [],
    });

    // The world's start: the owner gets the passage, dated the world's day after the kit.
    expect((await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: { saveId } })).status).toBe(200);
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    const ownerSeat = (await saveService.getSeat(saveId, ownerSeatId))!;
    expect(ownerSeat.standing).toMatchObject({
      from: date, clubId: "33", leagueSlug: "premier_league",
      season: ownerSeat.board!.objective!.season, target: ownerSeat.board!.objective!.target,
    });
    expect((await saveService.getSeat(saveId, member.seatId))!.standing?.from).toBe(date);

    // A known position (3rd with games, target 6) and a cup extra.
    const table = (await saveService.getLeagueStandings(saveId, "premier_league"))!;
    const others = table.filter((r) => r.squadId !== "33");
    await saveService.writeLeagueStandings(saveId, "premier_league",
      [...others.slice(0, 2), { ...table.find((r) => r.squadId === "33")!, mp: 5 }, ...others.slice(2)]);
    await saveService.updateSeat(saveId, ownerSeatId, {
      standing: { ...ownerSeat.standing!, target: 6, extras: [{ key: "cup", points: 3 }] },
    });

    const target = (await saveService.getSquadIndex(saveId)).inLeague("serie_a")[0]!.squadId;
    const offer = await offerFor(saveId, target, date);
    const meta = (await saveService.getSeatMeta(saveId, ownerSeatId))!;
    await acceptJobOffer(saveService, saveId, ownerSeatId, meta, offer);

    // objective_met 10 + above 3 = 13, counted half (−7), plus the cup.
    const rows = await saveService.getSeatSeasons(saveId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      seatId: ownerSeatId, clubId: "33", reason: "club_change", closedOn: date, position: 3, target: 6, total: 9,
    });
    expect(rows[0]!.items.map((i) => i.key)).toEqual(["objective_met", "above_target", "half", "cup"]);

    const after = (await saveService.getSeat(saveId, ownerSeatId))!;
    expect(after.standing).toMatchObject({ from: date, clubId: target, leagueSlug: "serie_a", extras: [] });
    expect(after.standing!.season).toBe(after.board!.objective!.season);
  }, 1_200_000);

  test("solo: nothing is recorded", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, devAutoLogin("standings-solo@test.local").user.id);
    const target = (await saveService.getSquadIndex(meta.id)).inLeague("la_liga")[0]!.squadId;
    const seatMeta = (await saveService.getSeatMeta(meta.id, meta.seatId))!;
    await acceptJobOffer(saveService, meta.id, meta.seatId, seatMeta, await offerFor(meta.id, target, meta.currentDate!));
    expect((await saveService.getSeat(meta.id, meta.seatId))!.standing).toBeUndefined();
    expect(await saveService.getSeatSeasons(meta.id)).toEqual([]);
  }, 600_000);
});
