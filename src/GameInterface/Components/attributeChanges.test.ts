import { expect, test } from "bun:test";
import { groupDevelopmentChanges } from "@/GameInterface/Components/attributeChanges";

test("groups by player and merges the same attribute across matches", () => {
  const out = groupDevelopmentChanges([
    { playerId: "a", playerName: "A", changes: [{ stat: "speed", delta: 0.1, newValue: 6.2 }] },
    { playerId: "a", playerName: "A", changes: [{ stat: "speed", delta: 0.1, newValue: 6.3 }, { stat: "vision", delta: -0.1, newValue: 4.9 }] },
    { playerId: "b", playerName: "B", changes: [{ stat: "passing", delta: 0.2, newValue: 7.2 }] },
  ]);
  expect(out).toEqual([
    { playerId: "a", playerName: "A", changes: [{ stat: "speed", from: 6.1, to: 6.3 }, { stat: "vision", from: 5, to: 4.9 }] },
    { playerId: "b", playerName: "B", changes: [{ stat: "passing", from: 7, to: 7.2 }] },
  ]);
});

test("drops attributes that end where they started", () => {
  const out = groupDevelopmentChanges([
    { playerId: "a", playerName: "A", changes: [{ stat: "speed", delta: 0.1, newValue: 6.2 }] },
    { playerId: "a", playerName: "A", changes: [{ stat: "speed", delta: -0.1, newValue: 6.1 }] },
  ]);
  expect(out).toEqual([]);
});
