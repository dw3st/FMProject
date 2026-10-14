import { describe, expect, test } from "bun:test";
import { answerConference, ignoreConference, resolveMatchPromises, resolveObjectivePromise, validateAnswers, emptyPressState } from "@/Domain/press/effects";
import { buildConference } from "@/Domain/press/questions";
import { initialBoardState } from "@/Domain/boardFans/boardFans";
import type { Squad } from "@/types/playerTypes";

const squad = { id: "me", players: [
  { id: "p1", name: "A", morale: 60, personality: { ambition: 10, loyalty: 10, professionalism: 10, temperament: 10 } },
  { id: "p9", name: "Zé", morale: 60, personality: { ambition: 10, loyalty: 10, professionalism: 18, temperament: 10 } },
] } as unknown as Squad;
const board = initialBoardState("2027-03-01", null);
const conf = buildConference({ id: "c1", trigger: "derby", kind: "pre", date: "2027-03-10", expires: "2027-03-12",
  fixtureId: "f1", params: { opponent: "Rival" }, player: { id: "p9", name: "Zé", angle: "culprit" }, seed: "s" });
const ans = (tones: string[]) => Object.fromEntries(conf.questions.map((q, i) => [q.id, q.answers.find((a) => a.tone === tones[i])!.id]));

describe("validateAnswers", () => {
  test("exige todas as perguntas com ids válidos", () => {
    expect(validateAnswers(conf, ans(["confident", "praise", "defend_squad"]))).toBe(true);
    expect(validateAnswers(conf, { [conf.questions[0]!.id]: conf.questions[0]!.answers[0]!.id })).toBe(false);
    expect(validateAnswers(conf, { ...ans(["confident", "praise", "defend_squad"]), [conf.questions[0]!.id]: "x" })).toBe(false);
  });
});

describe("answerConference", () => {
  test("provocador: torcida +2, diretoria −1, elenco +1, promessa win_bold do jogo", () => {
    const r = answerConference({ conference: conf, answers: ans(["provocative", "protect", "neutral"]), squad, board, state: emptyPressState() });
    expect(r.board.fans).toBeGreaterThan(board.fans);
    expect(r.board.board).toBeLessThan(board.board);
    expect(r.state.promises).toEqual([{ id: "c1-win_bold", kind: "win_bold", from: "2027-03-10", fixtureId: "f1" }]);
    expect(r.state.pending).toBeUndefined();
    expect(r.state.lastDate).toBe("2027-03-10");
    expect(r.state.history[0]!.answers).not.toBe("ignored");
    expect(r.quotes.map((q) => q.tone)).toContain("provocative");
  });
  test("cobrar um profissional dá +1, não −4", () => {
    const r = answerConference({ conference: conf, answers: ans(["cautious", "criticize", "neutral"]), squad, board, state: emptyPressState() });
    expect(r.squad.players.find((p) => p.id === "p9")!.morale).toBeGreaterThan(60);
  });
  test("cauteloso e neutro: nada muda", () => {
    const r = answerConference({ conference: conf, answers: ans(["cautious", "protect", "neutral"]), squad, board, state: emptyPressState() });
    expect(r.board).toEqual(board);
  });
});

describe("ignorar e promessas", () => {
  test("ignorada: diretoria −1 e histórico 'ignored'", () => {
    const r = ignoreConference({ conference: conf, board, state: { ...emptyPressState(), pending: conf } });
    expect(r.board.board).toBe(59);
    expect(r.state.pending).toBeUndefined();
    expect(r.state.history[0]!.answers).toBe("ignored");
  });
  test("promessa de jogo cumprida, empatada, quebrada", () => {
    const st = { ...emptyPressState(), promises: [{ id: "x", kind: "win" as const, from: "d", fixtureId: "f1" }] };
    const won = resolveMatchPromises(st, board, { fixtureId: "f1", result: "W" });
    expect(won.board.fans).toBe(63); expect(won.state.promises).toEqual([]); expect(won.outcomes[0]!.outcome).toBe("kept");
    expect(resolveMatchPromises(st, board, { fixtureId: "f1", result: "L" }).outcomes[0]!.outcome).toBe("broken");
    expect(resolveMatchPromises(st, board, { fixtureId: "other", result: "W" }).state.promises).toHaveLength(1);
  });
  test("promessa sem jogo vale o próximo oficial", () => {
    const st = { ...emptyPressState(), promises: [{ id: "x", kind: "win" as const, from: "d" }] };
    expect(resolveMatchPromises(st, board, { fixtureId: "zz", result: "D" }).outcomes[0]!.outcome).toBe("draw");
  });
  test("meta da temporada", () => {
    const st = { ...emptyPressState(), promises: [{ id: "o", kind: "objective" as const, from: "d", season: "2026-27" }] };
    const r = resolveObjectivePromise(st, board, false);
    expect(r.board.board).toBe(56); expect(r.outcomes[0]!.outcome).toBe("broken"); expect(r.state.promises).toEqual([]);
  });
});
