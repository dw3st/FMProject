import { expect, test } from "bun:test";
import { formatBirthDate, heightCmOf } from "@/GameInterface/playerIdentity";

test("birth date follows the language and never shifts a day", () => {
  expect(formatBirthDate("2001-03-04", "pt-BR")).toBe("04/03/2001");
  expect(formatBirthDate("2001-03-04", "en")).toBe("03/04/2001");
});

test("invalid birth dates are dropped", () => {
  expect(formatBirthDate("2001-02-30", "pt-BR")).toBeNull();
  expect(formatBirthDate("03/04/2001", "pt-BR")).toBeNull();
});

test("height only when it is a positive number", () => {
  expect(heightCmOf(184)).toBe(184);
  expect(heightCmOf(undefined)).toBeNull();
  expect(heightCmOf(0)).toBeNull();
});
