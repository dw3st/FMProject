import { describe, expect, test } from "bun:test";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatResult } from "@/types/rivalsTypes";

const r: SeatResult = {
  id: "2027-03-10:x:f1:a", date: "2027-03-10", seatId: "a", nickname: "a", clubId: "c1", clubName: "C1",
  opponentId: "c2", opponentName: "C2", home: true, competition: "x", score: { for: 1, against: 0 }, goals: [], situations: ["win"],
};

describe("rivals feed file", () => {
  test("absent = empty; write then read; buffered until flush", async () => {
    const fs = new FileSystemDAL();
    const id = `test-rivals-${crypto.randomUUID()}`;
    expect(await fs.readRivalsFeed(id)).toEqual([]);
    const buf = new BufferingSaveDAL(fs);
    await buf.writeRivalsFeed(id, [r]);
    expect(await buf.readRivalsFeed(id)).toEqual([r]);
    expect(await fs.readRivalsFeed(id)).toEqual([]);
    await buf.flush();
    expect(await fs.readRivalsFeed(id)).toEqual([r]);
    await fs.deleteSave(id);
  });
});
