import { describe, expect, test } from "bun:test";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import type { Squad } from "@/types/playerTypes";

describe("foreman", () => {
  test("no staff (AI): neutral; vacant: 2 stars", () => {
    expect(foremanSpeedOf({} as Squad)).toBe(1);
    const vacant = { staff: { members: [] } } as unknown as Squad;
    expect(foremanStarsOf(vacant)).toBe(2);
    expect(foremanSpeedOf(vacant)).toBeGreaterThan(1);
  });
});
