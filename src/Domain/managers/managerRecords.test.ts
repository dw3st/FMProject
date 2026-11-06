import { describe, expect, test } from "bun:test";
import { addManagerCards } from "@/Domain/managers/managerRecords";
import type { ManagerRecord } from "@/types/managerTypes";

const rec = (id: string): ManagerRecord => ({ id, name: id, squadId: "x", points: 0, seasons: 0, titles: [] });

describe("addManagerCards", () => {
  test("adds yellows and reds to that manager only", () => {
    const once = addManagerCards([rec("seat:a"), rec("b")], "seat:a", [{ card: "yellow" }, { card: "red" }]);
    const twice = addManagerCards(once, "seat:a", [{ card: "yellow" }]);
    expect(twice[0]!.cards).toEqual({ yellow: 2, red: 1 });
    expect(twice[1]!.cards).toBeUndefined();
  });
});
