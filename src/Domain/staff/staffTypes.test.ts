import { describe, expect, test } from "bun:test";
import { COACH_AREAS, ROLE_SPECIALTY, STAFF_ROLES, TRAINING_AREAS, isStaffRole } from "@/Domain/staff/staffTypes";
import { STAFF } from "@/Domain/staff/staffConfig";

describe("staff types", () => {
  test("nine roles, seven training areas, five coach areas", () => {
    expect([...STAFF_ROLES]).toEqual(["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout", "fieldScout", "groundskeeper"]);
    expect([...TRAINING_AREAS].sort()).toEqual(["defending", "goalkeeping", "passing", "physical", "setPieces", "shooting", "technical"]);
    expect([...COACH_AREAS]).toEqual(["defending", "shooting", "technical", "passing", "setPieces"]);
    expect(isStaffRole("coach")).toBe(true);
    expect(isStaffRole("nope")).toBe(false);
  });
  test("every non-coach role has a specialty", () => {
    for (const r of STAFF_ROLES) if (r !== "coach") expect(ROLE_SPECIALTY[r]).toBeDefined();
  });
  test("limits by tier and wage shares", () => {
    expect(STAFF.LIMITS.coach).toEqual({ LOW: 3, MEDIUM: 3, HIGH: 4, ELITE: 5 });
    expect(STAFF.LIMITS.fieldScout).toBe(4);
    for (const r of STAFF_ROLES) expect(STAFF.WAGE_ROLE_SHARE[r]).toBeGreaterThan(0);
    expect(STAFF.POOL.BY_ROLE).toBeDefined();
    expect(Object.values(STAFF.POOL.BY_ROLE).reduce((a, b) => a + b, 0)).toBe(STAFF.POOL.SIZE);
  });
});
