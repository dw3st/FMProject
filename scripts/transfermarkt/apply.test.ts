import { expect, test } from "bun:test";
import { applyDerived } from "@/../scripts/transfermarkt/apply";
import ROLES from "@/Data/roles.json";
import { computeOverallAvg, fixedNaturalRole } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";

const p = { id: "x", name: "x", age: 25, positions: ["Defender"], preferredFoot: "right", nationality: "Brazil",
  stats: { passing: 5, vision: 5, finishing: 3, dribbling: 5, speed: 6, acceleration: 6, tackling: 6,
    pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 1, jump: 3 } } as unknown as RosterPlayer;

test("sets the natural position, line and target overall", () => {
  const r = applyDerived(p, { naturalPosition: "RB", targetOverall: 6.2, birthDate: "2001-01-01", heightCm: 180 }, ROLES as never);
  expect(fixedNaturalRole(r)).toBe("RB");
  expect(Math.abs(computeOverallAvg(r) - 6.2)).toBeLessThan(0.05);
  expect(r.birthDate).toBe("2001-01-01");
  expect(r.heightCm).toBe(180);
});

test("a Transfermarkt line different from positions[0] wins", () => {
  const r = applyDerived(p, { naturalPosition: "CM" }, ROLES as never);
  expect(r.positions[0]).toBe("Midfielder");
  expect(fixedNaturalRole(r)).toBe("CM");
});

test("idempotent", () => {
  const once = applyDerived(p, { naturalPosition: "RB", targetOverall: 6.2 }, ROLES as never);
  expect(applyDerived(once, { naturalPosition: "RB", targetOverall: 6.2 }, ROLES as never)).toEqual(once);
  expect(applyDerived(once, { naturalPosition: "RB", targetOverall: 6.2 }, ROLES as never)).toBe(once);
});

test("nationality fills only a missing one", () => {
  expect(applyDerived({ ...p, nationality: undefined } as RosterPlayer, { nationality: "Cameroon" }, ROLES as never).nationality)
    .toBe("Cameroon");
  expect(applyDerived(p, { nationality: "Cameroon" }, ROLES as never)).toBe(p);
});

test("the input player is never mutated", () => {
  const copy = structuredClone(p);
  applyDerived(p, { naturalPosition: "CM", targetOverall: 6.5 }, ROLES as never);
  expect(p).toEqual(copy);
});
