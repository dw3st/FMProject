import { describe, expect, test } from "bun:test";
import { parseSeatManager } from "@/Domain/multiplayer/seatManager";

describe("parseSeatManager", () => {
  test("a valid manager, trimmed", () => {
    expect(parseSeatManager({ name: "  Ana Lima ", nationalityIso: "br", backgroundId: "former-player" }))
      .toEqual({ name: "Ana Lima", nationalityIso: "br", backgroundId: "former-player" });
  });

  test("the avatar is validated", () => {
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: 12 } }))
      .toEqual({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: 12 } });
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "analyst", face: { seed: "x" } })).toBeNull();
  });

  test("short or long name, unknown nationality or background, wrong shape", () => {
    expect(parseSeatManager({ name: "A", nationalityIso: "br", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "x".repeat(41), nationalityIso: "br", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "Ana", nationalityIso: "zz", backgroundId: "analyst" })).toBeNull();
    expect(parseSeatManager({ name: "Ana", nationalityIso: "br", backgroundId: "wizard" })).toBeNull();
    expect(parseSeatManager(null)).toBeNull();
    expect(parseSeatManager([])).toBeNull();
  });
});
