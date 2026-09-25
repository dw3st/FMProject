import type { EspnAthlete, EspnSnapshot, EspnTeam } from "@/../scripts/espn/types";
import type { World } from "@/../scripts/espn/apply";
import type { SquadFile } from "@/../scripts/world/types";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const st = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});
const ROLES = ["GK", "Defender", "Defender", "Midfielder", "Midfielder", "Forward"] as const;

function squad(id: string, name: string, level: number): SquadFile {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}_p${i}`, name: `${name} Player ${i}`, age: 20 + i, squadId: id, preferredFoot: "right",
    positions: [role], stats: st(level), profile: { archetype: "x", summary: "x" }, nationality: "England",
  }));
  return {
    id, slug: id, name, colors: ["#111111", "#ffffff"], country: "England",
    venue: { name: `${name} Park`, city: null, capacity: 20000 + level * 1000, surface: "grass" },
    coach: { id: 1, name: "Coach" },
    finances: { broadcasting: level * 1e6, commercial: level * 1e6, total: 2 * level * 1e6, budget: level * 1e6, followers: level * 1e5 },
    players,
  };
}

export function fixtureWorld(): World {
  const pl = [squad("33", "Manchester United", 6), squad("39", "Wolves", 5), squad("47", "Tottenham", 6)];
  const ch = [squad("of_cov", "Coventry City", 4), squad("of_hull", "Hull City", 4), squad("of_bir", "Birmingham City", 3)];
  const row = (s: SquadFile) => ({ squadId: s.id, slug: s.slug, name: s.name, colors: s.colors, country: "England" });
  return {
    leagues: [
      { slug: "premier_league", name: "Premier League", country: "England", iso2: "GB", season: "2024-25",
        zones: [{ id: "ucl", label: "Champions League", color: "blue", from: 1, to: 1 }, { id: "rel", label: "Relegation", color: "red", fromEnd: 1 }],
        standings: pl.map(row) },
      { slug: "of_championship", name: "Championship", country: "England", iso2: "GB", season: "2024-25",
        zones: [{ id: "prom", label: "Promotion", color: "green", from: 1, to: 1 }], standings: ch.map(row), source: "open-football" },
    ],
    squads: new Map([["premier_league", pl], ["of_championship", ch]]),
    schedules: [
      { slug: "premier_league", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6, 0], baseWeekOffset: 0 },
      { slug: "of_championship", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6, 0], baseWeekOffset: 1 },
    ],
    pyramids: { England: { country: "England", levels: [
      { tier: 1, groups: [{ leagueSlug: "premier_league", promote: 0, relegate: 1 }] },
      { tier: 2, groups: [{ leagueSlug: "of_championship", promote: 1, relegate: 0 }] },
    ] } },
  };
}

const ath = (id: string, name: string, age: number, position: EspnAthlete["position"]): EspnAthlete =>
  ({ id, displayName: name, fullName: name, age, position, citizenship: "England" });
const team = (id: string, name: string, athletes: EspnAthlete[]): EspnTeam =>
  ({ id, name, shortName: name, location: name, color: "aa0000", altColor: "ffffff", logoFile: `${id}.png`, coach: "New Coach", athletes });

// ── Reusable builders for ad-hoc fixtures (real-world edge case tests) ─────────────────────────

/** A minimal squad with one player per role in `roles` (default GK/DEF/DEF/MID/MID/FWD), named `"<name> Player <i>"`. */
export function buildSquad(id: string, name: string, level: number, opts: { country?: string; roles?: readonly string[] } = {}): SquadFile {
  const country = opts.country ?? "England";
  const roles = opts.roles ?? ROLES;
  const players: RosterPlayer[] = roles.map((role, i) => ({
    id: `${id}_p${i}`, name: `${name} Player ${i}`, age: 20 + i, squadId: id, preferredFoot: "right",
    positions: [role], stats: st(level), profile: { archetype: "x", summary: "x" }, nationality: country,
  }));
  return {
    id, slug: id, name, colors: ["#111111", "#ffffff"], country,
    venue: { name: `${name} Park`, city: null, capacity: 20000 + level * 1000, surface: "grass" },
    coach: { id: 1, name: "Coach" },
    finances: { broadcasting: level * 1e6, commercial: level * 1e6, total: 2 * level * 1e6, budget: level * 1e6, followers: level * 1e5 },
    players,
  };
}

/** A single roster player with an explicit name/age/role, bypassing `buildSquad`'s numbered naming (useful when tests need distinct, non-colliding normalized name keys). */
export function buildPlayer(id: string, name: string, age: number, role: string, squadId: string, level: number, country = "England"): RosterPlayer {
  return { id, name, age, squadId, preferredFoot: "right", positions: [role], stats: st(level), profile: { archetype: "x", summary: "x" }, nationality: country };
}

export function buildAthlete(id: string, name: string, age: number | null, position: EspnAthlete["position"], citizenship: string | null = "England"): EspnAthlete {
  return { id, displayName: name, fullName: name, age, position, citizenship };
}

export function buildTeam(
  id: string, name: string, athletes: EspnAthlete[],
  opts: Partial<Pick<EspnTeam, "shortName" | "location" | "color" | "altColor" | "logoFile" | "coach">> = {},
): EspnTeam {
  return {
    id, name, shortName: opts.shortName ?? name, location: opts.location ?? name,
    color: opts.color ?? "aa0000", altColor: opts.altColor ?? "ffffff",
    logoFile: opts.logoFile ?? `${id}.png`, coach: opts.coach ?? "New Coach", athletes,
  };
}

export function fixtureSnapshot(): EspnSnapshot {
  return {
    fetchedAt: "2026-09-25",
    leagues: [
      { slug: "premier_league", code: "eng.1", name: "Premier League", season: "2026-27", teams: [
        team("360", "Manchester United", [ath("a1", "Manchester United Player 0", 22, "G"), ath("a2", "Wolves Player 5", 27, "F"), ath("a3", "Brand New", 24, "M")]),
        team("367", "Tottenham Hotspur", [ath("a4", "Tottenham Player 1", 23, "D")]),
        team("370", "Coventry City", [ath("a5", "Coventry City Player 3", 25, "M")]),
      ] },
      { slug: "of_championship", code: "eng.2", name: "Championship", season: "2026-27", teams: [
        team("380", "Wolverhampton Wanderers", [ath("a6", "Wolves Player 0", 22, "G")]),
        team("306", "Hull City", [ath("a7", "Hull City Player 2", 23, "D")]),
        team("999", "Wrexham", [ath("a8", "Paul Mullin", 31, "F")]),
      ] },
    ],
  };
}
