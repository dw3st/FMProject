import { describe, expect, test } from "bun:test";
import { clubAttractionStars, interestWage, staffInterestOf } from "@/Domain/staff/staffInterest";
import { staffWageFor } from "@/Domain/staff/staff";

describe("staff interest (e6707450)", () => {
  test("attraction falls with the division and rises with reputation", () => {
    expect(clubAttractionStars(3, 1, 40)).toBe(3);
    expect(clubAttractionStars(3, 3, 40)).toBe(2);
    expect(clubAttractionStars(3, 1, 80)).toBe(3.5);
    expect(clubAttractionStars(3, 1, 100)).toBe(3.5);
    expect(clubAttractionStars(2.5, 9, 0)).toBe(0.5);
  });

  test("bands by the gap", () => {
    expect(staffInterestOf(3, 2.5)).toEqual({ interest: "interested", premium: 0 });
    expect(staffInterestOf(3.5, 2.5)).toEqual({ interest: "hesitant", premium: 0.4 });
    expect(staffInterestOf(4, 2.5)).toEqual({ interest: "hesitant", premium: 0.6 });
    expect(staffInterestOf(4.5, 2.5).interest).toBe("refuses");
  });

  test("Série C example: 2 stars normal, 3 stars hesitant, 4 stars refuse", () => {
    const att = clubAttractionStars(2.5, 3, 40); // LOW club in the third division
    expect(staffInterestOf(2, att).interest).toBe("interested");
    expect(staffInterestOf(3, att)).toEqual({ interest: "hesitant", premium: 0.6 });
    expect(staffInterestOf(4, att).interest).toBe("refuses");
  });

  test("a hesitant one asks the market wage, no revenue ceiling, plus the premium", () => {
    const view = { interest: "hesitant" as const, premium: 0.4 };
    expect(interestWage("coach", 4, 1, 1_000_000, view)).toBe(Math.round(staffWageFor("coach", 4, 1) * 1.4));
    expect(interestWage("coach", 2, 1, 1_000_000, { interest: "interested", premium: 0 })).toBe(staffWageFor("coach", 2, 1, 1_000_000));
  });
});
