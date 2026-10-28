import { expect, test } from "bun:test";
import { reserveClubIds } from "@/Domain/cups/reserves";

test("B / II / 2 sides of a club in the same country are reserves; Willem II is not", () => {
  const ids = reserveClubIds([
    { id: "rs", name: "Real Sociedad" }, { id: "rsb", name: "Real Sociedad B" },
    { id: "z", name: "Zenit" }, { id: "z2", name: "Zenit 2" },
    { id: "w", name: "Willem II" }, { id: "at", name: "Atlético Madrid" }, { id: "atb", name: "Atletico Madrid B" },
  ]);
  expect([...ids].sort()).toEqual(["atb", "rsb", "z2"]);
});
