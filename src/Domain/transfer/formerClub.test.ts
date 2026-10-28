import { expect, test } from "bun:test";
import { REBUY_BLOCK_DAYS, rebuyBlockedUntil, withFormerClub } from "@/Domain/transfer/formerClub";
import type { RosterPlayer } from "@/types/playerTypes";

test("the former club cannot buy him back for a year, other clubs can", () => {
  const p = withFormerClub({ id: "p" } as RosterPlayer, "human", "2027-02-03");
  expect(REBUY_BLOCK_DAYS).toBe(365);
  expect(rebuyBlockedUntil(p, "human", "2027-02-10")).toBe("2028-02-03");
  expect(rebuyBlockedUntil(p, "other", "2027-02-10")).toBeNull();
  expect(rebuyBlockedUntil(p, "human", "2028-02-03")).toBeNull();
});
