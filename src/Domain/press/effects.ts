import { PRESS } from "@/Domain/press/pressConfig";
import { applyPressEffect } from "@/Domain/boardFans/boardFans";
import { afterPressAnswer } from "@/Domain/morale/morale";
import { takesDemandWell } from "@/Domain/personality/personality";
import type { BoardState } from "@/types/boardTypes";
import type { Squad } from "@/types/playerTypes";
import type { PressConference, PressPromise, PressRecord, PressState, PressTone } from "@/types/pressTypes";

export function emptyPressState(): PressState {
  return { winless: 0, promises: [], history: [] };
}

export function validateAnswers(c: PressConference, answers: Record<string, string>): boolean {
  if (Object.keys(answers).length !== c.questions.length) return false;
  return c.questions.every((q) => q.answers.some((a) => a.id === answers[q.id]));
}

export interface PressQuote { tone: PressTone; playerId?: string; player?: string }

const pushHistory = (st: PressState, rec: PressRecord): PressRecord[] => [rec, ...st.history].slice(0, PRESS.HISTORY);

/** Aplica as respostas (já validadas). */
export function answerConference(a: {
  conference: PressConference; answers: Record<string, string>; squad: Squad; board: BoardState; state: PressState;
}): { squad: Squad; board: BoardState; state: PressState; quotes: PressQuote[] } {
  const c = a.conference;
  let squad = a.squad;
  let board = a.board;
  let promises = [...a.state.promises];
  const quotes: PressQuote[] = [];
  const chosen: { questionId: string; tone: PressTone }[] = [];

  for (const q of c.questions) {
    const tone = q.answers.find((x) => x.id === a.answers[q.id])!.tone;
    chosen.push({ questionId: q.id, tone });
    const fx = PRESS.TONE[tone];
    if (fx.squad) squad = afterPressAnswer(squad, "all", fx.squad);
    if (fx.player && q.playerId) {
      const target = squad.players.find((p) => p.id === q.playerId);
      const delta = tone === "criticize" && target && takesDemandWell(target) ? PRESS.CRITICIZE_PRO : fx.player;
      squad = afterPressAnswer(squad, q.playerId, delta);
    }
    let boardDelta = fx.board;
    if (tone === "defend_squad" && PRESS.BAD.includes(c.trigger)) boardDelta += PRESS.DEFEND_BAD_BOARD;
    board = applyPressEffect(board, boardDelta, fx.fans);

    const kind = PRESS.PROMISE_OF[tone];
    if (kind && !promises.some((p) => p.kind === kind)) {
      const p: PressPromise = { id: `${c.id}-${kind}`, kind, from: c.date };
      if (kind !== "objective" && c.kind === "pre" && c.fixtureId) p.fixtureId = c.fixtureId;
      if (kind === "objective" && board.objective) p.season = board.objective.season;
      if (kind !== "objective" || p.season) promises.push(p);
    }
    if (PRESS.QUOTE_TONES.includes(tone)) {
      quotes.push({ tone, ...(q.playerId ? { playerId: q.playerId, player: q.params.player } : {}) });
    }
  }

  const { pending: _p, ...rest } = a.state;
  return {
    squad, board, quotes,
    state: { ...rest, lastDate: c.date, promises, history: pushHistory(a.state, { id: c.id, date: c.date, trigger: c.trigger, answers: chosen }) },
  };
}

export function ignoreConference(a: { conference: PressConference; board: BoardState; state: PressState }): { board: BoardState; state: PressState } {
  const { pending: _p, ...rest } = a.state;
  return {
    board: applyPressEffect(a.board, PRESS.IGNORED_BOARD, 0),
    state: { ...rest, lastDate: a.conference.date,
      history: pushHistory(a.state, { id: a.conference.id, date: a.conference.date, trigger: a.conference.trigger, answers: "ignored" }) },
  };
}

export type PromiseOutcome = { promise: PressPromise; outcome: "kept" | "draw" | "broken" };

/** Um jogo oficial do clube do jogador terminou. */
export function resolveMatchPromises(st: PressState, board: BoardState, m: { fixtureId: string; result: "W" | "D" | "L" }):
  { state: PressState; board: BoardState; outcomes: PromiseOutcome[] } {
  const outcomes: PromiseOutcome[] = [];
  const left: PressPromise[] = [];
  let b = board;
  for (const p of st.promises) {
    const due = p.kind !== "objective" && (!p.fixtureId || p.fixtureId === m.fixtureId);
    if (!due) { left.push(p); continue; }
    const outcome = m.result === "W" ? "kept" : m.result === "D" ? "draw" : "broken";
    const fx = PRESS.PROMISE[p.kind][outcome];
    b = applyPressEffect(b, fx.board, fx.fans);
    outcomes.push({ promise: p, outcome });
  }
  return { state: { ...st, promises: left }, board: b, outcomes };
}

/** Virada do país do clube do jogador (`playerObjectiveMet`). */
export function resolveObjectivePromise(st: PressState, board: BoardState, met: boolean):
  { state: PressState; board: BoardState; outcomes: PromiseOutcome[] } {
  const outcomes: PromiseOutcome[] = [];
  let b = board;
  for (const p of st.promises.filter((x) => x.kind === "objective")) {
    const outcome = met ? "kept" : "broken";
    const fx = PRESS.PROMISE.objective[outcome];
    b = applyPressEffect(b, fx.board, fx.fans);
    outcomes.push({ promise: p, outcome });
  }
  return { state: { ...st, promises: st.promises.filter((x) => x.kind !== "objective") }, board: b, outcomes };
}
