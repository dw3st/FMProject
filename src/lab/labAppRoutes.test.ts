import { expect, test } from "bun:test";
import { apiRoutes } from "@/backend/routes";
import { labAppRoutes } from "@/lab/labAppRoutes";

test("the lab serves the app's API without the social routes (it has no socket)", () => {
  const paths = Object.keys(labAppRoutes(apiRoutes));
  expect(paths.some((p) => p.startsWith("/api/social/"))).toBe(false);
  expect(paths).toContain("/api/presence/ping");
});
