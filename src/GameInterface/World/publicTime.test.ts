import { expect, test } from "bun:test";
import { brasiliaTime } from "@/GameInterface/World/publicTime";

test("brasiliaTime: the step's time in Brasília (UTC-3)", () => {
  expect(brasiliaTime("2026-10-26T21:00:00.000Z", "pt-BR")).toBe("18:00");
  expect(brasiliaTime("2026-10-27T12:00:00.000Z", "en")).toBe("09:00");
  expect(brasiliaTime(null, "en")).toBe("");
  expect(brasiliaTime("nope", "en")).toBe("");
});
