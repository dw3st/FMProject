import { describe, expect, test } from "bun:test";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatSeasonRow } from "@/types/standingsTypes";

const row: SeatSeasonRow = { id: "a:c:2026-27:2027-05-20", seatId: "a", clubId: "c", clubName: "C", leagueSlug: "premier_league",
  season: "2026-27", from: "2026-08-15", closedOn: "2027-05-20", reason: "rollover", position: 3, target: 5,
  items: [{ key: "objective_met", points: 10 }], total: 10 };

describe("seat seasons file", () => {
  test("absent = empty; write then read; buffered until flush", async () => {
    const fs = new FileSystemDAL();
    const id = `test-seasons-${crypto.randomUUID()}`;
    expect(await fs.readSeatSeasons(id)).toEqual([]);
    const buf = new BufferingSaveDAL(fs);
    await buf.writeSeatSeasons(id, [row]);
    expect(await buf.readSeatSeasons(id)).toEqual([row]);
    expect(await fs.readSeatSeasons(id)).toEqual([]);
    await buf.flush();
    expect(await fs.readSeatSeasons(id)).toEqual([row]);
    await fs.deleteSave(id);
  });
});
