import { expect, test } from "bun:test";
import { sackHumanManager } from "@/Domain/jobs/jobs";
import type { ManagerRecord } from "@/types/managerTypes";

test("a manager who leaves the world is free, with the passage closed as left_world, and an interim takes over", () => {
  const me: ManagerRecord = {
    id: "seat:s1", seatId: "s1", name: "Ana", squadId: "33", points: 0, seasons: 0, titles: [],
    clubs: [{ squadId: "33", from: "2026-08-15" }],
  };
  const out = sackHumanManager([me], { seatId: "s1", date: "2026-10-01", clubName: "Man Utd", left: "left_world" });
  const after = out.find((m) => m.seatId === "s1")!;
  expect(after.squadId).toBe("");
  expect(after.freeSince).toBe("2026-10-01");
  expect(after.clubs).toEqual([{ squadId: "33", from: "2026-08-15", to: "2026-10-01", left: "left_world" }]);
  expect(out.filter((m) => m.squadId === "33" && m.interim)).toHaveLength(1);
});
