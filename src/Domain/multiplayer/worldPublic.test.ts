import { expect, test } from "bun:test";
import { publicWorldMeta } from "@/Domain/multiplayer/worldPublic";

test("createdBy is stripped from the world; a meta without world is untouched", () => {
  const out = publicWorldMeta({ id: "s", world: { phase: "lobby" as const, inviteCode: "X", deadlineHours: 24 as const, createdBy: "user-1" } });
  expect(out.world).toEqual({ phase: "lobby", inviteCode: "X", deadlineHours: 24 });
  expect(JSON.stringify(out)).not.toContain("createdBy");
  const solo: { id: string; world?: undefined } = { id: "s" };
  expect(publicWorldMeta(solo)).toBe(solo);
});
