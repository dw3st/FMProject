import { describe, expect, test } from "bun:test";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import type { SeatOffer } from "@/types/seatOfferTypes";

const offer = { id: "o1", kind: "transfer", playerId: "p", playerName: "P", seller: { seatId: "s", clubId: "a", clubName: "A" },
  buyer: { seatId: "b", clubId: "c", clubName: "C" }, date: "2027-01-01", expires: "2027-01-06", turn: "seller", counters: 0,
  terms: { fee: 1 }, history: [] } as SeatOffer;

describe("seat offers file", () => {
  test("absent = empty; write then read; buffered until flush", async () => {
    const fs = new FileSystemDAL();
    const id = `test-offers-${crypto.randomUUID()}`;
    expect(await fs.readSeatOffers(id)).toEqual([]);
    const buf = new BufferingSaveDAL(fs);
    await buf.writeSeatOffers(id, [offer]);
    expect(await buf.readSeatOffers(id)).toEqual([offer]);
    expect(await fs.readSeatOffers(id)).toEqual([]);
    await buf.flush();
    expect(await fs.readSeatOffers(id)).toEqual([offer]);
    await fs.deleteSave(id);
  });
});
