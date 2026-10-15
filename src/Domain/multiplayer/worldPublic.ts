import type { WorldState } from "@/types/multiplayerTypes";

/** A meta as sent to the client: `world.createdBy` (a user id) never leaves the server. */
export function publicWorldMeta<T extends { world?: WorldState }>(meta: T): Omit<T, "world"> & { world?: Omit<WorldState, "createdBy"> } {
  if (!meta.world) return meta;
  const { createdBy: _createdBy, ...world } = meta.world;
  return { ...meta, world };
}
