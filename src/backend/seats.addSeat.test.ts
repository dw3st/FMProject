import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import { seatManagerId } from "@/Domain/seats/seats";
import { generateRestDays } from "@/Domain/season/generateRestDays";

describe("addSeat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("a second seat takes a club: seat file, member, manager, staff, ledger = budget", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const owner = devAutoLogin("addseat-owner@test.local");
    const friend = devAutoLogin("addseat-friend@test.local");
    await ownSolo(meta.id, owner.user.id);
    const clubB = (await saveService.getSquadIndex(meta.id)).inLeague("la_liga")[0]!.squadId;

    const b = await addSeat(meta.id, { userId: friend.user.id, clubId: clubB, manager: { name: "Friend", nationalityIso: "es", backgroundId: "former-player" } });

    const world = (await saveService.getMeta(meta.id))!;
    expect(world.mode).toBe("multi");
    expect(world.seats).toEqual([meta.seatId, b.seatId]);
    expect(memberOf(meta.id, friend.user.id)).toMatchObject({ seatId: b.seatId, role: "member" });
    expect(b.seat.clubId).toBe(clubB);
    expect(b.seat.board?.objective?.leagueSlug).toBe("la_liga");
    expect(b.seat.managerContract?.squadId).toBe(clubB);
    expect(b.seat.restDays?.length).toBeGreaterThan(0);
    expect([...(await saveService.humanClubIds(meta.id))].sort()).toEqual([meta.clubId, clubB].sort());

    const managers = await saveService.getManagers(meta.id);
    expect(managers.filter((m) => m.squadId === clubB).map((m) => m.id)).toEqual([seatManagerId(b.seatId)]);

    const squad = (await saveService.getSquadById(meta.id, clubB))!;
    expect(squad.staff).toBeDefined();
    expect(squad.facilities).toBeDefined();
    expect(squad.financialTier).toBeUndefined();
    let sum = 0;
    for (const season of await saveService.listLedgerSeasons(meta.id, b.seatId)) {
      for (const e of await saveService.getLedger(meta.id, season, b.seatId)) sum += e.amount;
    }
    expect(sum).toBe(squad.finances?.budget ?? 0);
    expect((await saveService.getTactics(meta.id, b.seatId))?.lineup.length).toBeGreaterThan(0);

    await expect(addSeat(meta.id, { userId: devAutoLogin("addseat-3@test.local").user.id, clubId: clubB, manager: { name: "X", nationalityIso: "es", backgroundId: "former-player" } }))
      .rejects.toThrow("already has a seat");
  }, 300_000);

  test("the seat rests the day before and after its own club's league games", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ownSolo(meta.id, devAutoLogin("addseat-rest-owner@test.local").user.id);
    const world = (await saveService.getMeta(meta.id))!;
    // A club whose league calendar differs from its league's: it has a game moved off the round date.
    let pick: { clubId: string; league: string } | null = null;
    for (const l of world.activeLeagues ?? []) {
      if (l.leagueSlug === meta.leagueSlug) continue;
      const moved = (await saveService.getAllFixturesForLeague(meta.id, l.leagueSlug)).find((f) => f.rescheduledFrom);
      if (moved) { pick = { clubId: moved.home, league: l.leagueSlug }; break; }
    }
    expect(pick).not.toBeNull();
    const seat = await addSeat(meta.id, {
      userId: devAutoLogin("addseat-rest@test.local").user.id, clubId: pick!.clubId,
      manager: { name: "Rest", nationalityIso: "br", backgroundId: "former-player" },
    });
    const own = (await saveService.getAllFixturesForLeague(meta.id, pick!.league))
      .filter((f) => f.home === pick!.clubId || f.away === pick!.clubId);
    expect(seat.seat.restDays).toEqual(generateRestDays(own));
    const matchDays = new Set(own.map((f) => f.date));
    expect(seat.seat.restDays!.some((d) => matchDays.has(d))).toBe(false);
  }, 300_000);
});
