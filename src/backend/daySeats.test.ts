import { describe, expect, test } from "bun:test";
import { buildSquadIndex } from "@/backend/squadIndex";
import { humanClubSet, loadDaySeats, seatByClub } from "@/backend/daySeats";
import type { SaveService, SaveMeta } from "@/backend/SaveService";
import type { SeatState } from "@/types/seatTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string) => ({ id, name: `Club ${id}`, players: [] }) as unknown as Squad;
const index = buildSquadIndex([
  { leagueSlug: "pl", clubSlug: "1", squad: squad("1") },
  { leagueSlug: "pl", clubSlug: "2", squad: squad("2") },
  { leagueSlug: "ll", clubSlug: "3", squad: squad("3") },
]);
const seat = (clubId: string, extra: Partial<SeatState> = {}): SeatState => ({
  clubId, clubName: `Club ${clubId}`, clubColors: ["#000", "#fff"], leagueSlug: "pl", leagueName: "PL", ...extra,
});
const world: SaveMeta = {
  id: "w", name: "w", createdAt: "", updatedAt: "", mode: "multi", seats: ["a", "b", "c", "gone"], currentDate: "2027-03-01",
};
const seats: Record<string, SeatState> = {
  a: seat("1", { board: { board: 70, fans: 50 } as SeatState["board"] }),
  b: seat("3", { leagueSlug: "ll" }),
  c: seat("2", { unemployed: { since: "2027-01-01" } as SeatState["unemployed"] }),
};
const service = {
  getSeat: async (_s: string, id: string) => seats[id] ?? null,
  getTactics: async (_s: string, id: string) => (id === "a" ? { formation: "4-4-2", tactical_style: "balanced", lineup: [] } : null),
} as unknown as SaveService;

describe("day seats", () => {
  test("one DaySeat per seat file, with its club, tactics and board; an unemployed seat has no club", async () => {
    const day = await loadDaySeats(service, "w", world, index);
    expect(day.map((d) => d.seatId)).toEqual(["a", "b", "c"]);
    expect(day[0]!.clubId).toBe("1");
    expect(day[0]!.entry?.leagueSlug).toBe("pl");
    expect(day[0]!.tactics?.formation).toBe("4-4-2");
    expect(day[0]!.board?.board).toBe(70);
    expect(day[0]!.meta.currentDate).toBe("2027-03-01");
    expect(day[0]!.meta.seatId).toBe("a");
    expect(day[2]!.clubId).toBeUndefined();
    expect([...humanClubSet(day)].sort()).toEqual(["1", "3"]);
    expect(seatByClub(day).get("3")?.seatId).toBe("b");
    expect(seatByClub(day).has("2")).toBe(false);
  });
});
