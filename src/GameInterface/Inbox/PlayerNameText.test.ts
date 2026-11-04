import { describe, expect, test } from "bun:test";
import { splitByNames } from "@/GameInterface/Inbox/PlayerNameText";

const A = { id: "1", name: "J. Silva" };
const B = { id: "2", name: "Silva" };

describe("names in an inbox line", () => {
  test("no names: the text as it is", () => expect(splitByNames("Nada aqui", [])).toEqual(["Nada aqui"]));
  test("the name in the middle and at the end", () => {
    expect(splitByNames("O J. Silva saiu", [A])).toEqual(["O ", A, " saiu"]);
    expect(splitByNames("Saiu J. Silva", [A])).toEqual(["Saiu ", A]);
  });
  test("the longest name wins, and several names all link", () => {
    expect(splitByNames("J. Silva e Silva", [B, A])).toEqual([A, " e ", B]);
  });
});
