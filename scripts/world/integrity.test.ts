import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, afterEach } from "bun:test";
import { checkWorldIntegrity, type IntegrityLeague } from "@/../scripts/world/integrity";
import type { SquadFile } from "@/../scripts/world/types";

const COUNTRIES = { Testland: { flag: "🏳️", continent: "Europe" } };

function baseSquad(id: string, overrides: Partial<SquadFile> = {}): SquadFile {
  return {
    id, slug: id, name: "Test FC", colors: ["#111111", "#ffffff"], country: "Testland",
    venue: { name: "Test Park", city: "Testville", capacity: 10000, surface: "grass" },
    coach: { id: 1, name: "Test Coach" },
    players: [
      { id: `${id}_p0`, name: "Player Zero", age: 22, squadId: id, preferredFoot: "right", positions: ["GK"], stats: {} as never, profile: { archetype: "x", summary: "x" } },
    ],
    ...overrides,
  };
}

/** Writes a minimal one-league, one-squad world under a fresh temp squadsDir; returns the dir + a ready-to-call checker. */
function setupWorld(squad: SquadFile) {
  const dir = mkdtempSync(join(tmpdir(), "integrity-test-"));
  const leagueSlug = "test_league";
  mkdirSync(join(dir, leagueSlug), { recursive: true });
  writeFileSync(join(dir, leagueSlug, `${squad.id}.json`), JSON.stringify(squad));
  const leagueData: IntegrityLeague[] = [{ slug: leagueSlug, country: "Testland", standings: [{ squadId: squad.id, name: squad.name }] }];
  const run = () =>
    checkWorldIntegrity({
      leagueData, schedules: [{ slug: leagueSlug }], countries: COUNTRIES, pyramids: {}, squadsDir: dir,
      mayHaveHandZones: () => true,
    });
  return { dir, run };
}

describe("checkWorldIntegrity — HTML entities", () => {
  const cleanupDirs: string[] = [];
  afterEach(() => { for (const d of cleanupDirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  test("passes on a clean world", () => {
    const { dir, run } = setupWorld(baseSquad("clean1"));
    cleanupDirs.push(dir);
    expect(() => run()).not.toThrow();
  });

  test("rejects an undecoded entity in a player name", () => {
    const { dir, run } = setupWorld(baseSquad("bad1", {
      players: [{ id: "bad1_p0", name: "N. O&apos;Reilly", age: 22, squadId: "bad1", preferredFoot: "right", positions: ["GK"], stats: {} as never, profile: { archetype: "x", summary: "x" } }],
    }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });

  test("rejects an undecoded entity in a player fullName", () => {
    const { dir, run } = setupWorld(baseSquad("bad2", {
      players: [{ id: "bad2_p0", name: "N. Reilly", fullName: "Nico O&apos;Reilly", age: 22, squadId: "bad2", preferredFoot: "right", positions: ["GK"], stats: {} as never, profile: { archetype: "x", summary: "x" } }],
    }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });

  test("rejects an undecoded entity in a club name", () => {
    const { dir, run } = setupWorld(baseSquad("bad3", { name: "Sant&apos;Anna FC" }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });

  test("rejects an undecoded entity in a coach name", () => {
    const { dir, run } = setupWorld(baseSquad("bad4", { coach: { id: 1, name: "D&apos;Angelo" } }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });

  test("rejects an undecoded entity in venue name/city", () => {
    const { dir, run } = setupWorld(baseSquad("bad5", { venue: { name: "St&#39;s Park", city: "Villeneuve d&apos;Ascq", capacity: 10000, surface: "grass" } }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });

  test("rejects an undecoded entity in a leagueData standings name", () => {
    const squad = baseSquad("bad6");
    const dir = mkdtempSync(join(tmpdir(), "integrity-test-"));
    cleanupDirs.push(dir);
    const leagueSlug = "test_league";
    mkdirSync(join(dir, leagueSlug), { recursive: true });
    writeFileSync(join(dir, leagueSlug, `${squad.id}.json`), JSON.stringify(squad));
    const leagueData: IntegrityLeague[] = [{ slug: leagueSlug, country: "Testland", standings: [{ squadId: squad.id, name: "Sant&apos;Anna FC" }] }];
    expect(() =>
      checkWorldIntegrity({
        leagueData, schedules: [{ slug: leagueSlug }], countries: COUNTRIES, pyramids: {}, squadsDir: dir,
        mayHaveHandZones: () => true,
      }),
    ).toThrow(/undecoded HTML entity/);
  });

  test("numeric entity forms (&#39; and &#x27;) are also caught", () => {
    const { dir, run } = setupWorld(baseSquad("bad7", { name: "O&#39;Brien FC" }));
    cleanupDirs.push(dir);
    expect(() => run()).toThrow(/undecoded HTML entity/);
  });
});
