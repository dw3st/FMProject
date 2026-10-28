import { expect, test } from "bun:test";
import { homeAwayOf } from "@/Domain/rivals/homeAway";

const base = { seatId: "s", nickname: "fa3sd", clubId: "rm", clubName: "Real Madrid", opponentId: "ge", opponentName: "Getafe", fixtureId: "f", date: "2026-12-27" };

test("away: the opponent comes first and the score flips", () => {
  expect(homeAwayOf({ ...base, home: false, score: { for: 2, against: 1 } }))
    .toEqual({ homeId: "ge", homeName: "Getafe", awayId: "rm", awayName: "Real Madrid", home: 1, away: 2, aggregate: null });
});

test("home: unchanged", () => {
  expect(homeAwayOf({ ...base, home: true, score: { for: 0, against: 0 } }).homeId).toBe("rm");
});

test("two-legged tie: the aggregate adds the first leg, in home / away order", () => {
  // Real Madrid away today, lost the first leg at home 0–1 (for 0, against 1), 2–1 up now: 2–2 on aggregate.
  const x = homeAwayOf({ ...base, home: false, score: { for: 2, against: 1 }, aggregate: { for: 0, against: 1 } });
  expect(x.aggregate).toEqual({ home: 2, away: 2 });
});
