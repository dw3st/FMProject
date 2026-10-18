import { expect, test } from "bun:test";
import { variantAutoLabel } from "@/lab/labNames";

test("variant label shows the weather", () => {
  const label = variantAutoLabel({ formation: "4-3-3", tacticalStyle: "balanced", weather: "rain" } as never);
  expect(label).toContain("· rain");
});
