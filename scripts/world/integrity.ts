import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pyramidGroupOf } from "@/../scripts/openfootball/pyramid";
import type { LeagueEntry, SquadFile } from "@/../scripts/world/types";
import type { Pyramids } from "@/types/pyramidTypes";

export interface IntegrityInput {
  leagueData: LeagueEntry[];
  schedules: Array<{ slug: string }>;
  countries: Record<string, { flag?: unknown; continent?: unknown }>;
  pyramids: Pyramids;
  squadsDir: string;
  /** True for a league that may keep hand-written prom/rel zones while its country has no pyramid. */
  mayHaveHandZones: (l: LeagueEntry) => boolean;
}

/** Throws on the first inconsistency. Returns world totals. */
export function checkWorldIntegrity(w: IntegrityInput): { squads: number; players: number } {
  const squadIds = new Set<string>();
  const playerIds = new Set<string>();
  let players = 0;
  for (const l of w.leagueData) {
    for (const st of l.standings) {
      if (!existsSync(join(w.squadsDir, l.slug, `${st.squadId}.json`)))
        throw new Error(`integrity: ${l.slug} standings squadId ${st.squadId} has no file`);
    }
    for (const f of readdirSync(join(w.squadsDir, l.slug)).sort()) {
      const s = JSON.parse(readFileSync(join(w.squadsDir, l.slug, f), "utf-8")) as SquadFile;
      if (squadIds.has(s.id)) throw new Error(`integrity: duplicate squad id ${s.id}`);
      squadIds.add(s.id);
      for (const p of s.players) {
        if (playerIds.has(p.id)) throw new Error(`integrity: duplicate player id ${p.id} (${l.slug}/${s.id})`);
        playerIds.add(p.id);
      }
      players += s.players.length;
    }
    if (!w.countries[l.country]) throw new Error(`integrity: league ${l.slug} country ${l.country} missing from countries.json`);
    if (!w.schedules.some((s) => s.slug === l.slug)) throw new Error(`integrity: league ${l.slug} has no schedule in leagueSchedules.json`);

    const clubs = l.standings.length;
    const zones = (l.zones ?? []) as Array<{ id: string; from?: number; to?: number; fromEnd?: number }>;
    let lastTop = 0;
    let firstBottom = clubs + 1;
    for (const z of zones) {
      if (z.fromEnd !== undefined) {
        if (!Number.isInteger(z.fromEnd) || z.fromEnd < 1 || z.fromEnd > clubs)
          throw new Error(`integrity: ${l.slug} zone ${z.id} fromEnd ${z.fromEnd} outside 1..${clubs}`);
        firstBottom = Math.min(firstBottom, clubs - z.fromEnd + 1);
      } else {
        const { from, to } = z;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 1 || to! < from! || to! > clubs)
          throw new Error(`integrity: ${l.slug} zone ${z.id} range ${from}..${to} outside 1..${clubs}`);
        lastTop = Math.max(lastTop, to!);
      }
    }
    if (lastTop >= firstBottom)
      throw new Error(`integrity: ${l.slug} top zones reach ${lastTop} but bottom zones start at ${firstBottom} (${clubs} clubs)`);

    const g = pyramidGroupOf(w.pyramids, l.slug);
    const prom = zones.filter((z) => z.id === "prom");
    const rel = zones.filter((z) => z.id === "rel");
    if (g) {
      const promOk = g.promote > 0 ? prom.length === 1 && prom[0]!.from === 1 && prom[0]!.to === g.promote : prom.length === 0;
      const relOk = g.relegate > 0 ? rel.length === 1 && rel[0]!.fromEnd === g.relegate : rel.length === 0;
      if (!promOk || !relOk) throw new Error(`integrity: ${l.slug} prom/rel zones differ from pyramid (${g.promote}/${g.relegate})`);
    } else if (!w.mayHaveHandZones(l) && (prom.length || rel.length)) {
      throw new Error(`integrity: ${l.slug} has prom/rel zones but its country has no pyramid`);
    }
  }
  for (const p of Object.values(w.pyramids)) {
    for (let i = 0; i + 1 < p.levels.length; i++) {
      const down = p.levels[i]!.groups.reduce((s, g) => s + g.relegate, 0);
      const up = p.levels[i + 1]!.groups.reduce((s, g) => s + g.promote, 0);
      if (down !== up) throw new Error(`integrity: ${p.country} tier ${p.levels[i]!.tier} relegates ${down} but tier ${p.levels[i + 1]!.tier} promotes ${up}`);
      for (const g of p.levels[i + 1]!.groups)
        if (!w.leagueData.some((l) => l.slug === g.leagueSlug)) throw new Error(`integrity: pyramid group ${g.leagueSlug} has no league`);
    }
  }
  for (const [name, c] of Object.entries(w.countries)) {
    if (typeof c.flag !== "string" || c.flag === "") throw new Error(`integrity: country ${name} has no flag`);
    if (typeof c.continent !== "string" || c.continent === "") throw new Error(`integrity: country ${name} has no continent`);
  }
  return { squads: squadIds.size, players };
}
