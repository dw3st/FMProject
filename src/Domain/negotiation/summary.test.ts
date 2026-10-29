import { describe, expect, test } from "bun:test";
import { negotiationSummary } from "@/Domain/negotiation/summary";

const D = "2028-01-15";
const party = (seatId: string) => ({ seatId, clubId: `c_${seatId}`, clubName: seatId });

describe("negotiationSummary", () => {
  test("counts each player once per side, only live deals", () => {
    const s = negotiationSummary({
      date: D,
      seatId: "me",
      talks: {
        "transfer:a": { playerId: "a", kind: "transfer", date: D, rounds: 1, history: [] },
        "loan:a": { playerId: "a", kind: "loan", date: D, rounds: 1, history: [] },
        "transfer:old": { playerId: "old", kind: "transfer", date: "2028-01-14", rounds: 1, history: [] },
        "transfer:ban": { playerId: "ban", kind: "transfer", date: D, rounds: 3, closedUntil: "2028-01-28", history: [] },
      },
      rivals: [{ playerId: "b", deadline: "2028-01-16" } as never, { playerId: "gone", deadline: "2028-01-10" } as never],
      bids: [{ playerId: "mine1" } as never, { playerId: "mine1" } as never, { playerId: "mine2" } as never],
      seatOffers: [
        { playerId: "c", buyer: party("me"), seller: party("x"), expires: D } as never,
        { playerId: "mine3", buyer: party("x"), seller: party("me"), expires: D } as never,
        { playerId: "late", buyer: party("me"), seller: party("x"), expires: "2028-01-01" } as never,
      ],
    });
    expect(s).toEqual({ buying: 3, selling: 3 }); // a, b, c · mine1, mine2, mine3
  });
  test("nothing going on", () => {
    expect(negotiationSummary({ date: D, seatId: "me" })).toEqual({ buying: 0, selling: 0 });
  });
});
