import type { WorldDeadline } from "@/types/multiplayerTypes";

/** Multiplayer part 2 (`.claude/rules/game/multiplayer.md`). */
export const WORLD = {
  /** Managers (seats) of a world. */
  MAX_MEMBERS: 8,
  /** Worlds one user may own (same as the save limit). */
  MAX_OWNED: 5,
  /** Pending friend-list invites of a world. */
  MAX_PENDING_INVITES: 20,
  /** Deadline a new world starts with (used by the group advance, part 3). */
  DEFAULT_DEADLINE: 24 as WorldDeadline,
  DEADLINES: [12, 24, 48] as const,
} as const;

export function isWorldDeadline(v: unknown): v is WorldDeadline {
  return v === null || v === 12 || v === 24 || v === 48;
}
