import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { notifyUser } from "@/backend/social/realtime";
import type { ServerEvent } from "@/types/socialTypes";

/** Sends `event` to every member of the world (`save_members`) but `exceptUserId`. */
export function notifyWorld(saveId: string, event: ServerEvent, exceptUserId?: string): void {
  for (const m of listSaveMembers(saveId)) if (m.userId !== exceptUserId) notifyUser(m.userId, event);
}
