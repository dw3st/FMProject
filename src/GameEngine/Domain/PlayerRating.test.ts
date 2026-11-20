import { afterEach, describe, expect, test } from "bun:test";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { FM_RATING, RATING_WEIGHTS } from "@/GameEngine/Configs/PlayerRatingConfig";
import {
  exportRatingState, exportRatings, getAllLegacyRatings, getPlayerRating, getRatingTally, importRatingState, importRatings, initRatings,
} from "@/GameEngine/Domain/PlayerRating";
import { emptyTally, ratingFromTally } from "@/GameEngine/Domain/RatingModel";

const PLAYERS = [{ id: 1, team: "A" as const }, { id: 2, team: "A" as const }, { id: 3, team: "B" as const }, { id: 4, team: "B" as const }];
const goal = (scorerId: number, team: "A" | "B", score: { A: number; B: number }, minute: number, extra: object = {}) =>
  gameBus.emit("goalScored", { team, score, scorerId, fromX: 100, fromY: 37, goalX: 115, minute, ...extra });

afterEach(() => setDecisionFlags());

describe("stage 17 rating hooks", () => {
  test("a pass that leads to a shot is a chance created with open-play xA; a set piece has no xA", () => {
    initRatings(PLAYERS);
    gameBus.emit("shot", { player: 1, xg: 0.2, passerId: 2 });
    gameBus.emit("shot", { player: 1, xg: 0.1, passerId: 2, setPiece: true });
    const t = getRatingTally(2)!;
    expect(t.keyPasses).toBe(2);
    expect(t.xa).toBeCloseTo(0.2, 6);
    expect(getRatingTally(1)!.npxg).toBeCloseTo(0.3, 6);
  });

  test("goal quality by the shot xG; a late goal that levels is decisive; a penalty is neither", () => {
    initRatings(PLAYERS);
    gameBus.emit("shot", { player: 1, xg: 0.04 });
    goal(1, "A", { A: 1, B: 1 }, 85);
    let t = getRatingTally(1)!;
    expect([t.goals, t.greatGoals, t.goodGoals, t.decisiveGoals, t.npGoals]).toEqual([1, 1, 0, 1, 1]);
    gameBus.emit("shot", { player: 1, xg: 0.78, penalty: true });
    goal(1, "A", { A: 3, B: 1 }, 87, { setPiece: "penalty" });
    t = getRatingTally(1)!;
    expect([t.goals, t.greatGoals, t.decisiveGoals, t.npGoals]).toEqual([2, 1, 1, 1]);
    expect(t.npxg).toBeCloseTo(0.04, 6);
  });

  test("a ball lost and turned into a goal before the side wins it back is a mistake; four opponent passes clear it", () => {
    initRatings(PLAYERS);
    gameBus.emit("passFailed", { player: 3, toId: 4 });
    goal(1, "A", { A: 1, B: 0 }, 10);
    expect(getRatingTally(3)!.mistakesToGoal).toBe(1);
    gameBus.emit("passFailed", { player: 4, toId: 3 });
    for (let i = 0; i < FM_RATING.MISTAKE_PASS_WINDOW; i++) gameBus.emit("passCompleted", { player: 1, toId: 2 });
    goal(2, "A", { A: 2, B: 0 }, 20);
    expect(getRatingTally(4)!.mistakesToGoal).toBe(0);
    gameBus.emit("passFailed", { player: 4, toId: 3 });
    gameBus.emit("passCompleted", { player: 3, toId: 4 });
    goal(2, "A", { A: 3, B: 0 }, 30);
    expect(getRatingTally(4)!.mistakesToGoal).toBe(0);
  });

  test("a goal ruled out undoes every hook it added", () => {
    initRatings(PLAYERS);
    gameBus.emit("passFailed", { player: 3, toId: 4 });
    gameBus.emit("shot", { player: 1, xg: 0.1, passerId: 2 });
    goal(1, "A", { A: 1, B: 0 }, 89, { assistId: 2 });
    gameBus.emit("goalDisallowed", { team: "A", scorerId: 1, assistId: 2, score: { A: 0, B: 0 }, minute: 89 });
    const t = getRatingTally(1)!;
    expect([t.goals, t.goodGoals, t.decisiveGoals, t.npGoals]).toEqual([0, 0, 0, 0]);
    expect(getRatingTally(2)!.assists).toBe(0);
    expect(getRatingTally(3)!.mistakesToGoal).toBe(0);
  });

  test("a physical touch counts once (its interception echo is skipped); a clearing touch is a clearance", () => {
    initRatings(PLAYERS);
    const touch = { team: "B" as const, passerId: 1, kind: "regular" as const, speedMs: 10, zM: 0, offset: 0.2, control: 0.7, flight: 0.4 };
    gameBus.emit("interceptionTouch", { ...touch, player: 3, outcome: "control" });
    gameBus.emit("interception", { player: 3, success: true, chance: 0.7 });
    gameBus.emit("interceptionTouch", { ...touch, player: 4, outcome: "clear" });
    gameBus.emit("interception", { player: 4, success: true, chance: 0.7 });
    gameBus.emit("interception", { player: 4, success: true, chance: 0.5 });
    expect(getRatingTally(3)!.interceptions).toBe(1);
    expect(getRatingTally(4)!.clearances).toBe(1);
    expect(getRatingTally(4)!.interceptions).toBe(1);
  });

  test("blocks, saves by grade and the rating = BASELINE + parts", () => {
    initRatings(PLAYERS);
    gameBus.emit("shotBlocked", { player: 1, blockerId: 3 });
    gameBus.emit("keeperSave", { keeperId: 4, kind: "parry", grade: "difficult" });
    expect(getRatingTally(3)!.blocks).toBe(1);
    const k = getRatingTally(4)!;
    expect([k.saves, k.greatSaves]).toEqual([1, 1]);
    expect(getPlayerRating(4)).toBeCloseTo(FM_RATING.BASELINE + FM_RATING.SAVE + FM_RATING.GREAT_SAVE, 6);
  });

  test("the flag off returns the legacy event weights; both are always kept", () => {
    setDecisionFlags({ FM_RATINGS: false });
    initRatings(PLAYERS);
    gameBus.emit("shot", { player: 1, xg: 0.3 });
    expect(getPlayerRating(1)).toBeCloseTo(RATING_WEIGHTS.BASELINE + RATING_WEIGHTS.SHOT, 6);
    setDecisionFlags({ FM_RATINGS: true });
    expect(getPlayerRating(1)).toBeCloseTo(ratingFromTally({ ...emptyTally(), shots: 1, npxg: 0.3 }), 6);
    expect(getAllLegacyRatings()[1]).toBeCloseTo(RATING_WEIGHTS.BASELINE + RATING_WEIGHTS.SHOT, 6);
  });

  test("a plain import shows the imported number and later hooks move it from there; the full state round-trips", () => {
    initRatings(PLAYERS);
    gameBus.emit("tackle", { player: 3, targetId: 1, success: true, chance: 0.5 });
    const state = exportRatingState();
    const plain = exportRatings();
    initRatings(PLAYERS);
    importRatings([[3, 7.2]]);
    expect(getPlayerRating(3)).toBeCloseTo(7.2, 6);
    gameBus.emit("tackle", { player: 3, targetId: 1, success: true, chance: 0.5 });
    expect(getPlayerRating(3)).toBeCloseTo(7.2 + FM_RATING.TACKLE_WON, 6);
    importRatingState(state);
    expect(getPlayerRating(3)).toBeCloseTo(plain.find(([id]) => id === 3)![1], 6);
  });
});
