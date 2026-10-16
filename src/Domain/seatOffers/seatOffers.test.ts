import { describe, expect, test } from "bun:test";
import { createSeatOffer, respondSeatOffer, offerExpiry, expiredOffers, seatOfferView, offersOfPlayer } from "@/Domain/seatOffers/seatOffers";
import type { SeatOffer } from "@/types/seatOfferTypes";

const seller = { seatId: "s", clubId: "c-s", clubName: "Seller FC" };
const buyer = { seatId: "b", clubId: "c-b", clubName: "Buyer FC" };
const base = (over: Partial<SeatOffer> = {}): SeatOffer => createSeatOffer({
  id: "o1", kind: "transfer", playerId: "p1", playerName: "P One", seller, buyer, date: "2027-01-10",
  terms: { fee: 5_000_000, sellOnPct: 10, wage: 20_000, years: 3 }, windowUntil: null,
  ...over,
} as never);

describe("seat offers", () => {
  test("a new offer is the seller's turn and expires in 5 days", () => {
    const o = base();
    expect(o.turn).toBe("seller");
    expect(o.expires).toBe("2027-01-15");
    expect(o.counters).toBe(0);
    expect(o.history).toEqual([{ by: "buyer", action: "offer", date: "2027-01-10", terms: o.terms }]);
  });

  test("the expiry never passes the buyer's window", () => {
    expect(offerExpiry("2027-01-10", "2027-01-12")).toBe("2027-01-12");
    expect(offerExpiry("2027-01-10", null)).toBe("2027-01-15");
  });

  test("only the side whose turn it is answers; the buyer always withdraws", () => {
    const o = base();
    expect(respondSeatOffer(o, "buyer", { action: "accept" }, "2027-01-11")).toEqual({ ok: false, error: "notYourTurn" });
    expect(respondSeatOffer(o, "buyer", { action: "withdraw" }, "2027-01-11")).toMatchObject({ ok: true, closed: "withdraw" });
    expect(respondSeatOffer(o, "seller", { action: "withdraw" }, "2027-01-11")).toEqual({ ok: false, error: "notYourTurn" });
  });

  test("a counter changes fee and clause only, swaps the turn and renews the expiry", () => {
    const r = respondSeatOffer(base(), "seller", { action: "counter", fee: 8_000_000, sellOnPct: 20 }, "2027-01-12");
    expect(r.ok).toBe(true);
    if (!r.ok || r.closed) throw new Error("unexpected");
    expect(r.offer.turn).toBe("buyer");
    expect(r.offer.counters).toBe(1);
    expect(r.offer.terms).toEqual({ fee: 8_000_000, sellOnPct: 20, wage: 20_000, years: 3 });
    expect(r.offer.expires).toBe("2027-01-17");
  });

  test("after 3 counters only accept or reject", () => {
    let o = base();
    const sides = ["seller", "buyer", "seller"] as const;
    for (const s of sides) {
      const r = respondSeatOffer(o, s, { action: "counter", fee: o.terms.fee + 1_000_000 }, "2027-01-11");
      if (!r.ok || r.closed) throw new Error("unexpected");
      o = r.offer;
    }
    expect(respondSeatOffer(o, "buyer", { action: "counter", fee: 1 }, "2027-01-11")).toEqual({ ok: false, error: "noRounds" });
    expect(respondSeatOffer(o, "buyer", { action: "accept" }, "2027-01-11")).toMatchObject({ ok: true, closed: "accept" });
  });

  test("invalid counters are refused", () => {
    expect(respondSeatOffer(base(), "seller", { action: "counter", fee: -1 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    expect(respondSeatOffer(base(), "seller", { action: "counter", fee: 1, sellOnPct: 15 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    const loan = base({ kind: "loan", terms: { fee: 0, wageShare: 0.5, until: "2027-05-30" } } as never);
    expect(respondSeatOffer(loan, "seller", { action: "counter", fee: 0, wageShare: 1.2 }, "2027-01-11")).toEqual({ ok: false, error: "invalidTerms" });
    const ok = respondSeatOffer(loan, "seller", { action: "counter", fee: 100_000, wageShare: 0.8 }, "2027-01-11");
    expect(ok.ok && !ok.closed && ok.offer.terms).toEqual({ fee: 100_000, wageShare: 0.8, until: "2027-05-30" });
  });

  test("an offer past its day is expired", () => {
    expect(respondSeatOffer(base(), "seller", { action: "accept" }, "2027-01-16")).toEqual({ ok: false, error: "offerClosed" });
    expect(expiredOffers([base()], "2027-01-15").map((o) => o.id)).toEqual([]);
    expect(expiredOffers([base()], "2027-01-16").map((o) => o.id)).toEqual(["o1"]);
  });

  test("view and per-player lookup", () => {
    const v = seatOfferView(base(), "s", "Manager B");
    expect(v).toMatchObject({ side: "seller", myTurn: true, otherManager: "Manager B" });
    expect(seatOfferView(base(), "x", "")).toBeNull();
    expect(offersOfPlayer([base(), base({ id: "o2", playerId: "p2" } as never)], "p1").map((o) => o.id)).toEqual(["o1"]);
  });
});
