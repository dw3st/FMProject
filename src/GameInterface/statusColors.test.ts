import { describe, expect, test } from "bun:test";
import { availabilityOf } from "@/GameInterface/statusColors";

describe("availabilityOf", () => {
  test("injured, suspended or away with the national team is unavailable", () => {
    expect(availabilityOf({ status: "injured", energy: 100 })).toBe("unavailable");
    expect(availabilityOf({ status: "suspended", energy: 100 })).toBe("unavailable");
    expect(availabilityOf({ status: "fit", energy: 100, nationalDutyUntil: "2027-03-30" })).toBe("unavailable");
  });
  test("a tired fit player needs rhythm, a fresh one is ready", () => {
    expect(availabilityOf({ status: "fit", energy: 70 })).toBe("rhythm");
    expect(availabilityOf({ status: "fit", energy: 90 })).toBe("ready");
  });
});
