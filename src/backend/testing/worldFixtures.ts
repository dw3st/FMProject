import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { SaveMeta } from "@/backend/SaveService";
import type { SeatState } from "@/types/seatTypes";
import type { WorldState } from "@/types/multiplayerTypes";

/** Tests: a running world (`SaveMeta.world`, part 2) with the given overrides. */
export function runningWorld(createdBy: string, over: Partial<WorldState> = {}): WorldState {
  return { phase: "running", inviteCode: "ABCDEFGHJK", deadlineHours: 24, createdBy, ...over };
}

/**
 * Tests: a bare multi world on disk (meta + one seat.json per id), no league data. Fast; enough for the executor with a
 * fake `runDay` and for the routes that never read fixtures. Delete with `saveService.deleteSave`.
 */
export async function fakeWorld(args: {
  seatIds: string[];
  date: string;
  world?: Partial<WorldState> | null;
  seats?: Record<string, Partial<SeatState>>;
  mode?: "solo" | "multi";
}): Promise<string> {
  const dal = new FileSystemDAL();
  const id = `test-ga-${randomUUID()}`;
  const now = new Date().toISOString();
  const meta = {
    id, name: "Group advance test", createdAt: now, updatedAt: now,
    mode: args.mode ?? "multi", seats: args.seatIds, currentDate: args.date,
    ...(args.world === null ? {} : { world: runningWorld("test-user", args.world ?? {}) }),
  } as unknown as SaveMeta;
  await dal.writeMeta(meta);
  for (const seatId of args.seatIds) {
    await dal.writeSeat(id, seatId, {
      clubId: `club-${seatId}`, clubName: `Club ${seatId}`, clubColors: ["#000000", "#ffffff"],
      leagueSlug: "premier_league", leagueName: "Premier League",
      manager: { name: `Manager ${seatId}`, nationalityIso: "br", backgroundId: "former-player" },
      ...(args.seats?.[seatId] ?? {}),
    } as SeatState);
  }
  return id;
}
