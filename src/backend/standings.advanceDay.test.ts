import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { appendSeatSeasons, newPassage } from "@/backend/standingsWorld";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { addSeat } from "@/backend/seats";
import type { WorldSeasonClosedInboxMessage } from "@/types/inboxTypes";

/**
 * Friends' league standings in the day advance (multiplayer part 5a, `.claude/rules/game/multiplayer.md`): an
 * ordinary day leaves the passage alone, the seat's rollover closes it into a row and opens the next season's,
 * a sacking closes it with −5. A solo save (cheap to build) is turned into a running friends' league in place.
 */
describe("standings in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id).catch(() => {});
  }, 120_000);

  const friendsLeague = async (sackingEnabled: boolean) => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], sackingEnabled,
    });
    created.push(meta.id);
    await saveService.updateMeta(meta.id, {
      mode: "multi",
      world: { phase: "running", inviteCode: "ABCDEFGHJK", deadlineHours: 24, createdBy: "test" },
    });
    const standing = newPassage({
      date: meta.currentDate!, clubId: "33", clubName: "Test", leagueSlug: "premier_league", board: meta.board,
    });
    // Opened before today, with an extra already won.
    await saveService.updateSeat(meta.id, meta.seatId, {
      standing: { ...standing, from: "2026-01-01", extras: [{ key: "cup", points: 3 }] },
    });
    return meta;
  };

  test("an ordinary day keeps the passage; the rollover closes a row and opens the new season's", async () => {
    const meta = await friendsLeague(false);
    // A second member on another Premier League club: both seats roll together and both get both messages.
    await ownSolo(meta.id, devAutoLogin("standings-day-a@test.local").user.id);
    const index = await saveService.getSquadIndex(meta.id);
    const seatB = await addSeat(meta.id, {
      userId: devAutoLogin("standings-day-b@test.local").user.id,
      clubId: index.inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId,
      manager: { name: "Técnico B", nationalityIso: "gb", backgroundId: "former-player" },
    });
    const before = (await saveService.getSeat(meta.id, meta.seatId))!.standing!;
    const first = await advanceOneDay(saveService, meta.id);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.standingsChanged).toBeUndefined();
    expect((await saveService.getSeat(meta.id, meta.seatId))!.standing).toEqual(before);
    expect(await saveService.getSeatSeasons(meta.id)).toEqual([]);

    // Force the seat's country to roll today.
    const world = (await saveService.getMeta(meta.id))!;
    const today = world.currentDate!;
    await saveService.updateMeta(meta.id, {
      activeLeagues: (world.activeLeagues ?? []).map((l) =>
        l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l),
    });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.standingsChanged).toBe(true);

    const rows = await saveService.getSeatSeasons(meta.id);
    expect(rows).toHaveLength(2);
    const rowA = rows.find((r) => r.seatId === meta.seatId)!;
    expect(rowA).toMatchObject({ clubId: "33", reason: "rollover", closedOn: today, season: before.season });
    expect(rowA.items.at(-1)).toEqual({ key: "cup", points: 3 });
    expect(rows.find((r) => r.seatId === seatB.seatId)).toMatchObject({ reason: "rollover", closedOn: today });

    // Every seat got one `season_closed` per closed row, with the manager's place of the two.
    for (const seatId of [meta.seatId, seatB.seatId]) {
      const closed = (await saveService.getInbox(meta.id, seatId))
        .filter((m): m is WorldSeasonClosedInboxMessage => m.category === "world" && m.kind === "season_closed");
      expect(closed).toHaveLength(2);
      const mine = closed.find((m) => m.id.includes(meta.seatId))!;
      expect(mine).toMatchObject({ points: rowA.total, season: before.season, of: 2 });
      expect(new Set(closed.map((m) => m.rank))).toEqual(new Set([1, 2]));
    }

    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    expect(seat.standing).toMatchObject({ from: today, clubId: "33", extras: [], season: seat.board!.objective!.season });
    expect(seat.standing!.season).not.toBe(before.season);

    // A replayed day writes the same row id: nothing new.
    await appendSeatSeasons(saveService, meta.id, rows);
    expect(await saveService.getSeatSeasons(meta.id)).toHaveLength(2);
  }, 180_000);

  test("a sacking closes the passage with −5 and leaves no passage", async () => {
    const meta = await friendsLeague(true);
    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    await saveService.updateSeat(meta.id, meta.seatId, { board: { ...seat.board!, board: 5 } });
    const out = await advanceOneDay(saveService, meta.id);
    expect(out.ok).toBe(true);

    const rows = await saveService.getSeatSeasons(meta.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "sacked", clubId: "33", closedOn: meta.currentDate });
    expect(rows[0]!.items).toContainEqual({ key: "sacked", points: -5 });
    expect(rows[0]!.items).toContainEqual({ key: "cup", points: 3 });
    const after = (await saveService.getSeat(meta.id, meta.seatId))!;
    expect(after.standing).toBeUndefined();
    expect(after.clubId).toBe("");
  }, 120_000);

  /** Forces the seat's country (Premier League + Championship) to roll today. */
  const rollToday = async (saveId: string): Promise<string> => {
    const world = (await saveService.getMeta(saveId))!;
    const today = world.currentDate!;
    await saveService.updateMeta(saveId, {
      activeLeagues: (world.activeLeagues ?? []).map((l) =>
        l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l),
    });
    return today;
  };

  test("a sacking on the rollover day puts −5 on the rollover row and opens no passage", async () => {
    const meta = await friendsLeague(true);
    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    await saveService.updateSeat(meta.id, meta.seatId, { board: { ...seat.board!, board: 5 } });
    const today = await rollToday(meta.id);
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);

    const rows = await saveService.getSeatSeasons(meta.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "rollover", clubId: "33", closedOn: today });
    expect(rows[0]!.items).toContainEqual({ key: "sacked", points: -5 });
    expect(rows[0]!.total).toBe(rows[0]!.items.reduce((n, i) => n + i.points, 0));
    const after = (await saveService.getSeat(meta.id, meta.seatId))!;
    expect(after.standing).toBeUndefined();
    expect(after.clubId).toBe("");
  }, 180_000);

  test("a contract ending on the rollover day keeps the rollover row as it is and opens no passage", async () => {
    const meta = await friendsLeague(false);
    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    const today = await rollToday(meta.id);
    await saveService.updateSeat(meta.id, meta.seatId, { managerContract: { ...seat.managerContract!, until: today } });
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);

    const rows = await saveService.getSeatSeasons(meta.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "rollover", clubId: "33", closedOn: today });
    expect(rows[0]!.items.map((i) => i.key)).not.toContain("sacked");
    expect(rows[0]!.items.map((i) => i.key)).not.toContain("half");
    const after = (await saveService.getSeat(meta.id, meta.seatId))!;
    expect(after.standing).toBeUndefined();
    expect(after.clubId).toBe("");
  }, 180_000);

  test("a passage opened today by a club change closes with the sacking (not dropped)", async () => {
    const meta = await friendsLeague(true);
    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    await saveService.updateSeat(meta.id, meta.seatId, {
      board: { ...seat.board!, board: 5 }, standing: { ...seat.standing!, from: meta.currentDate! },
    });
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    const rows = await saveService.getSeatSeasons(meta.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "sacked", from: meta.currentDate });
    expect(rows[0]!.items).toContainEqual({ key: "sacked", points: -5 });
  }, 120_000);

  test("a replayed rollover day leaves the new season's passage (written by the failed try) open", async () => {
    const meta = await friendsLeague(false);
    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    const today = await rollToday(meta.id);
    const reopened = { ...seat.standing!, from: today, season: "next-season", extras: [] };
    await saveService.updateSeat(meta.id, meta.seatId, { standing: reopened });
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    expect((await saveService.getSeatSeasons(meta.id)).filter((r) => r.seatId === meta.seatId)).toEqual([]);
    expect((await saveService.getSeat(meta.id, meta.seatId))!.standing).toMatchObject({ from: today, season: "next-season" });
  }, 180_000);

  test("a solo save keeps no standings", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await saveService.updateSeat(meta.id, meta.seatId, { board: { ...meta.board!, board: 5 } });
    expect((await advanceOneDay(saveService, meta.id)).ok).toBe(true);
    expect(await saveService.getSeatSeasons(meta.id)).toEqual([]);
  }, 120_000);
});
