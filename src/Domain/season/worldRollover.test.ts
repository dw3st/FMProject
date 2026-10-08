import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planCountryRollover } from "@/Domain/season/countryRollover";
import type { Pyramids } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";
import leagueData from "@/example_data/leagueData.json";
import pyramidsJson from "@/example_data/pyramids.json";

/**
 * The committed world (src/example_data) must let every country's season rollover run: every
 * league a pyramid lists has a squad folder, every club a table/plan can name has a squad file
 * there, and no club id lives in two folders. Membership in a save comes only from these folders
 * (`.claude/rules/game/membership.md`), so a plan that names a club with no file would make
 * `moveSquad` fail mid-day.
 */
const squadsDir = fileURLToPath(new URL("../../example_data/squads", import.meta.url));
const leagues = leagueData as Array<{ slug: string; standings: Array<{ squadId: string; name: string }> }>;
const pyramids = pyramidsJson as unknown as Pyramids;

const folders = new Map<string, Set<string>>();
for (const slug of readdirSync(squadsDir))
  folders.set(slug, new Set(readdirSync(`${squadsDir}/${slug}`).map((f) => f.replace(/\.json$/, ""))));

describe("committed world — rollover membership", () => {
  test("no club id lives in two league folders", () => {
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const [slug, ids] of folders)
      for (const id of ids) {
        if (seen.has(id)) dups.push(`${id}: ${seen.get(id)} + ${slug}`);
        seen.set(id, slug);
      }
    expect(dups).toEqual([]);
  });

  test("leagueData standings match the squad folders exactly", () => {
    const problems: string[] = [];
    for (const l of leagues) {
      const files = folders.get(l.slug);
      if (!files) { problems.push(`${l.slug}: no squad folder`); continue; }
      const table = new Set(l.standings.map((s) => String(s.squadId)));
      for (const id of table) if (!files.has(id)) problems.push(`${l.slug}: standings ${id} has no squad file`);
      for (const id of files) if (!table.has(id)) problems.push(`${l.slug}: squad ${id} missing from standings`);
    }
    expect(problems).toEqual([]);
  });

  test("every pyramid country plans its promotions and relegations with clubs that exist", () => {
    const problems: string[] = [];
    let moves = 0;
    for (const pyramid of Object.values(pyramids)) {
      const slugs = pyramid.levels.flatMap((lv) => lv.groups.map((g) => g.leagueSlug));
      const standings: Record<string, StandingRow[]> = {};
      for (const slug of slugs) {
        const ids = [...(folders.get(slug) ?? [])].sort();
        if (ids.length === 0) problems.push(`${pyramid.country}: ${slug} has no clubs`);
        standings[slug] = ids.map((squadId, i) => ({
          squadId, name: squadId, colors: ["#000000", "#ffffff"], mp: 1, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: ids.length - i, form: [],
        }) as StandingRow);
      }
      const plan = planCountryRollover({ country: pyramid.country, pyramid, leagues: slugs, partial: false }, standings, undefined);
      for (const m of plan.moves) {
        moves++;
        if (!folders.get(m.from)?.has(m.squadId)) problems.push(`${pyramid.country}: move of ${m.squadId} from ${m.from}, no squad file there`);
        if (!folders.has(m.to)) problems.push(`${pyramid.country}: move of ${m.squadId} to ${m.to}, no such folder`);
      }
    }
    expect(problems).toEqual([]);
    expect(moves).toBeGreaterThan(0);
  });
});
