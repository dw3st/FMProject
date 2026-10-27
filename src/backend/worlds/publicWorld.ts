import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import { presimulateWorld } from "@/backend/advanceDay";
import { withSaveLock } from "@/backend/saveLock";
import { deleteWorld } from "@/backend/worlds/worldLifecycle";
import { newWorldCode, setWorldCode } from "@/backend/worlds/worldStore";
import { closeOpenEditions, editionOf, listEditions, openEdition } from "@/backend/worlds/publicStore";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { GAME_VERSION } from "@/Domain/saveVersion";
import { logError } from "@/Logger";
import type { WorldState } from "@/types/multiplayerTypes";

export interface PublicDeps { version?: string; now?: () => number; service?: SaveService }

/** The current public world's save id (the open edition of this version), or null. */
export function publicWorldId(version: string = GAME_VERSION): string | null {
  return editionOf(version)?.saveId ?? null;
}

/**
 * Server start: the public world of this version, created if missing (`.claude/rules/game/multiplayer.md`, part 5b).
 * Older editions are closed in the hall of fame and their saves deleted.
 */
export async function ensurePublicWorld(deps: PublicDeps = {}): Promise<string> {
  const version = deps.version ?? GAME_VERSION;
  const service = deps.service ?? defaultService;
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();
  const existing = editionOf(version);
  if (existing && (await service.getMeta(existing.saveId))) return existing.saveId;

  for (const old of listEditions()) {
    if (old.version === version) continue;
    if (await service.getMeta(old.saveId)) {
      await deleteWorld(old.saveId, "server", service).catch((e) => logError("world", `public world ${old.saveId}: delete failed`, e));
    }
  }
  closeOpenEditions(nowIso, version);

  const meta = await service.createSave({ worldOnly: true, leagueSlug: PUBLIC_WORLD.START_LEAGUE });
  const saveId = meta.id;
  // The code only lets the deadline clock find the world (`listWorldCodeIds`); the join routes refuse it.
  const code = newWorldCode();
  setWorldCode(saveId, code);
  const world: WorldState = {
    phase: "running", inviteCode: code, deadlineHours: null, createdBy: "server",
    kind: "public", edition: { version, startedOn: nowIso },
  };
  await service.updateMeta(saveId, { mode: "multi", world });
  await withSaveLock(saveId, () => presimulateWorld(saveId, null));
  openEdition(version, saveId, nowIso);
  return saveId;
}
