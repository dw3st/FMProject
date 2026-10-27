import { expect, test } from "bun:test";
import { publicWorldMeta } from "@/Domain/multiplayer/worldPublic";

test("createdBy is stripped from the world; a meta without world is untouched", () => {
  const out = publicWorldMeta({ id: "s", world: { phase: "lobby" as const, inviteCode: "X", deadlineHours: 24 as const, createdBy: "user-1" } });
  expect(out.world).toEqual({ phase: "lobby", inviteCode: "X", deadlineHours: 24 });
  expect(JSON.stringify(out)).not.toContain("createdBy");
  const solo: { id: string; world?: undefined } = { id: "s" };
  expect(publicWorldMeta(solo)).toBe(solo);
});

test("a public world also drops its internal invite code", () => {
  const out = publicWorldMeta({
    id: "s",
    world: { phase: "running" as const, inviteCode: "SECRETCODE", deadlineHours: null, createdBy: "server", kind: "public" as const },
  });
  expect(out.world).toEqual({ phase: "running", deadlineHours: null, kind: "public" });
  expect(JSON.stringify(out)).not.toContain("SECRETCODE");
});
