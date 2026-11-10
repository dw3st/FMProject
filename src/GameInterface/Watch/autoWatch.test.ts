import { describe, expect, test } from "bun:test";
import { autoWatchSeat, hiddenKey, stillPlaying } from "@/GameInterface/Watch/autoWatch";
import type { RivalRow } from "@/types/rivalsTypes";

const row = (seatId: string, o: Partial<RivalRow> = {}): RivalRow => ({
  seatId, nickname: seatId, managerName: seatId, face: null, nationalityIso: null, clubId: `c_${seatId}`, clubName: seatId,
  clubColors: ["#000000", "#ffffff"], leagueSlug: "l", leaguePosition: 1, form: [], last: null, next: null,
  friendsRank: 1, friendsTotal: 2, live: null, bets: { open: 0, net: 0 }, me: false, ...o,
});
const live = (status: "live" | "half" | "ended") => ({ status, minute: 30 } as unknown as RivalRow["live"]);
const today = "2031-11-02";

describe("friend's match on the dashboard", () => {
  test("opens a friend playing live when you have no match today", () => {
    expect(autoWatchSeat([row("me", { me: true }), row("fabio", { live: live("live") })], today, "s", [])).toBe("fabio");
    expect(autoWatchSeat([row("me", { me: true }), row("fabio", { live: live("half") })], today, "s", [])).toBe("fabio");
  });

  test("never with a match of your own today, a finished match or one you hid", () => {
    const fabio = row("fabio", { live: live("live") });
    const next = { date: today, opponentId: "x", opponentName: "X", home: true, competition: "l" };
    expect(autoWatchSeat([row("me", { me: true, next }), fabio], today, "s", [])).toBeNull();
    expect(autoWatchSeat([row("me", { me: true, live: live("live") }), fabio], today, "s", [])).toBeNull();
    expect(autoWatchSeat([row("me", { me: true }), row("fabio", { live: live("ended") })], today, "s", [])).toBeNull();
    expect(autoWatchSeat([row("me", { me: true }), fabio], today, "s", [hiddenKey("s", "fabio", today)])).toBeNull();
  });

  test("still playing until his match ends", () => {
    expect(stillPlaying([row("fabio", { live: live("live") })], "fabio")).toBe(true);
    expect(stillPlaying([row("fabio", { live: live("ended") })], "fabio")).toBe(false);
    expect(stillPlaying([], "fabio")).toBe(false);
  });
});
