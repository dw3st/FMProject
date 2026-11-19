import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { MENTAL_KEYS, hasMental } from "@/Domain/mental/mental";
import type { RosterPlayer } from "@/types/playerTypes";

// A save written before the mental attributes (`.claude/rules/game/mental.md`): every read fills them, deterministic.
const dal = new FileSystemDAL();
const saveId = `test-mental-${randomUUID()}`;
afterAll(async () => { await dal.deleteSave(saveId); });

const oldStats = {
  passing: 4.2, vision: 3.1, finishing: 2.5, dribbling: 3.8, speed: 5, acceleration: 5.2, tackling: 2,
  pressing: 3.4, stamina: 5, heading: 2.2, strength: 4, reflex: 0.4, jump: 0.8,
};
const oldPlayer = (id: string, age: number) => ({
  id, name: `P ${id}`, age, squadId: "c1", preferredFoot: "right", positions: ["Midfielder"], stats: { ...oldStats },
  profile: { summary: "", archetype: "" },
});

function writeRaw(rel: string, data: unknown) {
  const path = `${RUNTIME_DATA_DIR}/saves/${saveId}/${rel}`;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

function checkFilled(p: RosterPlayer) {
  expect(hasMental(p.stats)).toBe(true);
  for (const k of MENTAL_KEYS) {
    expect(p.stats[k]).toBeGreaterThanOrEqual(0);
    expect(p.stats[k]).toBeLessThanOrEqual(10);
  }
  // The 13 others are read as written.
  for (const [k, v] of Object.entries(oldStats)) expect(p.stats[k as keyof typeof oldStats]).toBe(v);
}

describe("DAL reads without the mental keys", () => {
  writeRaw("squads/lg/c1.json", { id: "c1", name: "C1", players: [oldPlayer("a1", 22), oldPlayer("a2", 31)], youth: [oldPlayer("y1", 16)] });
  writeRaw("freeAgents.json", [{ player: oldPlayer("f1", 28), since: "2027-01-01" }]);
  writeRaw("retired.json", [{ ...oldPlayer("r1", 36), statsAtRetirement: { ...oldStats }, stats: undefined, retiredOn: "2027-06-01", appearances: 0, goals: 0 }]);

  test("squad (players and youth), league listing and squad files: filled and deterministic", async () => {
    const a = (await dal.readSquad(saveId, "lg", "c1"))!;
    const b = (await dal.readSquad(saveId, "lg", "c1"))!;
    for (const p of [...a.players, ...a.youth!]) checkFilled(p);
    expect(a.players.map((p) => p.stats)).toEqual(b.players.map((p) => p.stats));
    const listed = (await dal.listSquadsInLeague(saveId, "lg"))[0]!;
    expect(listed.players.map((p) => p.stats)).toEqual(a.players.map((p) => p.stats));
    const file = (await dal.listSquadFiles(saveId))[0]!;
    expect(file.squad.youth!.map((p) => p.stats)).toEqual(a.youth!.map((p) => p.stats));
    // Same base attributes, different age and id: different values.
    expect(a.players[0]!.stats).not.toEqual(a.players[1]!.stats);
  });

  test("free agents and retired players", async () => {
    const [agent] = await dal.readFreeAgents(saveId);
    checkFilled(agent!.player);
    const [r] = await dal.readRetired(saveId);
    expect(hasMental(r!.statsAtRetirement)).toBe(true);
    expect(await dal.readRetired(saveId)).toEqual([r!]);
  });
});
