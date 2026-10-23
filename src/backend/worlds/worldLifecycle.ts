import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import { deleteSaveMembers, listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { notifyWorld } from "@/backend/worlds/worldNotify";
import { deleteWorldCode, deleteWorldInvites, newWorldCode, setWorldCode } from "@/backend/worlds/worldStore";
import { WORLD } from "@/Domain/multiplayer/worldConfig";
import { buildWorldMemberMessage, worldMemberNews, type MemberChange } from "@/Domain/multiplayer/worldMessages";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import type { MemberRole } from "@/types/seatTypes";
import type { WorldMemberView, WorldState, WorldView } from "@/types/multiplayerTypes";

/** A new world of friends: `lobby`, a fresh invite code, the default deadline (`POST /api/saves` with `mode: "multi"`). */
export async function createWorldState(saveId: string, userId: string, service: SaveService = defaultService): Promise<WorldState> {
  const inviteCode = newWorldCode();
  const world: WorldState = { phase: "lobby", inviteCode, deadlineHours: WORLD.DEFAULT_DEADLINE, createdBy: userId };
  setWorldCode(saveId, inviteCode);
  await service.updateMeta(saveId, { mode: "multi", world });
  return world;
}

/**
 * Who the league belongs to, as every screen names it ("Emy's league"): the owner's nickname, else his manager's
 * name. Never the save name (that is the owner's club).
 */
export async function worldOwnerName(saveId: string, service: SaveService = defaultService): Promise<string> {
  const owner = listSaveMembers(saveId).find((m) => m.role === "owner");
  if (!owner) return "";
  const nickname = getSocialUser(owner.userId)?.nickname;
  if (nickname) return nickname;
  const seat = await service.getSeat(saveId, owner.seatId).catch(() => null);
  return seat?.manager?.name ?? "";
}

/** The world's screen (`GET /api/worlds/:saveId`); null for a solo save. */
export async function worldView(
  saveId: string, me: { seatId: string; role: MemberRole }, service: SaveService = defaultService,
): Promise<WorldView | null> {
  const meta = await service.getMeta(saveId);
  if (!meta?.world || meta.mode !== "multi") return null;
  const bySeat = new Map(listSaveMembers(saveId).map((m) => [m.seatId, m]));
  const members: WorldMemberView[] = [];
  for (const { seatId, seat } of await service.listSeats(saveId)) {
    const m = bySeat.get(seatId);
    if (!m) continue;
    members.push({
      seatId,
      role: m.role,
      nickname: getSocialUser(m.userId)?.nickname ?? null,
      managerName: seat.manager?.name ?? "",
      face: seat.manager?.face ?? null,
      nationalityIso: seat.manager?.nationalityIso ?? null,
      clubId: seat.clubId,
      clubName: seat.clubName,
      clubColors: seat.clubColors,
      leagueSlug: seat.leagueSlug,
      leagueName: seat.leagueName,
      unemployed: !!seat.unemployed,
    });
  }
  return {
    saveId, owner: await worldOwnerName(saveId, service), phase: meta.world.phase, inviteCode: meta.world.inviteCode,
    deadlineHours: meta.world.deadlineHours, max: WORLD.MAX_MEMBERS, currentDate: meta.currentDate ?? null,
    myRole: me.role, mySeatId: me.seatId, members,
  };
}

/** Deletes the world for everyone; the other members get `world_deleted`. */
export async function deleteWorld(saveId: string, actorUserId: string, service: SaveService = defaultService): Promise<void> {
  const others = listSaveMembers(saveId).map((m) => m.userId).filter((u) => u !== actorUserId);
  await service.deleteSave(saveId);
  deleteSaveMembers(saveId);
  deleteWorldCode(saveId);
  deleteWorldInvites(saveId);
  for (const u of others) notifyUser(u, { type: "world_deleted", saveId });
}

/**
 * A manager joined or left: a message in every other seat's inbox, a world news item and `world_members` on the
 * socket (the world screen reloads).
 */
export async function announceMemberChange(saveId: string, change: MemberChange, service: SaveService = defaultService): Promise<void> {
  const meta = await service.getMeta(saveId);
  const date = meta?.currentDate;
  if (!date) return;
  for (const { seatId } of await service.listSeats(saveId)) {
    if (seatId === change.seatId) continue;
    await emitInboxMessage(saveId, buildWorldMemberMessage(date, change), service, seatId);
  }
  await service.appendNews(saveId, [worldMemberNews(date, change)]);
  notifyWorld(saveId, { type: "world_members", saveId });
}
