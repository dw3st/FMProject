import { describe, expect, spyOn, test } from "bun:test";
import { getStarPlayerIds } from "@/backend/starsIndex";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const player = (id: string, overall: number): RosterPlayer =>
  ({
    id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"],
    stats: {
      passing: overall, vision: overall, finishing: overall, dribbling: overall, speed: overall,
      acceleration: overall, tackling: overall, pressing: overall, stamina: overall, heading: overall,
      strength: overall, reflex: overall, jump: overall,
    },
    profile: { summary: "", archetype: "" },
  }) as unknown as RosterPlayer;

const meta = (id: string, currentDate: string) =>
  ({
    id, name: "Save", createdAt: "", updatedAt: "", leagueSlug: "l", leagueName: "L",
    clubId: "c", clubName: "C", clubColors: ["#000", "#fff"], currentDate,
  }) as unknown as SaveMeta;

describe("getStarPlayerIds", () => {
  test("returns null when the save does not exist", async () => {
    const metaSpy = spyOn(saveService, "getMeta").mockResolvedValue(null);
    try {
      expect(await getStarPlayerIds("missing-save")).toBeNull();
    } finally {
      metaSpy.mockRestore();
    }
  });

  test("returns the top ids from the save's squads", async () => {
    const squad: Squad = { id: "s1", name: "Test FC", colors: ["#000", "#fff"], money: 0, players: [player("weak", 4), player("star", 9)] };
    const metaSpy = spyOn(saveService, "getMeta").mockResolvedValue(meta("save-a", "2026-01-01"));
    const squadsSpy = spyOn(saveService, "getAllSquads").mockResolvedValue([squad]);
    try {
      const ids = await getStarPlayerIds("save-a");
      expect(ids).toEqual(["star", "weak"]);
    } finally {
      metaSpy.mockRestore();
      squadsSpy.mockRestore();
    }
  });

  test("concurrent calls for the same save+key share a single getAllSquads scan", async () => {
    const squad: Squad = { id: "s1", name: "Test FC", colors: ["#000", "#fff"], money: 0, players: [] };
    const metaSpy = spyOn(saveService, "getMeta").mockResolvedValue(meta("save-b", "2026-01-01"));
    let resolveSquads!: (v: Squad[]) => void;
    const squadsPromise = new Promise<Squad[]>((res) => { resolveSquads = res; });
    const squadsSpy = spyOn(saveService, "getAllSquads").mockReturnValue(squadsPromise);

    try {
      const p1 = getStarPlayerIds("save-b");
      const p2 = getStarPlayerIds("save-b");
      await Promise.resolve();
      await Promise.resolve();
      resolveSquads([squad]);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(squadsSpy).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
    } finally {
      metaSpy.mockRestore();
      squadsSpy.mockRestore();
    }
  });
});
