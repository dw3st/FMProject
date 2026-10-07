import { expect, test } from "bun:test";
import { stableStringify } from "@/../scripts/transfermarkt/json";

test("sorts keys at every level, keeps array order", () => {
  const a = stableStringify({ b: 1, a: { d: [3, 1], c: null } });
  const b = stableStringify({ a: { c: null, d: [3, 1] }, b: 1 });
  expect(a).toBe(b);
  expect(a).toBe('{\n  "a": {\n    "c": null,\n    "d": [\n      3,\n      1\n    ]\n  },\n  "b": 1\n}\n');
});
