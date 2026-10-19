// The human clubs' games of a day and what they say (multiplayer part 6). Pure.
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { ResultSituation, SeatResult, SeatResultGoal } from "@/types/rivalsTypes";

export interface ResultSeat { seatId: string; clubId: string; nickname: string }

type Scored = { home: boolean; score: { for: number; against: number } };

/** "Vasco 0–3 Bahia": the home side first. */
export function scoreLineOf(r: Scored & { clubName: string; opponentName: string }): string {
  return r.home
    ? `${r.clubName} ${r.score.for}–${r.score.against} ${r.opponentName}`
    : `${r.opponentName} ${r.score.against}–${r.score.for} ${r.clubName}`;
}

/** What the game says about the club. Always one of win / draw / loss; the goals' minutes tell the story. */
export function resultSituations(r: Scored & {
  goals: readonly SeatResultGoal[];
  decider?: { penalties: { for: number; against: number } };
}): ResultSituation[] {
  const margin = r.score.for - r.score.against;
  const out: ResultSituation[] = [margin > 0 ? "win" : margin < 0 ? "loss" : "draw"];
  if (margin === 0 && r.decider) {
    out.push(r.decider.penalties.for > r.decider.penalties.against ? "shootout_win" : "shootout_loss");
  }
  if (margin >= RIVALS.BIG_MARGIN) out.push("big_win");
  if (margin <= -RIVALS.BIG_MARGIN) out.push("big_loss");
  if (r.home && margin < 0) out.push("home_loss");
  if (!r.home && margin > 0) out.push("away_win");
  const goals = [...r.goals].sort((a, b) => a.minute - b.minute);
  let diff = 0;
  let wasBehind = false;
  let wasAhead = false;
  let decisive: number | null = null;
  for (const goal of goals) {
    const before = diff;
    diff += goal.side === "for" ? 1 : -1;
    if (diff < 0) wasBehind = true;
    if (diff > 0) wasAhead = true;
    if (before <= 0 && diff > 0) decisive = goal.minute;
  }
  if (margin > 0 && wasBehind) out.push("comeback_win");
  if (margin <= 0 && wasAhead) out.push("blown_lead");
  const last = goals[goals.length - 1];
  if (margin === 0 && last?.side === "for" && last.minute >= RIVALS.LATE_MINUTE) out.push("late_equalizer");
  if (margin > 0 && decisive !== null && decisive >= RIVALS.LATE_MINUTE) out.push("late_winner");
  return out;
}

/** The games of the seats' clubs among the day's events (`MatchEvent`); a game between two seats gives two results. */
export function buildSeatResults(args: {
  date: string;
  events: unknown;
  seats: readonly ResultSeat[];
  clubName: (id: string) => string;
}): SeatResult[] {
  if (!Array.isArray(args.events)) return [];
  const out: SeatResult[] = [];
  for (const e of args.events as { kind?: unknown }[]) {
    if (!e || e.kind !== "match") continue;
    const m = e as MatchEvent;
    for (const seat of args.seats) {
      const home = m.home === seat.clubId;
      if (!home && m.away !== seat.clubId) continue;
      const opponentId = home ? m.away : m.home;
      const score = home ? { for: m.score.home, against: m.score.away } : { for: m.score.away, against: m.score.home };
      const goals: SeatResultGoal[] = (m.goals ?? []).map((goal) => ({
        minute: goal.minute,
        side: (goal.team === "home") === home ? "for" : "against",
        scorer: m.playerNames?.[goal.playerId] ?? "",
      }));
      const pens = m.decider?.penalties;
      const decider = pens
        ? { penalties: home ? { for: pens.home, against: pens.away } : { for: pens.away, against: pens.home } }
        : undefined;
      const base = { home, score, goals, ...(decider ? { decider } : {}) };
      out.push({
        id: `${args.date}:${m.competition}:${m.fixtureId}:${seat.seatId}`,
        date: args.date,
        seatId: seat.seatId,
        nickname: seat.nickname,
        clubId: seat.clubId,
        clubName: args.clubName(seat.clubId),
        opponentId,
        opponentName: args.clubName(opponentId),
        competition: m.competition,
        ...base,
        situations: resultSituations(base),
      });
    }
  }
  return out;
}

export function resultLetter(r: { score: { for: number; against: number } }): "W" | "D" | "L" {
  const margin = r.score.for - r.score.against;
  return margin > 0 ? "W" : margin < 0 ? "L" : "D";
}

/** The seat's last `n` results of the feed (newest first), oldest first for display. */
export function formOf(feed: readonly SeatResult[], seatId: string, n: number = RIVALS.FORM_SIZE): ("W" | "D" | "L")[] {
  return feed.filter((r) => r.seatId === seatId).slice(0, n).map(resultLetter).reverse();
}

/** Adds results to the feed: an id already there is kept as is (a re-run day never duplicates); newest first. */
export function mergeFeed(cur: readonly SeatResult[], fresh: readonly SeatResult[], max: number = RIVALS.FEED_MAX): SeatResult[] {
  const ids = new Set(cur.map((r) => r.id));
  const add = fresh.filter((r) => !ids.has(r.id));
  return [...add, ...cur]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .slice(0, max);
}

/** Shape check for results coming from the socket. */
export function isSeatResult(v: unknown): v is SeatResult {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const s = r.score as Record<string, unknown> | undefined;
  return typeof r.id === "string" && typeof r.date === "string" && typeof r.seatId === "string"
    && typeof r.nickname === "string" && typeof r.clubId === "string" && typeof r.clubName === "string"
    && typeof r.opponentName === "string" && typeof r.home === "boolean"
    && !!s && typeof s.for === "number" && typeof s.against === "number"
    && Array.isArray(r.goals) && Array.isArray(r.situations);
}
