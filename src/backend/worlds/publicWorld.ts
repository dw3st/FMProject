import { saveService as defaultService, type SaveService } from "@/backend/SaveService";
import { presimulateWorld } from "@/backend/advanceDay";
import { withSaveLock } from "@/backend/saveLock";
import { announceMemberChange, deleteWorld } from "@/backend/worlds/worldLifecycle";
import { seenAt } from "@/backend/worlds/publicSeen";
import { removeSeat } from "@/backend/seats";
import { notifyUser } from "@/backend/social/realtime";
import { newWorldCode, setWorldCode } from "@/backend/worlds/worldStore";
import { closeOpenEditions, editionOf, listEditions, openEdition, saveEditionStandings } from "@/backend/worlds/publicStore";
import { standingsView } from "@/backend/standingsWorld";
import { defaultGroupDeps, isWorldAdvancing, kickWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { dueSlot, inactivityAction, publicStepTarget } from "@/Domain/multiplayer/publicWorld";
import { buildInactiveWarningMessage } from "@/Domain/inbox/worldAdvanceMessage";
import { rankOf } from "@/Domain/multiplayer/standings";
import { addDays } from "@/Domain/dates";
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

/** How far ahead (game days) a step looks for its target. */
const STEP_HORIZON_DAYS = 60;

/** Days after `from`, up to `until`, with a round of any public league (the date-index keys), ascending. */
async function worldRoundDays(service: SaveService, saveId: string, from: string, until: string): Promise<string[]> {
  const out = new Set<string>();
  for (const slug of PUBLIC_WORLD.LEAGUES) {
    const idx = await service.getDateIndex(saveId, slug).catch(() => null);
    for (const d of Object.keys(idx ?? {})) if (d > from && d <= until) out.add(d);
  }
  return [...out].sort();
}

/**
 * One clock tick for the public world (part 5b): a due slot sets the step's target (`publicStepTarget`: the next
 * seat game day, else the next round day of the 10 leagues) and kicks the executor, which runs the days up to it.
 * Several missed slots are one step. Returns whether a step started.
 */
export async function publicSlotTick(saveId: string, deps: GroupAdvanceDeps = defaultGroupDeps): Promise<boolean> {
  if (isWorldAdvancing(saveId)) return false;
  const started = await withSaveLock(saveId, async () => {
    const meta = await deps.service.getMeta(saveId);
    if (!meta?.currentDate || meta.world?.kind !== "public" || meta.world.phase !== "running") return false;
    const slot = dueSlot(deps.now(), meta.world.advance?.lastSlot ?? null);
    if (!slot) return false;
    const horizon = addDays(meta.currentDate, STEP_HORIZON_DAYS);
    const seatDays = new Set<string>();
    for (const { seatId, seat } of await deps.service.listSeats(saveId)) {
      if (!seat.clubId || seat.unemployed) continue;
      for (const d of await deps.matchDates(deps.service, saveId, seatId, meta.currentDate, horizon)) seatDays.add(d);
    }
    const target = publicStepTarget(
      meta.currentDate, [...seatDays].sort(), await worldRoundDays(deps.service, saveId, meta.currentDate, horizon), horizon,
    );
    const prev = meta.world.advance ?? { running: false, waitingSince: null, target: null };
    await deps.service.updateMeta(saveId, { world: { ...meta.world, advance: { ...prev, lastSlot: slot, slotTarget: target } } });
    return true;
  });
  if (started) void kickWorld(saveId, deps).catch((e) => logError("world", `public world ${saveId}: step crashed`, e));
  return started;
}

/** The open edition's top of the standings (hall of fame), after each step; ties share a rank (`rankOf`). */
export async function updateHall(saveId: string, service: SaveService = defaultService): Promise<void> {
  const meta = await service.getMeta(saveId);
  const version = meta?.world?.edition?.version;
  if (!version) return;
  const { entries } = await standingsView(service, saveId);
  saveEditionStandings(version, entries.slice(0, PUBLIC_WORLD.HALL_TOP).map((e) => ({
    rank: rankOf(entries, e.seatId), nickname: e.nickname, clubName: e.clubName, total: e.total, seasons: e.seasons,
  })));
}

/** Writes "last seen" of the public world's seats when it moved by an hour or more (`SEEN_WRITE_MIN`). */
export async function flushSeen(saveId: string, nowMs: number, service: SaveService = defaultService): Promise<void> {
  await withSaveLock(saveId, async () => {
    for (const { seatId, seat } of await service.listSeats(saveId)) {
      const t = seenAt(saveId, seatId);
      if (!t || t > nowMs) continue;
      const prev = seat.lastSeenAt ? Date.parse(seat.lastSeenAt) : 0;
      if (t - prev < PUBLIC_WORLD.SEEN_WRITE_MIN * 60_000) continue;
      await service.updateSeat(saveId, seatId, { lastSeenAt: new Date(t).toISOString() });
    }
  });
}

/** Warns a seat away for `WARN_DAYS`, removes it at `INACTIVE_DAYS` (`removeSeat`: the club back to the AI). */
export async function inactivityPass(saveId: string, nowMs: number, service: SaveService = defaultService): Promise<void> {
  const date = (await service.getMeta(saveId))?.currentDate;
  if (!date) return;
  for (const { seatId, seat } of await service.listSeats(saveId)) {
    const action = inactivityAction(seat.lastSeenAt ?? null, seat.inactiveWarnedAt ?? null, nowMs);
    if (action === "warn") {
      const removeOn = new Date(Date.parse(seat.lastSeenAt!) + PUBLIC_WORLD.INACTIVE_DAYS * 86_400_000).toISOString().slice(0, 10);
      await withSaveLock(saveId, async () => {
        await service.appendInbox(saveId, buildInactiveWarningMessage({ date, removeOn }), seatId);
        await service.updateSeat(saveId, seatId, { inactiveWarnedAt: new Date(nowMs).toISOString() });
      });
    } else if (action === "remove") {
      // `removeSeat` takes the save lock itself.
      await removeSeat(saveId, seatId, {
        onLocked: async (removed) => {
          // He is no longer in save_members: tell him directly.
          if (removed.userId) notifyUser(removed.userId, { type: "world_removed", saveId });
          await announceMemberChange(saveId, {
            seatId, event: "removed", managerName: removed.managerName, clubId: removed.clubId,
            clubName: removed.clubName, leagueSlug: removed.leagueSlug,
          }, service);
        },
      }).catch((e) => logError("world", `public world ${saveId}: inactive seat ${seatId} not removed`, e));
    }
  }
}
