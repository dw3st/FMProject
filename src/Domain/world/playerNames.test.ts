import { describe, expect, test } from "bun:test";
import { buildNameFixes, expandedName, fixedPlayerName, withFixedPlayerNames } from "@/Domain/world/playerNames";

describe("expandedName", () => {
  test("uses the given name that starts with the initial", () => {
    expect(expandedName("J. Bellingham", "Jude Victor William Bellingham")).toBe("Jude Bellingham");
    expect(expandedName("N. Collins", "Pharrell Nnamdi Collins")).toBe("Nnamdi Collins");
  });
  test("ignores accents on the initial", () => {
    expect(expandedName("E. Fernández", "Ignacio Ezequiél Agustín Fernández Carballo")).toBe("Ezequiél Fernández");
    expect(expandedName("Á. Díaz", "Alvaro Díaz")).toBe("Alvaro Díaz");
  });
  test("null when not abbreviated, without a full name, or when nothing matches", () => {
    expect(expandedName("Dudu", "Eduardo Pereira Rodrigues")).toBeNull();
    expect(expandedName("J. Bellingham", undefined)).toBeNull();
    expect(expandedName("P. Goncalves", "P. Goncalves")).toBeNull();
  });
});

describe("buildNameFixes", () => {
  test("only shared abbreviated names that a full name can expand", () => {
    expect(
      buildNameFixes([
        { id: "a", name: "J. Bellingham", fullName: "Jude Bellingham" },
        { id: "b", name: "J. Bellingham", fullName: "Jobe Bellingham" },
        { id: "c", name: "H. Kane", fullName: "Harry Kane" },
        { id: "d", name: "Dudu", fullName: "Eduardo Rodrigues" },
        { id: "e", name: "Dudu" },
        { id: "f", name: "P. Goncalves", fullName: "P. Goncalves" },
        { id: "g", name: "P. Goncalves", fullName: "P. Goncalves" },
      ]),
    ).toEqual({ a: "Jude Bellingham", b: "Jobe Bellingham" });
  });
});

describe("the world's table", () => {
  test("tells the Bellingham brothers apart", () => {
    expect(fixedPlayerName({ id: "player_3614", name: "J. Bellingham" }).name).toBe("Jude Bellingham");
    expect(fixedPlayerName({ id: "player_2322", name: "J. Bellingham" }).name).toBe("Jobe Bellingham");
  });
  test("leaves everyone else untouched, same objects", () => {
    const squad = { players: [{ id: "someone_else", name: "H. Kane" }] };
    expect(withFixedPlayerNames(squad)).toBe(squad);
    const fixed = withFixedPlayerNames({ players: [{ id: "player_3614", name: "J. Bellingham" }, squad.players[0]!] });
    expect(fixed.players.map((p) => p.name)).toEqual(["Jude Bellingham", "H. Kane"]);
  });
});
