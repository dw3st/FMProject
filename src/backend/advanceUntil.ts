import { saveService as defaultSaveService, type SaveService } from "@/backend/SaveService";
import { withSaveLock } from "@/backend/saveLock";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { getPyramids, runBufferedDay, type AdvanceDayOutcome } from "@/backend/advanceDay";
import { pyramidByLeague, pyramidLeagueSlugs } from "@/Domain/season/countryRollover";
import type { ClubMove } from "@/types/pyramidTypes";

/**
 * Fast-forward ("Avançar até o próximo jogo"): advance the save day by day until the day before the
 * player's next match, at most `maxDays` days per request. Every day is the exact unit of work of
 * `POST /api/advance-day` (`runBufferedDay`: own BufferingSaveDAL + flush); the date never jumps.
 * The frontend repeats the call until `done`.
 */

export const ADVANCE_UNTIL_DEFAULT_DAYS = 7;
export const ADVANCE_UNTIL_MAX_DAYS = 14;
/** No player match inside this horizon → error (a broken calendar, not an off-season). */
export const ADVANCE_TARGET_HORIZON_DAYS = 400;

const DAY_MS = 86_400_000;
const toUtc = (d: string) => Date.parse(d + "T00:00:00Z");
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const shiftDate = (d: string, days: number) => fromUtc(toUtc(d) + days * DAY_MS);
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export interface AdvanceTarget {
  /**
   * Last `currentDate` to stop at: advancing stops once `currentDate >= target`. It is the day
   * BEFORE the player's match, so the match itself (and its eve) go through the normal flow.
   */
  target: string;
  /** The player's next match day, or null while waiting for the country's season rollover. */
  matchDate: string | null;
}

/**
 * Pure. `playerFixtureDates`: dates of the player's UNPLAYED fixtures in its current league
 * (any order). `rolloverDay`: the day whose advance rolls the player's country over, when the
 * player's calendar is exhausted but the rollover has not happened yet (the new calendar does
 * not exist, so the target is the day after it and gets recomputed from the new calendar).
 */
export function computeAdvanceTarget(
  currentDate: string,
  playerFixtureDates: string[],
  rolloverDay: string | null = null,
): AdvanceTarget {
  const horizon = shiftDate(currentDate, ADVANCE_TARGET_HORIZON_DAYS);
  const next = playerFixtureDates
    .filter((d) => d >= currentDate && d <= horizon)
    .sort()[0];
  if (next) return { target: shiftDate(next, -1), matchDate: next };
  if (rolloverDay && rolloverDay >= currentDate && rolloverDay <= horizon) {
    return { target: shiftDate(rolloverDay, 1), matchDate: null };
  }
  throw new Error(`no player match within ${ADVANCE_TARGET_HORIZON_DAYS} days of ${currentDate}`);
}

export interface SeasonEvent {
  /** The day whose advance rolled the player's country over. */
  date: string;
  archiveYear?: number;
  moves: ClubMove[];
  playerMove: ClubMove | null;
  playerChampionOf: string | null;
}

export interface AdvancePosition extends AdvanceTarget { currentDate: string }

export interface AdvanceBatchDeps {
  /** Read `currentDate` and recompute the target (league and calendar change at a rollover). */
  readPosition(): Promise<AdvancePosition>;
  /** Advance one day (flushed on success). */
  runDay(): Promise<AdvanceDayOutcome>;
  /** Held around each position check + day, so no other day-advance slips in between. */
  withLock<T>(fn: () => Promise<T>): Promise<T>;
}

export interface AdvanceBatchResult {
  newDate: string | null;
  daysAdvanced: number;
  target: string | null;
  matchDate: string | null;
  done: boolean;
  seasonEvents: SeasonEvent[];
  error?: { status: number; message: string };
}

function seasonEventOf(date: string, payload: Record<string, unknown>): SeasonEvent | null {
  if (payload.seasonEnded !== true) return null;
  return {
    date,
    archiveYear: typeof payload.archiveYear === "number" ? payload.archiveYear : undefined,
    moves: (payload.moves as ClubMove[] | undefined) ?? [],
    playerMove: (payload.playerMove as ClubMove | null | undefined) ?? null,
    playerChampionOf: (payload.playerChampionOf as string | null | undefined) ?? null,
  };
}

/** The batching loop. Stops at the target, at `maxDays`, or on the first error. */
export async function runAdvanceBatch(maxDays: number, deps: AdvanceBatchDeps): Promise<AdvanceBatchResult> {
  const result: AdvanceBatchResult = {
    newDate: null, daysAdvanced: 0, target: null, matchDate: null, done: false, seasonEvents: [],
  };
  for (;;) {
    const step = await deps.withLock(async () => {
      let pos: AdvancePosition;
      try {
        pos = await deps.readPosition();
      } catch (err) {
        return { kind: "error" as const, status: 400, message: err instanceof Error ? err.message : String(err) };
      }
      result.newDate = pos.currentDate;
      result.target = pos.target;
      result.matchDate = pos.matchDate;
      if (pos.currentDate >= pos.target) return { kind: "done" as const };
      if (result.daysAdvanced >= maxDays) return { kind: "limit" as const };
      const outcome = await deps.runDay();
      if (!outcome.ok) return { kind: "error" as const, status: outcome.status, message: outcome.error };
      return { kind: "day" as const, date: pos.currentDate, payload: outcome.payload };
    });

    if (step.kind === "done") { result.done = true; return result; }
    if (step.kind === "limit") return result;
    if (step.kind === "error") { result.error = { status: step.status, message: step.message }; return result; }
    result.daysAdvanced++;
    if (typeof step.payload.newDate === "string") result.newDate = step.payload.newDate;
    const ev = seasonEventOf(step.date, step.payload);
    if (ev) result.seasonEvents.push(ev);
  }
}

/** Dates of the player's unplayed fixtures from its current league's date-index + round files. */
async function nextPlayerFixtureDate(
  service: SaveService, saveId: string, leagueSlug: string, clubId: string, fromDate: string,
): Promise<string | null> {
  const index = (await service.getDateIndex(saveId, leagueSlug)) ?? {};
  const dates = Object.keys(index).filter((d) => d >= fromDate).sort();
  const rounds = new Map<number, Awaited<ReturnType<SaveService["getRound"]>>>();
  for (const date of dates) {
    for (const r of index[date] ?? []) {
      if (!rounds.has(r)) rounds.set(r, await service.getRound(saveId, leagueSlug, r));
      const hit = rounds.get(r)?.fixtures.some(
        (f) => f.date === date && !f.played && (f.home === clubId || f.away === clubId),
      );
      if (hit) return date;
    }
  }
  return null;
}

/** Real position reader: the player's league/club/date come from the save meta, re-read every call. */
export async function readAdvancePosition(saveId: string, service: SaveService = defaultSaveService): Promise<AdvancePosition> {
  const meta = await service.getMeta(saveId);
  if (!meta) throw new Error("save not found");
  if (!meta.currentDate) throw new Error("save has no currentDate");
  const currentDate = meta.currentDate;
  const matchDate = await nextPlayerFixtureDate(service, saveId, meta.leagueSlug, meta.clubId, currentDate);

  let rolloverDay: string | null = null;
  if (!matchDate) {
    // Calendar exhausted: the country rolls the day its last league ends (a league outside any
    // pyramid rolls alone, the day of its own end).
    const pyramid = pyramidByLeague(await getPyramids()).get(meta.leagueSlug);
    const slugs = new Set(pyramid ? pyramidLeagueSlugs(pyramid) : [meta.leagueSlug]);
    const ends = (meta.activeLeagues ?? []).filter((l) => slugs.has(l.leagueSlug)).map((l) => l.end).sort();
    rolloverDay = ends[ends.length - 1] ?? null;
  }
  return { currentDate, ...computeAdvanceTarget(currentDate, matchDate ? [matchDate] : [], rolloverDay) };
}

export const advanceUntilRoutes = {
  "/api/saves/:saveId/advance-until": async (req: Request & { params: Record<string, string> }) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, { status: 405 });
    }
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;

    let maxDays = ADVANCE_UNTIL_DEFAULT_DAYS;
    const raw = await req.text();
    if (raw) {
      let body: { maxDays?: unknown };
      try {
        body = JSON.parse(raw) as { maxDays?: unknown };
      } catch {
        return Response.json({ error: "invalid JSON body" }, { status: 400 });
      }
      if (body.maxDays !== undefined) {
        if (typeof body.maxDays !== "number" || !Number.isInteger(body.maxDays) || body.maxDays < 1) {
          return Response.json({ error: "maxDays must be a positive integer" }, { status: 400 });
        }
        maxDays = Math.min(body.maxDays, ADVANCE_UNTIL_MAX_DAYS);
      }
    }

    // The lock is taken PER DAY (around the position check + the day), not for the whole batch:
    // a batch can take ~20 s, and the frontend's "Parar" and any plain advance-day must not wait
    // for all of it. Checking the target inside the same lock keeps a concurrent advance-day from
    // pushing the save onto the player's match day between the check and the day.
    const result = await runAdvanceBatch(maxDays, {
      readPosition: () => readAdvancePosition(saveId),
      runDay: () => runBufferedDay(saveId),
      withLock: (fn) => withSaveLock(saveId, fn),
    });
    const { error, ...body } = result;
    if (error) return Response.json({ ...body, error: error.message }, { status: error.status });
    return Response.json(body);
  },
};
