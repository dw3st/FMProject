import { saveService, type SaveMeta, type SaveService, type SeatMeta } from "@/backend/SaveService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { splitSeatPatch } from "@/Domain/seats/seats";

/** Tests and scripts: the only seat of a solo save (throws when the world has none or more than one). */
export async function soloSeatId(saveId: string, service: SaveService = saveService): Promise<string> {
  const world = await service.getMeta(saveId);
  const [onlySeat] = world?.seats ?? [];
  if (!onlySeat || world!.seats.length !== 1) throw new Error(`soloSeatId: save ${saveId} is not a solo world`);
  return onlySeat;
}

/** Tests and scripts: the merged meta of the only seat of a solo save. */
export async function soloMeta(saveId: string, service: SaveService = saveService): Promise<SeatMeta | null> {
  return service.getSeatMeta(saveId, await soloSeatId(saveId, service));
}

/**
 * Tests and scripts: patches a solo save as the meta was patched before seats — the world keys go to the world
 * meta, the seat keys to its only seat (`splitSeatPatch`). Returns the merged meta.
 */
export async function updateSolo(
  saveId: string,
  patch: Partial<Omit<SeatMeta, "id" | "createdAt" | "seatId">>,
  service: SaveService = saveService,
): Promise<SeatMeta> {
  const seatId = await soloSeatId(saveId, service);
  const { world, seat } = splitSeatPatch(patch);
  if (Object.keys(world).length > 0) await service.updateMeta(saveId, world as Partial<SaveMeta>);
  if (Object.keys(seat).length > 0) await service.updateSeat(saveId, seatId, seat);
  return (await service.getSeatMeta(saveId, seatId))!;
}

/** Tests: makes `userId` the owner of the only seat of a solo save; returns the seat id. */
export async function ownSolo(saveId: string, userId: string): Promise<string> {
  const seatId = await soloSeatId(saveId);
  addSaveMember(saveId, userId, seatId, "owner");
  return seatId;
}

/** Tests: a live recording keyed by the only seat of a solo save (`advanceOneDay`/`runBufferedDay` take one per seat). */
export async function soloRecording<R>(saveId: string, recording: R): Promise<Record<string, R>> {
  return { [await soloSeatId(saveId)]: recording };
}
