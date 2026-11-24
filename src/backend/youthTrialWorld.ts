import { applyPressEffect } from "@/Domain/boardFans/boardFans";
import { addDays } from "@/Domain/dates";
import { effectiveStars } from "@/Domain/staff/staff";
import { YOUTH_TRIAL as T } from "@/Domain/youth/trialConfig";
import { emptyTrials, fameMult, generateTrialPlayers, revealOf } from "@/Domain/youth/trials";
import type { BoardState } from "@/types/boardTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { SeatState } from "@/types/seatTypes";
import type { TrialReveal, YouthTrialsState } from "@/types/youthTrialTypes";

/**
 * Youth trials (`.claude/rules/game/youth.md` → "Peneira de jovens"): E/S-free steps of the day advance. The seat's
 * trial state lives on `SeatState.youthTrials`; the trial players stay there until signed or until the results expire.
 */

export interface TrialDayOut {
  state: YouthTrialsState;
  /** Youngsters seen and gems among them, when the trial ran today. */
  ran?: { count: number; gems: number; expires: string };
}

/** The scheduled trial of today runs; results past their deadline leave. Null = nothing changed. */
export function runTrialDay(args: {
  saveId: string; seatId: string; date: string; state: YouthTrialsState | undefined; squad: Squad;
}): TrialDayOut | null {
  const { saveId, seatId, date, squad } = args;
  const state = args.state;
  if (!state) return null;
  let next: YouthTrialsState = state;
  let ran: TrialDayOut["ran"];
  if (next.results && next.results.expires < date) {
    const { results: _r, ...rest } = next;
    next = rest;
  }
  if (next.scheduled && next.scheduled.date <= date) {
    const trial = next.scheduled;
    const players = generateTrialPlayers({
      saveId, seatId, trial, squad, coachStars: effectiveStars(squad, "youthCoach"), fame: fameMult(squad.trialFame),
    });
    const expires = addDays(date, T.RESULTS_DAYS);
    const { scheduled: _s, ...rest } = next;
    next = { ...rest, results: { id: trial.id, date, expires, age: trial.age, players } };
    ran = { count: players.length, gems: players.filter((p) => p.profile?.archetype === "Wonderkid").length, expires };
  }
  return next === state ? null : { state: next, ran };
}

export interface TrialRevealEvent {
  seatId: string;
  clubId: string;
  clubName: string;
  player: { id: string; name: string };
  kind: TrialReveal;
  /** The club he plays for now. */
  nowClub: { id: string; name: string };
}

/** Monday: marks the trial players who made it (first team, world top 100, a big sale). */
export function squadTrialReveals(squad: Squad, worldTop: ReadonlySet<string>, date: string): { squad: Squad; events: TrialRevealEvent[] } {
  let changed = false;
  const events: TrialRevealEvent[] = [];
  const players = squad.players.map((p): RosterPlayer => {
    const kind = revealOf(p, { worldTop, inFirstTeamOf: squad.id });
    if (!kind || !p.trialOf) return p;
    changed = true;
    events.push({
      seatId: p.trialOf.seatId, clubId: p.trialOf.clubId, clubName: p.trialOf.clubName,
      player: { id: p.id, name: p.name }, kind, nowClub: { id: squad.id, name: squad.name },
    });
    return { ...p, trialRevealed: { kind, on: date } };
  });
  return changed ? { squad: { ...squad, players }, events } : { squad, events };
}

/** The trial club's reward for a reveal: followers +2% and one more step of fame. */
export function withRevealReward(squad: Squad): Squad {
  const followers = squad.finances?.followers;
  return {
    ...squad,
    trialFame: (squad.trialFame ?? 0) + 1,
    ...(squad.finances && followers != null ? { finances: { ...squad.finances, followers: Math.round(followers * (1 + T.REWARD.FOLLOWERS)) } } : {}),
  };
}

/** The seat's reveal tally and, when it still runs the trial club, the fans' cheer. */
export function seatRevealReward(
  seat: Pick<SeatState, "trialReveals">, board: BoardState | undefined, runsTrialClub: boolean, kind: TrialReveal,
): { trialReveals: NonNullable<SeatState["trialReveals"]>; board: BoardState | undefined } {
  const prev = seat.trialReveals ?? { count: 0, top: 0 };
  return {
    trialReveals: { count: prev.count + 1, top: prev.top + (kind === "world_top" ? 1 : 0) },
    board: runsTrialClub && board ? applyPressEffect(board, 0, T.REWARD.FANS) : board,
  };
}

export { emptyTrials };
