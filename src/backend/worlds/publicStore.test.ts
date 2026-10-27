import { beforeEach, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { closeOpenEditions, editionOf, listEditions, openEdition, saveEditionStandings } from "@/backend/worlds/publicStore";

beforeEach(() => db.prepare("DELETE FROM public_editions").run());

test("open, update, close and list editions (newest first)", () => {
  openEdition("4.35.0", "save-a", "2026-10-26T12:00:00.000Z");
  saveEditionStandings("4.35.0", [{ rank: 1, nickname: "emy", clubName: "Arsenal", total: 12, seasons: 0 }]);
  expect(editionOf("4.35.0")!.saveId).toBe("save-a");
  closeOpenEditions("2026-11-01T12:00:00.000Z", "4.36.0");
  openEdition("4.36.0", "save-b", "2026-11-01T12:00:00.000Z");
  const all = listEditions();
  expect(all.map((e) => e.version)).toEqual(["4.36.0", "4.35.0"]);
  expect(all[1]!.endedAt).toBe("2026-11-01T12:00:00.000Z");
  expect(all[1]!.standings[0]!.nickname).toBe("emy");
  expect(all[0]!.endedAt).toBeNull();
});
