import type { WorldState } from "@/types/multiplayerTypes";

export type PublicWorldState = Omit<WorldState, "createdBy" | "inviteCode"> & { inviteCode?: string };

/**
 * A meta as sent to the client: `world.createdBy` (a user id) never leaves the server, nor the public world's
 * internal code (it only lets the clock find the world; nobody joins with it).
 */
export function publicWorldMeta<T extends { world?: WorldState }>(meta: T): Omit<T, "world"> & { world?: PublicWorldState } {
  if (!meta.world) return meta;
  const { createdBy: _createdBy, inviteCode, ...world } = meta.world;
  return { ...meta, world: world.kind === "public" ? world : { ...world, inviteCode } };
}
