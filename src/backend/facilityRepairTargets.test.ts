import { describe, expect, test } from "bun:test";
import { repairTargets } from "@/backend/facilityRoutes";

describe("repairTargets", () => {
  test("three distinct steps from a worn item", () => {
    expect(repairTargets(30)).toEqual({ "25": 55, "50": 80, "100": 100 });
  });

  test("+50 reaching 100% is dropped; +25 stays while it is below it", () => {
    expect(repairTargets(60)).toEqual({ "25": 85, "50": null, "100": 100 });
  });

  test("+25 and +50 both reaching 100%: only 'to 100%' remains", () => {
    expect(repairTargets(80)).toEqual({ "25": null, "50": null, "100": 100 });
  });
});
