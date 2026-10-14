import { describe, expect, test } from "bun:test";
import { allAnswered, answersPayload } from "@/GameInterface/Press/pressApi";

describe("pressApi helpers", () => {
  test("answersPayload lists one entry per question", () => {
    expect(answersPayload({ q0: "q0-a1", q1: "q1-a0" })).toEqual({
      answers: [{ questionId: "q0", answerId: "q0-a1" }, { questionId: "q1", answerId: "q1-a0" }],
    });
  });

  test("allAnswered needs a valid answer for every question", () => {
    const c = { questions: [
      { id: "q0", answers: [{ id: "q0-a0", key: "k" }] },
      { id: "q1", answers: [{ id: "q1-a0", key: "k" }] },
    ] } as never;
    expect(allAnswered(c, { q0: "q0-a0" })).toBe(false);
    expect(allAnswered(c, { q0: "q0-a0", q1: "x" })).toBe(false);
    expect(allAnswered(c, { q0: "q0-a0", q1: "q1-a0" })).toBe(true);
  });
});
