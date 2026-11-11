import { describe, expect, test } from "bun:test";
import { inviteRefusal, pickFriendlyDate, pruneFriendlies, type SeatFriendly } from "@/Domain/friendlies/seatFriendly";

const f = (over: Partial<SeatFriendly>): SeatFriendly => ({
  id: "x", fromSeat: "a", toSeat: "b", fromClub: "A", toClub: "B", date: "2027-03-10", status: "pending", createdOn: "2027-03-01", ...over,
});

describe("friendly between managers (9.5)", () => {
  test("the first day free for both, with a day's gap to official games", () => {
    expect(pickFriendlyDate("2027-03-01", new Set(), new Set())).toBe("2027-03-03");
    expect(pickFriendlyDate("2027-03-01", new Set(["2027-03-04"]), new Set())).toBe("2027-03-06");
    expect(pickFriendlyDate("2027-03-01", new Set(), new Set(["2027-03-03"]))).toBe("2027-03-04");
  });

  test("refusals and pruning", () => {
    expect(inviteRefusal({ list: [], fromSeat: "a", toSeat: "a" })).toBe("self");
    expect(inviteRefusal({ list: [f({})], fromSeat: "b", toSeat: "a" })).toBe("alreadyInvited");
    expect(inviteRefusal({ list: [f({ toSeat: "c" }), f({ toSeat: "d" }), f({ toSeat: "e" })], fromSeat: "a", toSeat: "b" })).toBe("tooMany");
    expect(inviteRefusal({ list: [f({ status: "played" })], fromSeat: "a", toSeat: "b" })).toBeNull();
    expect(pruneFriendlies([f({})], "2027-03-10")[0]!.status).toBe("cancelled");
    expect(pruneFriendlies([f({ status: "accepted" })], "2027-03-10")[0]!.status).toBe("accepted");
  });
});
