import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatState } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { TacticsSave } from "@/types/tacticsTypes";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

const dal = new FileSystemDAL();
const created: string[] = [];
afterAll(async () => { for (const id of created) await dal.deleteSave(id); });

const seat: SeatState = {
  clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"], leagueSlug: "premier_league", leagueName: "Premier League",
};
const msg = (id: string): InboxMessage => ({ id, category: "season", read: false, createdAt: "2027-01-01T00:00:00Z" } as unknown as InboxMessage);
const entry = (amount: number): LedgerEntry => ({ date: "2027-01-01", kind: "prize", amount, label: "x" });

describe("seat files in the FileSystemDAL", () => {
  test("seat.json and every seat file round-trip under seats/{seatId}", async () => {
    const saveId = `test-seat-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    expect(await dal.readSeat(saveId, seatId)).toBeNull();
    await dal.writeSeat(saveId, seatId, seat);
    expect(await dal.readSeat(saveId, seatId)).toEqual(seat);
    expect(await Bun.file(`${RUNTIME_DATA_DIR}/saves/${saveId}/seats/${seatId}/seat.json`).exists()).toBe(true);

    const tactics: TacticsSave = { formation: "4-4-2", tactical_style: "balanced", lineup: [] };
    await dal.writeSeatTactics(saveId, seatId, tactics);
    expect(await dal.readSeatTactics(saveId, seatId)).toEqual(tactics);

    expect(await dal.readSeatInbox(saveId, seatId)).toEqual([]);
    await dal.appendSeatInboxMessage(saveId, seatId, msg("m1"));
    await dal.appendSeatInboxMessage(saveId, seatId, msg("m2"));
    expect((await dal.readSeatInbox(saveId, seatId)).map((m) => m.id)).toEqual(["m1", "m2"]);

    await dal.appendSeatLedger(saveId, seatId, 2027, [entry(5)]);
    await dal.appendSeatLedger(saveId, seatId, 2026, [entry(1)]);
    expect(await dal.listSeatLedgerSeasons(saveId, seatId)).toEqual([2026, 2027]);
    expect((await dal.readSeatLedger(saveId, seatId, 2027)).map((e) => e.amount)).toEqual([5]);

    await dal.writeSeatMarket(saveId, seatId, { playerSellList: [{ playerId: "p1", priority: 1 }] });
    expect((await dal.readSeatMarket(saveId, seatId))?.playerSellList).toHaveLength(1);

    expect(await dal.readSeatScouting(saveId, seatId)).toBeNull();
    expect(await dal.readSeatAchievements(saveId, seatId)).toBeNull();
  });

  test("a seat id that is not path-safe throws", async () => {
    await expect(dal.readSeat("x", "../evil")).rejects.toThrow("invalid seat id");
    await expect(dal.writeSeatTactics("x", "A B", { formation: "4-3-3", tactical_style: "balanced", lineup: [] }))
      .rejects.toThrow("invalid seat id");
  });

  test("the BufferingSaveDAL holds seat writes until flush and writes them before the meta", async () => {
    const saveId = `test-seat-buf-${randomUUID()}`;
    created.push(saveId);
    const seatId = randomUUID();
    const buffer = new BufferingSaveDAL(dal);
    await buffer.writeSeat(saveId, seatId, seat);
    await buffer.appendSeatInboxMessage(saveId, seatId, msg("m1"));
    await buffer.appendSeatLedger(saveId, seatId, 2027, [entry(3)]);
    expect(await buffer.readSeat(saveId, seatId)).toEqual(seat);
    expect(await dal.readSeat(saveId, seatId)).toBeNull();
    await buffer.flush();
    expect(await dal.readSeat(saveId, seatId)).toEqual(seat);
    expect((await dal.readSeatInbox(saveId, seatId)).map((m) => m.id)).toEqual(["m1"]);
    expect((await dal.readSeatLedger(saveId, seatId, 2027)).map((e) => e.amount)).toEqual([3]);
  });
});
