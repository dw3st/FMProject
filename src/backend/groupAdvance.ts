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
  assistantPatches, computeGroupTarget, deadlineAt, deadlinePassed, errorGaveUp, errorRetryAt, errorRetryDue, isGroupWorld, laterDate,
  memberStatus, seatStops, type GroupPlan, type GroupSeatInput,
} from "@/Domain/groupAdvance/groupAdvance";
import { DAY_FAILED, GROUP_ADVANCE } from "@/Domain/groupAdvance/groupAdvanceConfig";
import { buildAutoAdvancedMessage, buildLiveRefusedMessage, liveRefusedReason } from "@/Domain/inbox/worldAdvanceMessage";
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
  /** Dates (ascending) of the seat's unplayed official games, club and national, from `from` up to `until`. */
  matchDates(service: SaveService, saveId: string, seatId: string, from: string, until: string): Promise<string[]>;
  /** The seat's unplayed official game of `date`, or null. */
  matchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null>;
  /** Safety cap of days in one run (tests lower it); default `GROUP_ADVANCE.MAX_DAYS_PER_RUN`. */
  maxDaysPerRun?: number;
}

/**
 * The seat's unplayed official game of `date`: his club's, else his national team's (Etapa 41b). A read failure
 * throws (never "no game": the executor would run over his game).
 */
export async function seatMatchOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null> {
  const seat = await service.getSeat(saveId, seatId);
  if (seat?.clubId && !seat.unemployed) {
    const club = (await service.getFixturesForDate(saveId, date))
      .find((f) => !f.played && (f.home === seat.clubId || f.away === seat.clubId));
    if (club) return club;
  }
  return nationalFixtureOn(service, saveId, seatId, date);
}

export const defaultGroupDeps: GroupAdvanceDeps = {
  service: defaultService,
  runDay: (saveId, recordings) => runBufferedDay(saveId, recordings),
  notify: notifyUser,
  now: () => Date.now(),
  matchDates: (service, saveId, seatId, from, until) => seatMatchDates(service, saveId, seatId, from, until),
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

/**
 * The seats as the target sees them. Games only matter up to the furthest "ready until" of the group (a later game
 * never sets the target), so the calendar is read up to there; an unemployed seat never stops for a game.
 */
async function loadGroupSeats(deps: GroupAdvanceDeps, saveId: string, currentDate: string): Promise<GroupSeat[]> {
  const list = await deps.service.listSeats(saveId);
  const until = list.reduce((max, { seat }) => laterDate(seat.readyUntil ?? null, max), addDays(currentDate, 1));
  const out: GroupSeat[] = [];
  for (const { seatId, seat } of list) {
    const unemployed = !!seat.unemployed || !seat.clubId;
    out.push({
      seatId, seat,
      input: {
        seatId,
        readyUntil: seat.readyUntil ?? null,
        matchDates: unemployed ? [] : await deps.matchDates(deps.service, saveId, seatId, currentDate, until),
        decisionDate: seat.matchDecision?.date ?? null,
        unemployed,
      },
    });
  }
  return out;
}

const ADVANCE_KEYS = ["running", "waitingSince", "target", "error", "errorAt", "errorTries"] as const;

function sameAdvance(a: WorldAdvance, b: WorldAdvance): boolean {
  return ADVANCE_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** Merges `patch` into `world.advance`; writes nothing when nothing changes. Always called under the save lock. */
async function updateAdvance(service: SaveService, saveId: string, patch: Partial<WorldAdvance>): Promise<void> {
  const meta = await service.getMeta(saveId);
  if (!meta?.world) return;
  const prev: WorldAdvance = meta.world.advance ?? { running: false, waitingSince: null, target: null };
  const next: WorldAdvance = { ...prev, ...patch };
  if (meta.world.advance && sameAdvance(prev, next)) return;
  await service.updateMeta(saveId, { world: { ...meta.world, advance: next } });
}

/** Clears a past failure. `errorTries` 0 reads like absent in `sameAdvance` only through `?? null`, so keep it explicit. */
function noError(adv: WorldAdvance | undefined): Partial<WorldAdvance> {
  return adv?.error || adv?.errorAt || adv?.errorTries ? { error: null, errorAt: null, errorTries: 0 } : {};
}

/** Deadline passed: the assistant moves every late seat on (`assistantPatches`) and tells him. */
async function applyAssistant(deps: GroupAdvanceDeps, saveId: string, currentDate: string, seats: GroupSeat[], plan: GroupPlan) {
  for (const p of assistantPatches(currentDate, seats.map((s) => s.input), plan)) {
    let matchDecision: MatchDecision | undefined;
    if (p.decisionDate) {
      const fixture = await deps.matchOn(deps.service, saveId, p.seatId, p.decisionDate);
      if (!fixture) {
        // The calendar lists a game the day reader does not find: settle the date anyway, so it never holds again.
        logError("world", `save ${saveId}: seat ${p.seatId} has a game on ${p.decisionDate} with no fixture; settled as simulated`);
      }
      matchDecision = { date: p.decisionDate, fixtureId: fixture?.id ?? "", mode: "simulate" };
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
    else logError("world", `save ${saveId}: seat ${s.seatId} chose to play ${date} live but sent no recording; it is simulated`);
  }
  return out;
}

/** `runDay` with a throw turned into a failed outcome (the executor's error path handles both). */
async function safeRunDay(deps: GroupAdvanceDeps, saveId: string, recordings: Record<string, PlayedMatchRecording>): Promise<AdvanceDayOutcome> {
  try {
    return await deps.runDay(saveId, recordings);
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The day refused the live recordings (400): those games are simulated instead and each seat is told why. The day
 * does not say which recording it refused, so with more than one every one of them is simulated.
 */
async function refuseRecordings(service: SaveService, saveId: string, date: string, seatIds: string[], error: string) {
  logError("world", `save ${saveId}: live recordings of ${date} refused (${error}); simulating them`);
  const reason = liveRefusedReason(error);
  for (const seatId of seatIds) {
    await service.writeLiveRecording(saveId, seatId, null);
    const d = (await service.getSeat(saveId, seatId))?.matchDecision;
    if (d?.date === date) await service.updateSeat(saveId, seatId, { matchDecision: { ...d, mode: "simulate" } });
    await service.appendInbox(saveId, buildLiveRefusedMessage({ date, reason }), seatId);
  }
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
  const nowIso = new Date(deps.now()).toISOString();
  let waitingSince = world.advance?.waitingSince ?? null;
  let seats = await loadGroupSeats(deps, saveId, currentDate);
  let plan = computeGroupTarget(currentDate, seats.map((s) => s.input));

  if (plan.target <= currentDate && deadlinePassed(waitingSince, world.deadlineHours, deps.now())) {
    await applyAssistant(deps, saveId, currentDate, seats, plan);
    seats = await loadGroupSeats(deps, saveId, currentDate);
    plan = computeGroupTarget(currentDate, seats.map((s) => s.input));
    if (plan.target <= currentDate) {
      // Still held: the deadline starts again, so the assistant acts at most once per deadline.
      logError("world", `save ${saveId}: the assistant could not move ${plan.waitingFor.join(", ")} on from ${currentDate}`);
      waitingSince = nowIso;
    }
  }

  if (plan.target <= currentDate) {
    await updateAdvance(service, saveId, {
      running: false,
      waitingSince: plan.waitingFor.length > 0 ? (waitingSince ?? nowIso) : null,
      target: plan.target,
      ...noError(world.advance),
    });
    return { kind: "stopped", date: currentDate, target: plan.target, waitingFor: plan.waitingFor };
  }

  await updateAdvance(service, saveId, { running: true, waitingSince: null, target: plan.target });
  const recordings = await liveRecordingsFor(service, saveId, currentDate, seats);
  let outcome = await safeRunDay(deps, saveId, recordings);
  if (!outcome.ok && outcome.status === 400 && Object.keys(recordings).length > 0) {
    // A refused live recording must not lock the world: the game is simulated instead.
    await refuseRecordings(service, saveId, currentDate, Object.keys(recordings), outcome.error);
    outcome = await safeRunDay(deps, saveId, {});
  }
  if (!outcome.ok) {
    // The text stays in the log; the meta and the members only see the fixed code.
    logError("world", `save ${saveId}: day ${currentDate} failed (${outcome.status} ${outcome.error})`);
    await updateAdvance(service, saveId, {
      running: false, waitingSince: null, target: plan.target,
      error: DAY_FAILED, errorAt: nowIso, errorTries: (world.advance?.errorTries ?? 0) + 1,
    });
    return { kind: "error", date: currentDate, target: plan.target, waitingFor: [], error: DAY_FAILED };
  }

  const newDate = typeof outcome.payload.newDate === "string" ? outcome.payload.newDate : addDays(currentDate, 1);
  for (const s of seats) {
    const part = outcome.seats[s.seatId] ?? {};
    // Re-read: the day itself (or a decision for a later game) may have written the seat since the step began.
    const fresh = await service.getSeat(saveId, s.seatId);
    if (fresh) {
      const patch: Partial<SeatState> = {};
      if (seatStops(part) && fresh.readyUntil != null) patch.readyUntil = null;
      if (fresh.matchDecision && fresh.matchDecision.date <= currentDate) patch.matchDecision = undefined;
      if (Object.keys(patch).length > 0) await service.updateSeat(saveId, s.seatId, patch);
    }
    const live = await service.getLiveRecording(saveId, s.seatId);
    if (live && live.date <= currentDate) await service.writeLiveRecording(saveId, s.seatId, null);
    await service.appendPendingDay(saveId, s.seatId, { date: currentDate, newDate, seat: part }, GROUP_ADVANCE.PENDING_SUMMARY_MAX);
  }
  await updateAdvance(service, saveId, noError(world.advance));
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

/** A step that threw outside the day (a calendar read, a seat file): recorded like a failed day, under the lock. */
async function recordCrash(saveId: string, deps: GroupAdvanceDeps, e: unknown): Promise<Step> {
  const error = DAY_FAILED;
  logError("world", `save ${saveId}: group advance step crashed`, e);
  const failed: Step = { kind: "error", date: null, target: null, waitingFor: [], error };
  return withSaveLock(saveId, async (): Promise<Step> => {
    const meta = await deps.service.getMeta(saveId);
    await updateAdvance(deps.service, saveId, {
      running: false, waitingSince: null,
      error, errorAt: new Date(deps.now()).toISOString(), errorTries: (meta?.world?.advance?.errorTries ?? 0) + 1,
    });
    return { ...failed, date: meta?.currentDate ?? null, target: meta?.world?.advance?.target ?? null };
  }).catch(() => failed);
}

/** The run hit its day cap: stop cleanly (the deadline clock or the next kick goes on). */
async function haltAtCap(saveId: string, deps: GroupAdvanceDeps, max: number): Promise<Step> {
  logError("world", `save ${saveId}: ${max} days in one run, stopping`);
  return withSaveLock(saveId, async (): Promise<Step> => {
    const meta = await deps.service.getMeta(saveId);
    await updateAdvance(deps.service, saveId, { running: false, waitingSince: new Date(deps.now()).toISOString() });
    return { kind: "stopped", date: meta?.currentDate ?? null, target: meta?.world?.advance?.target ?? null, waitingFor: [] };
  });
}

async function advanceGroup(saveId: string, deps: GroupAdvanceDeps): Promise<GroupRunResult> {
  const result: GroupRunResult = { days: 0, date: null, target: null, waitingFor: [] };
  const max = deps.maxDaysPerRun ?? GROUP_ADVANCE.MAX_DAYS_PER_RUN;
  const finish = async (step: Step): Promise<GroupRunResult> => {
    result.date = step.date;
    result.target = step.target;
    result.waitingFor = step.waitingFor;
    if (step.kind === "error") result.error = step.error;
    if (step.kind !== "idle") {
      await broadcast(saveId, deps, {
        date: step.date, target: step.target, running: false, waitingFor: step.waitingFor,
        ...(step.kind === "error" ? { error: step.error } : {}),
      });
    }
    return result;
  };
  while (result.days < max) {
    let step: Step;
    try {
      step = await withSaveLock(saveId, () => stepWorld(saveId, deps));
    } catch (e) {
      step = await recordCrash(saveId, deps, e);
    }
    if (step.kind !== "ran") return finish(step);
    result.days++;
    result.date = step.date;
    result.target = step.target;
    await broadcast(saveId, deps, { date: step.date, target: step.target, running: true, waitingFor: [] });
  }
  return finish(await haltAtCap(saveId, deps, max));
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

/** Resolves when the world's current executor (if any) stops. */
export async function waitWorld(saveId: string): Promise<void> {
  for (let run = runningWorlds.get(saveId); run; run = runningWorlds.get(saveId)) await run.catch(() => undefined);
}

/**
 * Runs the world's days in the background while every seat is ready (`.claude/rules/game/multiplayer.md`, part 3).
 * One executor per world: a kick while one runs only asks it to look once more when it stops (even after an error).
 */
export function kickWorld(saveId: string, deps: GroupAdvanceDeps = defaultGroupDeps): Promise<GroupRunResult> {
  rememberWorld(saveId);
  const current = runningWorlds.get(saveId);
  if (current) {
    kickAgain.add(saveId);
    return current;
  }
  // eslint-disable-next-line prefer-const
  let run!: Promise<GroupRunResult>;
  run = (async () => {
    try {
      for (;;) {
        kickAgain.delete(saveId);
        const last = await advanceGroup(saveId, deps);
        // Same tick as the check: a kick after this line starts a new executor, none is lost in between.
        if (!kickAgain.has(saveId)) {
          runningWorlds.delete(saveId);
          return last;
        }
      }
    } finally {
      if (runningWorlds.get(saveId) === run) runningWorlds.delete(saveId);
    }
  })();
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
  const seats = await loadGroupSeats({ ...deps, service }, saveId, currentDate);
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
    // Nobody late = no deadline to show (the world is not waiting on anyone).
    deadlineAt: plan.waitingFor.length > 0 ? deadlineAt(advance?.waitingSince ?? null, meta.world.deadlineHours) : null,
    waitingFor: plan.waitingFor.map((id) => names[seats.findIndex((s) => s.seatId === id)]!),
    error: advance?.error ?? null,
    errorTries: advance?.error ? advance.errorTries ?? 0 : 0,
    nextRetryAt: errorRetryAt(advance),
    gaveUp: errorGaveUp(advance),
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

/**
 * "Try again" after the clock gave up (`POST /api/worlds/:saveId/advance/retry`): the failure count starts over, under
 * the save lock; the caller kicks the world. `noError` without a failure, `notGaveUp` while the clock still retries.
 */
export async function resetAdvanceError(service: SaveService, saveId: string): Promise<true | "noError" | "notGaveUp"> {
  return withSaveLock(saveId, async () => {
    const adv = (await service.getMeta(saveId))?.world?.advance;
    if (!adv?.error) return "noError" as const;
    if (!errorGaveUp(adv)) return "notGaveUp" as const;
    await updateAdvance(service, saveId, { errorTries: 0 });
    return true as const;
  });
}

/** World ids from the invite codes (part 2), for the deadline clock. */
function loadKnownWorlds(): void {
  for (const saveId of listWorldCodeIds()) knownWorlds.add(saveId);
}

/** A group world (part 2) that left the lobby: the only kind the executor advances. */
function isRunningWorld(meta: SaveMeta | null): boolean {
  return !!meta && isGroupWorld(meta) && meta.world!.phase === "running";
}

/**
 * One tick of the deadline clock: kicks every world whose deadline passed, or whose failed run is due a retry
 * (`errorRetryDue`). Returns the kicked ids.
 */
export async function worldClockTick(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<string[]> {
  const kicked: string[] = [];
  for (const saveId of [...knownWorlds]) {
    if (runningWorlds.has(saveId)) continue;
    const meta = await deps.service.getMeta(saveId);
    if (!meta) { knownWorlds.delete(saveId); continue; }
    if (!isRunningWorld(meta)) continue;
    const adv = meta.world!.advance;
    const due = adv?.error
      ? errorRetryDue(adv, deps.now())
      : !!adv?.waitingSince && deadlinePassed(adv.waitingSince, meta.world!.deadlineHours, deps.now());
    if (!due) continue;
    kicked.push(saveId);
    void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: group advance crashed`, e));
  }
  return kicked;
}

/**
 * Server start: an executor that died with the process is freed, then every running world looks again. The check and
 * the reset run under the save lock and skip a world whose executor is alive (a resume never rewrites its meta).
 */
export async function resumeWorlds(deps: GroupAdvanceDeps = defaultGroupDeps): Promise<void> {
  loadKnownWorlds();
  for (const saveId of [...knownWorlds]) {
    const kick = await withSaveLock(saveId, async () => {
      if (runningWorlds.has(saveId)) return false;
      const meta = await deps.service.getMeta(saveId);
      if (meta?.world?.advance?.running) await updateAdvance(deps.service, saveId, { running: false });
      return isRunningWorld(meta);
    }).catch((e) => {
      logError("world", `save ${saveId}: resume failed`, e);
      return false;
    });
    if (kick) void kickWorld(saveId, deps).catch((e) => logError("world", `save ${saveId}: resume failed`, e));
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
