import { saveService as defaultService, type SaveMeta, type SaveService } from "@/backend/SaveService";
import { withSaveLock } from "@/backend/saveLock";
import { runBufferedDay, type AdvanceDayOutcome } from "@/backend/advanceDay";
import { seatMatchDates } from "@/backend/advanceUntil";
import { nationalFixtureOn } from "@/backend/nationalCoachWorld";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { notifyUser } from "@/backend/social/realtime";
import { listWorldCodeIds } from "@/backend/worlds/worldStore";
import { logError } from "@/Logger";
import { addDays } from "@/Domain/dates";
import {
  assistantPatches, computeGroupTarget, deadlineAt, deadlinePassed, isGroupWorld, memberStatus, seatStops,
  type GroupPlan, type GroupSeatInput,
} from "@/Domain/groupAdvance/groupAdvance";
import { GROUP_ADVANCE } from "@/Domain/groupAdvance/groupAdvanceConfig";
import { buildAutoAdvancedMessage } from "@/Domain/inbox/worldAdvanceMessage";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { ServerEvent } from "@/types/socialTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { SeatState } from "@/types/seatTypes";
import type { GroupAdvanceView, MatchDecision, WorldAdvance } from "@/types/groupAdvanceTypes";

/** What the executor needs (tests swap `runDay` and the calendar readers). */
export interface GroupAdvanceDeps {
  service: SaveService;
  runDay(saveId: string, recordings: Record<string, PlayedMatchRecording>): Promise<AdvanceDayOutcome>;
  notify(userId: string, event: ServerEvent): void;
  now(): number;
  /** Dates (ascending) of the seat's unplayed official games, club and national, on or after `from`. */
  matchDates(service: SaveService, saveId: string, seatId: string, from: string): Promise<string[]>;
  /** The seat's unplayed official game of `date`, or null. */
  matchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null>;
}

/** The seat's unplayed official game of `date`: his club's, else his national team's (Etapa 41b). */
export async function seatMatchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null> {
  const seat = await service.getSeat(saveId, seatId);
  if (seat?.clubId && !seat.unemployed) {
    try {
      const club = (await service.getFixturesForDate(saveId, date))
        .find((f) => !f.played && (f.home === seat.clubId || f.away === seat.clubId));
      if (club) return club;
    } catch {
      // A world without league folders (a bare test save) has no games.
    }
  }
  return nationalFixtureOn(service, saveId, seatId, date);
}

export const defaultGroupDeps: GroupAdvanceDeps = {
  service: defaultService,
  runDay: (saveId, recordings) => runBufferedDay(saveId, recordings),
  notify: notifyUser,
  now: () => Date.now(),
  matchDates: (service, saveId, seatId, from) => seatMatchDates(service, saveId, seatId, from),
  matchOn: seatMatchOn,
};

export interface GroupRunResult {
  days: number;
  date: string | null;
  target: string | null;
  /** Seat ids holding the world when the run stopped. */
  waitingFor: string[];
  error?: string;
}

interface GroupSeat { seatId: string; seat: SeatState; input: GroupSeatInput }

async function loadGroupSeats(deps: GroupAdvanceDeps, saveId: string, currentDate: string): Promise<GroupSeat[]> {
  const out: GroupSeat[] = [];
  for (const { seatId, seat } of await deps.service.listSeats(saveId)) {
    const unemployed = !!seat.unemployed || !seat.clubId;
    out.push({
      seatId, seat,
      input: {
        seatId,
        readyUntil: seat.readyUntil ?? null,
        matchDates: await deps.matchDates(deps.service, saveId, seatId, currentDate),
        decisionDate: seat.matchDecision?.date ?? null,
        unemployed,
      },
    });
  }
  return out;
}

async function setAdvance(service: SaveService, saveId: string, advance: WorldAdvance): Promise<void> {
  const meta = await service.getMeta(saveId);
  if (!meta?.world) return;
  await service.updateMeta(saveId, { world: { ...meta.world, advance } });
}

/** Deadline passed: the assistant moves every late seat on (`assistantPatches`) and tells him. */
async function applyAssistant(deps: GroupAdvanceDeps, saveId: string, currentDate: string, seats: GroupSeat[], plan: GroupPlan) {
  for (const p of assistantPatches(currentDate, seats.map((s) => s.input), plan)) {
    let matchDecision: MatchDecision | undefined;
    if (p.decisionDate) {
      const fixture = await deps.matchOn(deps.service, saveId, p.seatId, p.decisionDate);
      if (fixture) matchDecision = { date: p.decisionDate, fixtureId: fixture.id, mode: "simulate" };
    }
    await deps.service.updateSeat(saveId, p.seatId, { readyUntil: p.readyUntil, ...(matchDecision ? { matchDecision } : {}) });
    await deps.service.appendInbox(
      saveId, buildAutoAdvancedMessage({ date: currentDate, until: p.readyUntil, simulated: matchDecision?.date ?? null }), p.seatId,
    );
  }
}

/** Live recordings of `date` kept by the seats that chose to play it live. */
async function liveRecordingsFor(service: SaveService, saveId: string, date: string, seats: GroupSeat[]) {
  const out: Record<string, PlayedMatchRecording> = {};
  for (const s of seats) {
    const d = s.seat.matchDecision;
    if (d?.mode !== "live" || d.date !== date) continue;
    const file = await service.getLiveRecording(saveId, s.seatId);
    if (file && file.date === date && file.fixtureId === d.fixtureId) out[s.seatId] = file.recording;
  }
  return out;
}

type Step =
  | { kind: "ran" | "stopped" | "idle"; date: string | null; target: string | null; waitingFor: string[] }
  | { kind: "error"; date: string | null; target: string | null; waitingFor: string[]; error: string };

/** One step under the save lock: compute the target, then run one day or stop. */
async function stepWorld(saveId: string, deps: GroupAdvanceDeps): Promise<Step> {
  const { service } = deps;
  const meta = await service.getMeta(saveId);
  if (!meta?.currentDate || !isRunningWorld(meta)) {
    return { kind: "idle", date: meta?.currentDate ?? null, target: null, waitingFor: [] };
  }
  const currentDate = meta.currentDate;
  const world = meta.world!;
  let seats = await loadGroupSeats(deps, saveId, currentDate);
  let plan = computeGroupTarget(currentDate, seats.map((s) => s.input));

  if (plan.target <= currentDate && deadlinePassed(world.advance?.waitingSince ?? null, world.deadlineHours, deps.now())) {
    await applyAssistant(deps, saveId, currentDate, seats, plan);
    seats = await loadGroupSeats(deps, saveId, currentDate);
    plan = computeGroupTarget(currentDate, seats.map((s) => s.input));
  }

  if (plan.target <= currentDate) {
    const waitingSince = plan.waitingFor.length > 0
      ? (world.advance?.waitingSince ?? new Date(deps.now()).toISOString())
      : null;
    await setAdvance(service, saveId, { running: false, waitingSince, target: plan.target });
    return { kind: "stopped", date: currentDate, target: plan.target, waitingFor: plan.waitingFor };
  }

  await setAdvance(service, saveId, { running: true, waitingSince: null, target: plan.target });
  const recordings = await liveRecordingsFor(service, saveId, currentDate, seats);
  let outcome = await deps.runDay(saveId, recordings);
  if (!outcome.ok && outcome.status === 400 && Object.keys(recordings).length > 0) {
    // A refused live recording must not lock the world: the assistant simulates that game instead.
    logError("world", `save ${saveId}: live recordings of ${currentDate} refused (${outcome.error}); simulating them`);
    for (const seatId of Object.keys(recordings)) {
      await service.writeLiveRecording(saveId, seatId, null);
      const d = seats.find((s) => s.seatId === seatId)!.seat.matchDecision!;
      await service.updateSeat(saveId, seatId, { matchDecision: { ...d, mode: "simulate" } });
    }
    outcome = await deps.runDay(saveId, {});
  }
  if (!outcome.ok) {
    logError("world", `save ${saveId}: day ${currentDate} failed (${outcome.status} ${outcome.error})`);
    await setAdvance(service, saveId, { running: false, waitingSince: null, target: plan.target });
    return { kind: "error", date: currentDate, target: plan.target, waitingFor: [], error: outcome.error };
  }

  const newDate = typeof outcome.payload.newDate === "string" ? outcome.payload.newDate : addDays(currentDate, 1);
  for (const s of seats) {
    const part = outcome.seats[s.seatId] ?? {};
    const patch: Partial<SeatState> = {};
    if (seatStops(part)) patch.readyUntil = null;
    if (s.seat.matchDecision && s.seat.matchDecision.date <= currentDate) patch.matchDecision = undefined;
    if (Object.keys(patch).length > 0) await service.updateSeat(saveId, s.seatId, patch);
    const live = await service.getLiveRecording(saveId, s.seatId);
    if (live && live.date <= currentDate) await service.writeLiveRecording(saveId, s.seatId, null);
    await service.appendPendingDay(saveId, s.seatId, { date: currentDate, newDate, seat: part }, GROUP_ADVANCE.PENDING_SUMMARY_MAX);
  }
  return { kind: "ran", date: newDate, target: plan.target, waitingFor: [] };
}

/** Nicknames of the seats (the manager's name when the user has none). */
async function namesOf(service: SaveService, saveId: string, seatIds: string[]): Promise<string[]> {
  const members = listSaveMembers(saveId);
  const out: string[] = [];
  for (const seatId of seatIds) {
    const m = members.find((x) => x.seatId === seatId);
    const nick = m ? getSocialUser(m.userId)?.nickname : null;
    out.push(nick ?? (await service.getSeat(saveId, seatId))?.manager?.name ?? "?");
  }
  return out;
}

async function broadcast(
  saveId: string, deps: GroupAdvanceDeps,
  ev: { date: string | null; target: string | null; running: boolean; waitingFor: string[]; error?: string },
): Promise<void> {
  if (!ev.date) return;
  const members = listSaveMembers(saveId);
  if (members.length === 0) return;
  const waitingFor = await namesOf(deps.service, saveId, ev.waitingFor);
  for (const m of members) {
    deps.notify(m.userId, {
      type: "world_progress", saveId, date: ev.date, target: ev.target, running: ev.running, waitingFor,
      ...(ev.error ? { error: ev.error } : {}),
    });
  }
}

async function advanceGroup(saveId: string, deps: GroupAdvanceDeps): Promise<GroupRunResult> {
  const result: GroupRunResult = { days: 0, date: null, target: null, waitingFor: [] };
  for (let guard = 0; guard < GROUP_ADVANCE.MAX_DAYS_PER_RUN; guard++) {
    let step: Step;
    try {
      step = await withSaveLock(saveId, () => stepWorld(saveId, deps));
    } catch (e) {
      // A crash inside a day must not leave the world marked as running.
      const error = e instanceof Error ? e.message : String(e);
      logError("world", `save ${saveId}: group advance step crashed`, e);
      await withSaveLock(saveId, async () => {
        const meta = await deps.service.getMeta(saveId);
        if (meta?.world?.advance) await setAdvance(deps.service, saveId, { ...meta.world.advance, running: false });
      }).catch(() => undefined);
      step = { kind: "error", date: result.date, target: result.target, waitingFor: [], error };
    }
    result.date = step.date;
    result.target = step.target;
    result.waitingFor = step.waitingFor;
    if (step.kind === "ran") {
      result.days++;
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: true, waitingFor: [] });
      continue;
    }
    if (step.kind === "error") {
      result.error = step.error;
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: false, waitingFor: [], error: step.error });
      return result;
    }
    if (step.kind === "stopped") {
      await broadcast(saveId, deps, { date: step.date, target: step.target, running: false, waitingFor: step.waitingFor });
    }
    return result;
  }
  return result;
}

const runningWorlds = new Map<string, Promise<GroupRunResult>>();
const kickAgain = new Set<string>();
const knownWorlds = new Set<string>();

/** Remember a world for the deadline clock. */
export function rememberWorld(saveId: string): void {
  knownWorlds.add(saveId);
}

export function isWorldAdvancing(saveId: string): boolean {
  return runningWorlds.has(saveId);
}

/**
 * Runs the world's days in the background while every seat is ready (`.claude/rules/game/multiplayer.md`, part 3).
 * One executor per world: a kick while one runs only asks it to look once more when it stops.
 */
export function kickWorld(saveId: string, deps: GroupAdvanceDeps = defaultGroupDeps): Promise<GroupRunResult> {
  rememberWorld(saveId);
  const current = runningWorlds.get(saveId);
  if (current) {
    kickAgain.add(saveId);
    return current;
  }
  const run = (async () => {
    let last: GroupRunResult;
    do {
      kickAgain.delete(saveId);
      last = await advanceGroup(saveId, deps);
    } while (kickAgain.has(saveId) && !last.error);
    return last;
  })().finally(() => runningWorlds.delete(saveId));
  runningWorlds.set(saveId, run);
  return run;
}

const defaultScheduler = (saveId: string) => {
  void kickWorld(saveId).catch((e) => logError("world", `save ${saveId}: group advance crashed`, e));
};
let scheduler: (saveId: string) => void = defaultScheduler;

/** Routes call this (tests swap it with `setKickScheduler`). */
export function scheduleKick(saveId: string): void {
  scheduler(saveId);
}

export function setKickScheduler(fn: ((saveId: string) => void) | null): void {
  scheduler = fn ?? defaultScheduler;
}

/** `GET /api/worlds/:saveId/advance` for one seat. */
export async function groupAdvanceView(
  service: SaveService, saveId: string, seatId: string, _nowMs: number, deps: GroupAdvanceDeps = defaultGroupDeps,
): Promise<GroupAdvanceView | null> {
  const meta = await service.getMeta(saveId);
  if (!meta?.currentDate || !meta.world) return null;
  const currentDate = meta.currentDate;
  const viewDeps = { ...deps, service };
  const seats = await loadGroupSeats(viewDeps, saveId, currentDate);
  const plan = computeGroupTarget(currentDate, seats.map((s) => s.input));
  const members = listSaveMembers(saveId);
  const names = await namesOf(service, saveId, seats.map((s) => s.seatId));
  const mine = seats.find((s) => s.seatId === seatId);
  const today = mine && !mine.input.unemployed ? await deps.matchOn(service, saveId, seatId, currentDate) : null;
  const humans = await service.humanClubIds(saveId);
  const advance = meta.world.advance;
  const nicknameOf = (sid: string): string | null => {
    const m = members.find((x) => x.seatId === sid);
    return m ? getSocialUser(m.userId)?.nickname ?? null : null;
  };
  return {
    currentDate,
    target: advance?.running ? advance.target : plan.target,
    running: !!advance?.running || isWorldAdvancing(saveId),
    deadlineHours: meta.world.deadlineHours,
    deadlineAt: deadlineAt(advance?.waitingSince ?? null, meta.world.deadlineHours),
    waitingFor: plan.waitingFor.map((id) => names[seats.findIndex((s) => s.seatId === id)]!),
    members: seats.map((s, i) => ({
      seatId: s.seatId,
      nickname: nicknameOf(s.seatId),
      managerName: s.seat.manager?.name ?? names[i]!,
      clubName: s.input.unemployed ? "" : s.seat.clubName,
      status: memberStatus(s.input, currentDate),
      readyUntil: s.seat.readyUntil ?? null,
      me: s.seatId === seatId,
    })),
    me: {
      readyUntil: mine?.seat.readyUntil ?? null,
      matchToday: today
        ? { fixtureId: today.id, humanOpponent: [today.home, today.away].some((c) => c !== mine?.seat.clubId && humans.has(c)) }
        : null,
      decision: mine?.seat.matchDecision ?? null,
    },
  };
}

/** World ids from the invite codes (part 2), for the deadline clock. */
function loadKnownWorlds(): void {
  for (const saveId of listWorldCodeIds()) knownWorlds.add(saveId);
}

/** A group world (part 2) that left the lobby: the only kind the executor advances. */
function isRunningWorld(meta: SaveMeta | null): boolean {
  return !!meta && isGroupWorld(meta) && meta.world!.phase === "running";
}

/** One tick of the deadline clock: kicks every world whose deadline passed. Returns the kicked ids. */
export async function worldClockTick(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<string[]> {
  const kicked: string[] = [];
  for (const saveId of [...knownWorlds]) {
    if (runningWorlds.has(saveId)) continue;
    const meta = await deps.service.getMeta(saveId);
    if (!meta) { knownWorlds.delete(saveId); continue; }
    const adv = meta.world?.advance;
    if (!isRunningWorld(meta) || !adv?.waitingSince) continue;
    if (!deadlinePassed(adv.waitingSince, meta.world!.deadlineHours, deps.now())) continue;
    kicked.push(saveId);
    void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: group advance crashed`, e));
  }
  return kicked;
}

/** Server start: an executor that died with the process is freed, then every running world looks again. */
export async function resumeWorlds(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<void> {
  loadKnownWorlds();
  for (const saveId of knownWorlds) {
    const meta = await deps.service.getMeta(saveId);
    if (meta?.world?.advance?.running) await setAdvance(deps.service, saveId, { ...meta.world.advance, running: false });
    if (isRunningWorld(meta)) void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: resume failed`, e));
  }
}

let clock: ReturnType<typeof setInterval> | null = null;

/** Deadline clock (`GROUP_ADVANCE.CLOCK_MS`) plus the resume of the worlds. Called once at server start. */
export function startWorldClock(): void {
  if (clock) return;
  void resumeWorlds().catch((e) => logError("world", "failed to resume the worlds", e));
  clock = setInterval(() => {
    void worldClockTick().catch((e) => logError("world", "deadline clock failed", e));
  }, GROUP_ADVANCE.CLOCK_MS);
}
