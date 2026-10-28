// A friend's live score (multiplayer part 6): checked for coherence only, the official result is the day's. Pure.
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { LiveBase, LiveMoment, LivePhase, LiveScoreFrame, LiveScoreView, LiveStatus } from "@/types/rivalsTypes";

const PHASES: ReadonlySet<string> = new Set<LivePhase>(["start", "goal", "disallowed", "red", "half", "minute", "end"]);
const SAVE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Trimmed, no control characters, at most `RIVALS.SCORER_MAX`; null when empty or not a string. */
function cleanScorer(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return s.length > 0 && s.length <= RIVALS.SCORER_MAX ? s : null;
}

/** The frame of a `live_score` socket event, or null (ignored in silence). */
export function parseLiveFrame(e: Record<string, unknown>): LiveScoreFrame | null {
  if (typeof e.saveId !== "string" || !SAVE_ID_RE.test(e.saveId)) return null;
  if (typeof e.fixtureId !== "string" || e.fixtureId.length === 0 || e.fixtureId.length > RIVALS.FIXTURE_ID_MAX) return null;
  if (typeof e.phase !== "string" || !PHASES.has(e.phase)) return null;
  if (!isInt(e.minute, 0, RIVALS.LIVE_MAX_MINUTE)) return null;
  const s = e.score as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== "object") return null;
  if (!isInt(s.for, 0, RIVALS.LIVE_MAX_GOALS) || !isInt(s.against, 0, RIVALS.LIVE_MAX_GOALS)) return null;
  const scorer = cleanScorer(e.scorer);
  const side = e.side === "for" || e.side === "against" ? e.side : null;
  if (e.phase === "red" && !side) return null;
  return {
    saveId: e.saveId, fixtureId: e.fixtureId, phase: e.phase as LivePhase, minute: e.minute,
    score: { for: s.for, against: s.against }, ...(scorer ? { scorer } : {}), ...(side ? { side } : {}),
  };
}

/**
 * The next state of a live game, or null when the frame does not fit: a goal adds one or more, a disallowed goal (VAR)
 * takes exactly one back from one side, nothing else changes the score; the minute never goes back, a finished game takes nothing more, at most `LIVE_MAX_EVENTS` events
 * (a `minute` frame must move the clock forward and does not count). Another fixture starts over. The scorer stays
 * only when he is one of `scorers` (no free text).
 */
export function applyLiveFrame(
  prevIn: LiveScoreView | null, frame: LiveScoreFrame, base: LiveBase, scorers: ReadonlySet<string>, now: number,
): LiveScoreView | null {
  const prev = prevIn && prevIn.fixtureId === frame.fixtureId ? prevIn : null;
  const tick = frame.phase === "minute";
  const disallowed = frame.phase === "disallowed";
  const red = frame.phase === "red";
  // A minute frame for a game the server lost (a restart) rebuilds it from the frame's minute and score.
  if (tick && prev && frame.minute <= prev.minute) return null;
  if ((disallowed || red) && !prev) return null;
  if (red && !frame.side) return null;
  if (prev) {
    if (prev.status === "ended") return null;
    if (!tick && prev.events >= RIVALS.LIVE_MAX_EVENTS) return null;
    if (frame.minute < prev.minute) return null;
    const fewer = Number(frame.score.for < prev.score.for) + Number(frame.score.against < prev.score.against);
    if (disallowed ? fewer !== 1 : fewer > 0) return null;
  }
  const before = prev?.score ?? { for: 0, against: 0 };
  const added = frame.score.for + frame.score.against - (before.for + before.against);
  if (frame.phase === "goal" ? added < 1 : disallowed ? added !== -1 : prev !== null && added !== 0) return null;
  const lastGoal = frame.phase === "goal"
    ? {
      minute: frame.minute,
      side: frame.score.for > before.for ? ("for" as const) : ("against" as const),
      scorer: frame.scorer && scorers.has(frame.scorer) ? frame.scorer : null,
    }
    // The goal the VAR took back was the last one: no last goal to show any more.
    : disallowed ? null : prev?.lastGoal ?? null;
  const status: LiveStatus = frame.phase === "end" ? "ended" : frame.phase === "half" ? "half" : "live";
  const named = (n: string | undefined) => (n && scorers.has(n) ? n : null);
  const moment: LiveMoment | null = frame.phase === "goal"
    ? { minute: frame.minute, kind: "goal", side: lastGoal!.side, player: lastGoal!.scorer }
    : disallowed
      ? { minute: frame.minute, kind: "disallowed", side: frame.score.for < before.for ? "for" : "against" }
      : red
        ? { minute: frame.minute, kind: "red", side: frame.side, player: named(frame.scorer) }
        : frame.phase === "half" || frame.phase === "end"
          ? { minute: frame.minute, kind: frame.phase }
          : null;
  const moments = [...(prev?.moments ?? []), ...(moment ? [moment] : [])].slice(-RIVALS.LIVE_MOMENTS_MAX);
  return {
    ...base,
    status,
    minute: frame.minute,
    score: { for: frame.score.for, against: frame.score.against },
    lastGoal,
    moments,
    events: (prev?.events ?? 0) + (tick ? 0 : 1),
    updatedAt: now,
  };
}

/** What a stored live game shows now: "stale" after `LIVE_STALE_MS` quiet, "gone" after `LIVE_DROP_MS` (ended: 10 min). */
export function liveStatusAt(view: LiveScoreView, now: number): LiveStatus | "gone" {
  const quiet = now - view.updatedAt;
  if (view.status === "ended") return quiet > RIVALS.LIVE_ENDED_KEEP_MS ? "gone" : "ended";
  if (quiet > RIVALS.LIVE_DROP_MS) return "gone";
  if (quiet > RIVALS.LIVE_STALE_MS) return "stale";
  return view.status;
}

/** Shape check for a live score from the socket or the API. */
export function isLiveScoreView(v: unknown): v is LiveScoreView {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  const s = l.score as Record<string, unknown> | undefined;
  return typeof l.seatId === "string" && typeof l.nickname === "string" && typeof l.clubId === "string"
    && typeof l.clubName === "string" && typeof l.opponentName === "string" && typeof l.home === "boolean"
    && typeof l.status === "string" && typeof l.minute === "number"
    && !!s && typeof s.for === "number" && typeof s.against === "number";
}
