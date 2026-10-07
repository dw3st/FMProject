import { expect, test } from "bun:test";
import { tmPosition } from "@/../scripts/transfermarkt/positions";

test("maps every Transfermarkt position", () => {
  expect(tmPosition("Goalkeeper")).toBe("GK");
  expect(tmPosition("Centre-Back")).toBe("CB");
  expect(tmPosition("Left-Back")).toBe("LB");
  expect(tmPosition("Right-Back")).toBe("RB");
  expect(tmPosition("Defensive Midfield")).toBe("CDM");
  expect(tmPosition("Central Midfield")).toBe("CM");
  expect(tmPosition("Attacking Midfield")).toBe("CAM");
  expect(tmPosition("Left Midfield")).toBe("LM");
  expect(tmPosition("Right Midfield")).toBe("RM");
  expect(tmPosition("Left Winger")).toBe("LW");
  expect(tmPosition("Right Winger")).toBe("RW");
  expect(tmPosition("Centre-Forward")).toBe("ST");
  expect(tmPosition("Second Striker")).toBe("ST");
});

test("generic or unknown → null", () => {
  expect(tmPosition("Defender")).toBeNull();
  expect(tmPosition(null)).toBeNull();
  expect(tmPosition("Sweeper")).toBeNull();
});
