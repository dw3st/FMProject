import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { appendSeatSeasons, newPassage } from "@/backend/standingsWorld";

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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seatId: meta.seatId, clubId: "33", reason: "rollover", closedOn: today, season: before.season });
    expect(rows[0]!.items.at(-1)).toEqual({ key: "cup", points: 3 });

    const seat = (await saveService.getSeat(meta.id, meta.seatId))!;
    expect(seat.standing).toMatchObject({ from: today, clubId: "33", extras: [], season: seat.board!.objective!.season });
    expect(seat.standing!.season).not.toBe(before.season);

    // A replayed day writes the same row id: nothing new.
    await appendSeatSeasons(saveService, meta.id, rows);
    expect(await saveService.getSeatSeasons(meta.id)).toHaveLength(1);
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
