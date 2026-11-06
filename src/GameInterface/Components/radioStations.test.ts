import { describe, expect, test } from "bun:test";
import { nextStationIndex, RADIO_STATIONS, stationIndexOf } from "@/GameInterface/Components/radioStations";

describe("radio stations", () => {
  test("ids are unique and streams are https", () => {
    expect(new Set(RADIO_STATIONS.map((s) => s.id)).size).toBe(RADIO_STATIONS.length);
    for (const s of RADIO_STATIONS) expect(s.stream.startsWith("https://")).toBe(true);
  });
  test("saved id, unknown id and the cycle", () => {
    expect(stationIndexOf("ouroverde")).toBe(1);
    expect(stationIndexOf("nope")).toBe(0);
    expect(stationIndexOf(null)).toBe(0);
    expect(nextStationIndex(RADIO_STATIONS.length - 1)).toBe(0);
    expect(nextStationIndex(0)).toBe(1);
  });
});
