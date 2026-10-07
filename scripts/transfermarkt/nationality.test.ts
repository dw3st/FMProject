import { expect, test } from "bun:test";
import { worldNationality } from "@/../scripts/transfermarkt/nationality";

test("maps Transfermarkt spellings to the world's", () => {
  expect(worldNationality("Cote d'Ivoire")).toBe("Côte d’Ivoire");
  expect(worldNationality("The Gambia")).toBe("Gambia");
  expect(worldNationality("Korea, South")).toBe("South Korea");
  expect(worldNationality("Congo")).toBe("Congo - Brazzaville");
  expect(worldNationality("DR Congo")).toBe("DR Congo");
  expect(worldNationality("Curacao")).toBe("Curaçao");
  expect(worldNationality(" Brazil ")).toBe("Brazil");
});

test("names without a flag and empty values give null", () => {
  expect(worldNationality("Atlantis")).toBeNull();
  expect(worldNationality("")).toBeNull();
  expect(worldNationality(null)).toBeNull();
});
