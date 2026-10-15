import { saveService } from "@/backend/SaveService";
import { addSaveMember } from "@/backend/auth/saveOwnership";

/** Tests: makes `userId` the owner of the only seat of a solo save; returns the seat id. */
export async function ownSolo(saveId: string, userId: string): Promise<string> {
  const world = await saveService.getWorldMeta(saveId);
  const seatId = world?.seats[0];
  if (!seatId) throw new Error(`ownSolo: save ${saveId} has no seat`);
  addSaveMember(saveId, userId, seatId, "owner");
  return seatId;
}
