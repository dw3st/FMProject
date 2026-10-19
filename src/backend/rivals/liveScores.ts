// A friend's live score (multiplayer part 6): in memory, per world and seat. The browser of who plays sends it
// (`live_score` on `/api/ws`); the other members get `friend_live`. Provisional: the official result is the day's.
import { saveService } from "@/backend/SaveService";
import { listSaveMembers, memberOf } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { applyLiveFrame, liveStatusAt } from "@/Domain/rivals/liveScore";
import type { LiveBase, LiveScoreFrame, LiveScoreView } from "@/types/rivalsTypes";
import type { ServerEvent } from "@/types/socialTypes";

export type LiveNotify = (userId: string, event: ServerEvent) => void;

/** Who plays which game: null when the user is not a member, or the fixture is not his club's game of today. */
export type LiveResolver = (saveId: string, userId: string, fixtureId: string) => Promise<{ base: LiveBase; scorers: string[] } | null>;

interface Entry { view: LiveScoreView; scorers: Set<string> }

const worlds = new Map<string, Map<string, Entry>>();

const defaultResolver: LiveResolver = async (saveId, userId, fixtureId) => {
  const member = memberOf(saveId, userId);
  if (!member) return null;
  const meta = await saveService.getMeta(saveId);
  if (meta?.mode !== "multi" || meta.world?.phase !== "running" || !meta.currentDate) return null;
  const seat = await saveService.getSeat(saveId, member.seatId);
  if (!seat?.clubId || seat.unemployed) return null;
  const fixture = (await saveService.getFixturesForDate(saveId, meta.currentDate))
    .find((f) => f.id === fixtureId && !f.played && (f.home === seat.clubId || f.away === seat.clubId));
  if (!fixture) return null;
  const home = fixture.home === seat.clubId;
  const opponentId = home ? fixture.away : fixture.home;
  const [mine, opp] = await Promise.all([saveService.getSquadById(saveId, seat.clubId), saveService.getSquadById(saveId, opponentId)]);
  return {
    base: {
      seatId: member.seatId,
      nickname: getSocialUser(userId)?.nickname ?? seat.manager?.name ?? "?",
      clubId: seat.clubId, clubName: seat.clubName, opponentId, opponentName: opp?.name ?? opponentId,
      home, fixtureId, date: meta.currentDate,
    },
    scorers: [...(mine?.players ?? []), ...(opp?.players ?? [])].map((p) => p.name),
  };
};

let resolver: LiveResolver = defaultResolver;

/** Tests only. `null` restores the real resolver. */
export function setLiveResolver(fn: LiveResolver | null): void {
  resolver = fn ?? defaultResolver;
}

/** Tests only. */
export function resetLiveScores(): void {
  worlds.clear();
  resolver = defaultResolver;
}

function tellOthers(saveId: string, seatId: string, live: LiveScoreView | null, notify: LiveNotify, except?: string, goal?: boolean): void {
  for (const m of listSaveMembers(saveId)) {
    if (m.userId === except || m.seatId === seatId) continue;
    notify(m.userId, { type: "friend_live", saveId, seatId, live, ...(goal ? { goal: true as const } : {}) });
  }
}

/**
 * One `live_score` frame of `userId`. True when it was taken (and repeated to the other members); false, in
 * silence, for a stranger, someone else's game, or an incoherent frame.
 */
export async function acceptLiveScore(userId: string, frame: LiveScoreFrame, notify: LiveNotify, now = Date.now()): Promise<boolean> {
  const member = memberOf(frame.saveId, userId);
  if (!member) return false;
  const seats = worlds.get(frame.saveId) ?? new Map<string, Entry>();
  const cur = seats.get(member.seatId);
  const fresh = cur && liveStatusAt(cur.view, now) !== "gone" && cur.view.fixtureId === frame.fixtureId ? cur : null;
  let base: LiveBase;
  let scorers: Set<string>;
  if (fresh && frame.phase !== "start") {
    base = fresh.view;
    scorers = fresh.scorers;
  } else {
    const ctx = await resolver(frame.saveId, userId, frame.fixtureId);
    if (!ctx || ctx.base.seatId !== member.seatId) return false;
    base = ctx.base;
    scorers = new Set(ctx.scorers);
  }
  const next = applyLiveFrame(fresh?.view ?? null, frame, base, scorers, now);
  if (!next) return false;
  seats.set(member.seatId, { view: next, scorers });
  worlds.set(frame.saveId, seats);
  tellOthers(frame.saveId, member.seatId, next, notify, userId, frame.phase === "goal");
  return true;
}

/** The world's live games now (stale ones marked, gone ones left out). */
export function liveScoresOf(saveId: string, now = Date.now()): LiveScoreView[] {
  const out: LiveScoreView[] = [];
  for (const { view } of worlds.get(saveId)?.values() ?? []) {
    const status = liveStatusAt(view, now);
    if (status !== "gone") out.push({ ...view, status });
  }
  return out;
}

/** Every 30 s (with the presence sweep): a quiet game turns stale, then goes; the members are told. */
export function sweepLiveScores(now: number, notify: LiveNotify): void {
  for (const [saveId, seats] of worlds) {
    for (const [seatId, entry] of seats) {
      const status = liveStatusAt(entry.view, now);
      if (status === "gone") {
        seats.delete(seatId);
        tellOthers(saveId, seatId, null, notify);
      } else if (status === "stale" && entry.view.status !== "stale") {
        entry.view = { ...entry.view, status: "stale" };
        tellOthers(saveId, seatId, entry.view, notify);
      }
    }
    if (seats.size === 0) worlds.delete(saveId);
  }
}

/** The day `date` ran (group advance): its live games are official now and leave. */
export function clearLiveForDay(saveId: string, date: string, notify: LiveNotify): void {
  const seats = worlds.get(saveId);
  if (!seats) return;
  for (const [seatId, entry] of seats) {
    if (entry.view.date > date) continue;
    seats.delete(seatId);
    tellOthers(saveId, seatId, null, notify);
  }
  if (seats.size === 0) worlds.delete(saveId);
}
