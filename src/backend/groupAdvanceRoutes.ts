import { saveService, type SaveMeta } from "@/backend/SaveService";
import { requireSeat, type SeatAuth } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { seatNextMatchDate } from "@/backend/advanceUntil";
import { groupAdvanceView, resetAdvanceError, scheduleKick, seatMatchOn } from "@/backend/groupAdvance";
import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import { logError } from "@/Logger";
import { addDays } from "@/Domain/dates";
import { isGroupWorld, laterDate, resolveReadyUntil } from "@/Domain/groupAdvance/groupAdvance";
import { buildMatchEventFromRecording, withWeatherLog } from "@/Domain/advanceDay/matches";
import { matchWeatherOf } from "@/backend/stadiumData";
import { officialsFor } from "@/backend/refereeWorld";
import { aggregatePendingDays } from "@/Domain/groupAdvance/pendingSummary";
import type { DayLog } from "@/types/dayLogTypes";
import type { PendingSummaryAggregate } from "@/types/groupAdvanceTypes";

type Req = Request & { params: Record<string, string> };
type Handler = (req: Req) => Promise<Response>;

/** Body cap of a live recording (a whole match: stats of ~40 players). */
const MAX_BODY_BYTES = 512 * 1024;

/** A calendar or disk read failure answers a controlled 500 instead of dropping the handler. */
function safe(name: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      logError("world", `group advance ${name} failed`, e);
      return Response.json({ error: "generic" }, { status: 500 });
    }
  };
}

async function worldSeat(req: Req): Promise<{ auth: SeatAuth; meta: SaveMeta; saveId: string } | Response> {
  const saveId = req.params.saveId!;
  const auth = requireSeat(req, saveId);
  if (auth instanceof Response) return auth;
  const meta = await saveService.getMeta(saveId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (!isGroupWorld(meta)) return Response.json({ error: "notMulti" }, { status: 409 });
  if (meta.world!.phase !== "running") return Response.json({ error: "lobby" }, { status: 409 });
  return { auth, meta, saveId };
}

async function jsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "tooLarge" }, { status: 413 });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return Response.json({ error: "tooLarge" }, { status: 413 });
  try {
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : Response.json({ error: "invalid JSON body" }, { status: 400 });
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
}

const methodNotAllowed = () => Response.json({ error: "method not allowed" }, { status: 405 });

/** Day logs read at once when building the summary. */
const SUMMARY_READ_BATCH = 6;

/** The seat's pending days and the one summary built from them (the day logs read in small batches). */
async function pendingSummary(saveId: string, seatId: string) {
  const days = await saveService.getPendingSummary(saveId, seatId);
  if (days.length === 0) return { days, aggregate: null as PendingSummaryAggregate | null };
  const logs: (DayLog | null)[] = [];
  for (let i = 0; i < days.length; i += SUMMARY_READ_BATCH) {
    logs.push(...(await Promise.all(days.slice(i, i + SUMMARY_READ_BATCH).map((d) => saveService.resolveDayLog(saveId, d.date, seatId)))));
  }
  const clubId = (await saveService.getSeat(saveId, seatId))?.clubId ?? "";
  return { days, aggregate: aggregatePendingDays(days, logs, clubId) };
}

export const groupAdvanceRoutes = {
  "/api/worlds/:saveId/ready": safe("ready", async (req) => {
    if (req.method !== "POST") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    const { saveId, auth } = ctx;
    const res = await withSaveLock(saveId, async () => {
      const current = (await saveService.getMeta(saveId))!.currentDate!;
      // Only "next_match" reads the calendar; a read failure throws (never "no game": he would be skipped).
      const next = body.until === "next_match"
        ? await seatNextMatchDate(saveService, saveId, auth.seatId, addDays(current, 1))
        : null;
      const r = resolveReadyUntil("until" in body ? body.until : undefined, current, next);
      if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
      await saveService.updateSeat(saveId, auth.seatId, { readyUntil: r.readyUntil });
      return Response.json({ readyUntil: r.readyUntil });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  }),

  "/api/worlds/:saveId/match-decision": safe("match-decision", async (req) => {
    if (req.method !== "POST") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    if ((body.mode !== "simulate" && body.mode !== "undo") || typeof body.date !== "string" || typeof body.fixtureId !== "string") {
      return Response.json({ error: "invalidDecision" }, { status: 400 });
    }
    const { saveId, auth } = ctx;
    const date = body.date;
    const fixtureId = body.fixtureId;
    const res = await withSaveLock(saveId, async () => {
      if ((await saveService.getMeta(saveId))!.currentDate !== date) return Response.json({ error: "dayClosed" }, { status: 409 });
      if (body.mode === "undo") {
        // Undo "Simulate" while the day has not run: the game is to decide again (Play comes back). The "ready until"
        // the decision set (D+1) goes too; a later one the manager chose stays.
        const seat = await saveService.getSeat(saveId, auth.seatId);
        const d = seat?.matchDecision;
        if (!d || d.date !== date || d.fixtureId !== fixtureId || d.mode !== "simulate") {
          return Response.json({ error: "noDecision" }, { status: 409 });
        }
        await saveService.updateSeat(saveId, auth.seatId, {
          matchDecision: undefined,
          ...(seat!.readyUntil === addDays(date, 1) ? { readyUntil: null } : {}),
        });
        return Response.json({ ok: true });
      }
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, date);
      if (!fixture || fixture.id !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
      const seat = await saveService.getSeat(saveId, auth.seatId);
      await saveService.writeLiveRecording(saveId, auth.seatId, null);
      await saveService.updateSeat(saveId, auth.seatId, {
        matchDecision: { date, fixtureId, mode: "simulate" },
        readyUntil: laterDate(seat?.readyUntil, addDays(date, 1)),
      });
      return Response.json({ ok: true });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  }),

  "/api/worlds/:saveId/live-recording": safe("live-recording", async (req) => {
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const { saveId, auth } = ctx;
    if (req.method === "GET") {
      // The provisional result of the seat's live match, until the executor runs that day.
      const file = await saveService.getLiveRecording(saveId, auth.seatId);
      const current = (await saveService.getMeta(saveId))!.currentDate;
      if (!file || file.date < current!) return Response.json({ error: "not found" }, { status: 404 });
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, file.date);
      const home = fixture ? await saveService.getSquadById(saveId, fixture.home) : null;
      const away = fixture ? await saveService.getSquadById(saveId, fixture.away) : null;
      const base = fixture && home && away
        ? withWeatherLog(buildMatchEventFromRecording(fixture, home, away, file.recording).event, matchWeatherOf(fixture, home))
        : null;
      // The referee of the day's appointment (the one the day will log): the recording never carries him.
      const officials = base && fixture ? await officialsFor(saveService, saveId, file.date, fixture).catch(() => null) : null;
      const event = base && officials
        ? { ...base, referee: { id: officials.referee.id, name: officials.referee.name, country: officials.referee.country } }
        : base;
      return Response.json({ date: file.date, fixtureId: file.fixtureId, event });
    }
    if (req.method !== "POST") return methodNotAllowed();
    const body = await jsonBody(req);
    if (body instanceof Response) return body;
    const recording = validatePlayedMatch(body.recording);
    if (!recording || typeof body.date !== "string" || typeof body.fixtureId !== "string") {
      return Response.json({ error: "invalidRecording" }, { status: 400 });
    }
    const date = body.date;
    const fixtureId = body.fixtureId;
    if (recording.fixtureId !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
    const res = await withSaveLock(saveId, async () => {
      if ((await saveService.getMeta(saveId))!.currentDate !== date) return Response.json({ error: "dayClosed" }, { status: 409 });
      const fixture = await seatMatchOn(saveService, saveId, auth.seatId, date);
      if (!fixture || fixture.id !== fixtureId) return Response.json({ error: "notYourMatch" }, { status: 400 });
      const seat = await saveService.getSeat(saveId, auth.seatId);
      const humans = await saveService.humanClubIds(saveId);
      if ([fixture.home, fixture.away].some((c) => c !== seat?.clubId && humans.has(c))) {
        return Response.json({ error: "seatOpponent" }, { status: 409 });
      }
      if (!knockoutRecordingDecided(fixture, recording)) return Response.json({ error: "noWinner" }, { status: 400 });
      await saveService.writeLiveRecording(saveId, auth.seatId, { date, fixtureId, recording });
      await saveService.updateSeat(saveId, auth.seatId, {
        matchDecision: { date, fixtureId, mode: "live" },
        readyUntil: laterDate(seat?.readyUntil, addDays(date, 1)),
      });
      return Response.json({ ok: true });
    });
    if (res.ok) scheduleKick(saveId);
    return res;
  }),

  "/api/worlds/:saveId/advance": safe("advance", async (req) => {
    if (req.method !== "GET") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const view = await groupAdvanceView(saveService, ctx.saveId, ctx.auth.seatId, Date.now());
    if (!view) return Response.json({ error: "save not found" }, { status: 404 });
    return Response.json(view);
  }),

  "/api/worlds/:saveId/advance/retry": safe("advance-retry", async (req) => {
    if (req.method !== "POST") return methodNotAllowed();
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    const reset = await resetAdvanceError(saveService, ctx.saveId);
    if (reset !== true) return Response.json({ error: reset }, { status: 409 });
    scheduleKick(ctx.saveId);
    return Response.json({ ok: true });
  }),

  "/api/worlds/:saveId/summary": safe("summary", async (req) => {
    const ctx = await worldSeat(req);
    if (ctx instanceof Response) return ctx;
    if (req.method === "GET") return Response.json(await pendingSummary(ctx.saveId, ctx.auth.seatId));
    if (req.method !== "DELETE") return methodNotAllowed();
    await withSaveLock(ctx.saveId, () => saveService.clearPendingSummary(ctx.saveId, ctx.auth.seatId));
    return Response.json({ ok: true });
  }),
};
