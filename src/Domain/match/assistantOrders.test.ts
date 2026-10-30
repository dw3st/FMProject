import { expect, test } from "bun:test";
import { ASSISTANT_ORDERS, assistantFollows } from "@/Domain/match/assistantOrders";

test("the assistant follows below the chance and ignores above it", () => {
  expect(assistantFollows(() => 0)).toBe(true);
  expect(assistantFollows(() => ASSISTANT_ORDERS.FOLLOW - 0.01)).toBe(true);
  expect(assistantFollows(() => ASSISTANT_ORDERS.FOLLOW)).toBe(false);
  expect(assistantFollows(() => 0.99)).toBe(false);
});
