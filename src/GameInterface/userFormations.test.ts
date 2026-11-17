import { describe, expect, test } from "bun:test";
import { CUSTOM_PRESETS, customToFormation } from "@/Domain/formation/zones";
import { formationForSimId } from "@/Domain/matchFormations";
import { h2hFormationCommand } from "@/GameInterface/userFormations";

describe("h2hFormationCommand", () => {
  const custom = CUSTOM_PRESETS["3-2-4-1"]!;
  test("a free formation goes with its slots under its own id", () => {
    const own = { id: "user:B", label: "B", formation: { ...customToFormation(custom), id: "user:B" }, custom };
    expect(h2hFormationCommand(own, "user:B")).toEqual({ kind: "formation", formation: "user:B", custom });
  });
  test("a saved line-up on a ready-made formation goes by that id", () => {
    const own = { id: "user:A", label: "A", formation: { ...formationForSimId("4-4-2"), id: "user:A" }, readyId: "4-4-2" };
    expect(h2hFormationCommand(own, "user:A")).toEqual({ kind: "formation", formation: "4-4-2" });
  });
  test("a ready-made id passes, anything else is nothing", () => {
    expect(h2hFormationCommand(undefined, "3-5-2")).toEqual({ kind: "formation", formation: "3-5-2" });
    expect(h2hFormationCommand(undefined, "custom")).toBeNull();
  });
});
