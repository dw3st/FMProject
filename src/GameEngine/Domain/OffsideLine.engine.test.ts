import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, PassState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

describe("offsideCalled carries the offside line", () => {
  test("a regular pass flagged offside at kick time reports the line snapshotted on the pass", () => {
    const f = formation433Json as Formation;
    let s: GameState = {
      ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
      matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
    };
    const passer = s.players.find(p => p.team === "A" && p.role === "CM")!;
    const receiver = s.players.find(p => p.team === "A" && p.role === "ST")!;
    const pass: PassState = {
      fromId: passer.id, toId: receiver.id, toX: receiver.x, toY: receiver.y, kind: "regular", t: 0.99,
      distance: 20, receiverOffside: true, intendedRunnerId: null, offsideLineX: 83.5,
    };
    s = { ...s, ballHolderId: passer.id, pass };
    const events: GameEvents["offsideCalled"][] = [];
    const off = gameBus.on("offsideCalled", e => events.push(e));
    for (let i = 0; i < 10 && events.length === 0; i++) s = tickState(s, 0.2).state;
    off();
    expect(events).toHaveLength(1);
    expect(events[0]!.lineX).toBe(83.5);
  });
});
