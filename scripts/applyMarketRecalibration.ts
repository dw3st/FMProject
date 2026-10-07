/**
 * Applies the market recalibration (`data_process/transfermarkt/derived.json`, built by
 * `bun scripts/buildMarketDerived.ts`) to the world in `src/example_data/squads`: natural position (and line),
 * overall, birth date, height and a missing nationality. Runs after `bun scripts/importEspn.ts` and before
 * `bun scripts/applyPlayerCorrections.ts` (`.claude/rules/data/espn-import.md` → "Regenerar"; the manual
 * corrections win). Idempotent; writes only the squad files that change, in their original format.
 *
 *   bun scripts/applyMarketRecalibration.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatLike, type AttrWeights } from "@/../scripts/curated/corrections";
import { applyDerived } from "@/../scripts/transfermarkt/apply";
import type { DerivedEntry } from "@/../scripts/transfermarkt/derive";
import ROLES_JSON from "@/Data/roles.json";
import type { RosterPlayer } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { lineMedians, recalibratedOverall } from "@/../scripts/espn/estimate";
import { namePools } from "@/../scripts/espn/apply";
import { normalizeNationality } from "@/../scripts/espn/normalize";
import { balanceSquadLines, squadLineIssues } from "@/../scripts/transfermarkt/balance";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const DERIVED = join(ROOT, "data_process", "transfermarkt", "derived.json");

// The overall math reads src/Data/roles.json (Player.ts); same precondition as the importers.
{
  const runtimeRoles = join(ROOT, "src", "Data", "roles.json");
  if (!existsSync(runtimeRoles) || readFileSync(runtimeRoles, "utf-8") !== readFileSync(join(DATA, "roles.json"), "utf-8"))
    throw new Error("src/Data/roles.json is out of sync — run cp src/example_data/roles.json src/Data/roles.json first");
}

interface SquadFile { path: string; text: string; squad: { id: string; players: RosterPlayer[] } & Record<string, unknown> }

function listSquadFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listSquadFiles(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

const derived = JSON.parse(readFileSync(DERIVED, "utf-8")) as { players: Record<string, DerivedEntry> };
const entries = derived.players ?? {};
const seen = new Set<string>();
const byLeague = new Map<string, { players: number; changed: number }>();

// 1. The market data per player (line, overall, birth date, height, nationality).
const files: (SquadFile & { league: string; dirty: boolean })[] = [];
for (const path of listSquadFiles(SQUADS)) {
  const text = readFileSync(path, "utf-8");
  const squad = JSON.parse(text) as SquadFile["squad"];
  const league = relative(SQUADS, path).replace(/\\/g, "/").split("/")[0]!;
  const row = byLeague.get(league) ?? { players: 0, changed: 0 };
  byLeague.set(league, row);
  let dirty = false;
  squad.players = (squad.players ?? []).map((p) => {
    row.players++;
    const entry = entries[p.id];
    if (!entry) return p;
    if (seen.has(p.id)) throw new Error(`applyMarketRecalibration: player ${p.id} appears in more than one squad`);
    seen.add(p.id);
    const next = applyDerived(p, entry, ROLES_JSON as AttrWeights);
    if (next !== p) { row.changed++; dirty = true; }
    return next;
  });
  files.push({ path, text, squad, league, dirty });
}

// 2. A line change can leave a squad below a line minimum (importEspn validated it before): the importer's filler
//    youth complete it and its cut brings it back to MAX_SQUAD, ranked by the note the chain ends with
//    (market target, the manual correction winning) — `scripts/transfermarkt/balance.ts`.
const curated = JSON.parse(readFileSync(join(ROOT, "data_process", "curated", "playerCorrections.json"), "utf-8")) as Record<string, { overall?: number }>;
const cutTargets: Record<string, { targetOverall?: number }> = { ...entries };
for (const [id, c] of Object.entries(curated)) if (c.overall !== undefined) cutTargets[id] = { targetOverall: c.overall };
const overall = (p: RosterPlayer) => Player.computeOverallAvg(p);
const rank = recalibratedOverall(cutTargets, overall);
const allPlayers = files.flatMap((f) => f.squad.players);
const worldBase = lineMedians(allPlayers);
const leagueBase = new Map<string, ReturnType<typeof lineMedians>>();
for (const f of files) if (!leagueBase.has(f.league)) leagueBase.set(f.league, lineMedians(files.filter((g) => g.league === f.league).flatMap((g) => g.squad.players)));
const pools = namePools(allPlayers);
const worldNationalities = new Set(allPlayers.map((p) => p.nationality).filter((n): n is string => !!n));
const leagueCountry = new Map((JSON.parse(readFileSync(join(DATA, "leagueData.json"), "utf-8")) as { slug: string; country: string }[]).map((l) => [l.slug, l.country]));
let filled = 0, youthAdded = 0, cutClubs = 0, cutPlayers = 0;
for (const f of files) {
  const raw = leagueCountry.get(f.league) ?? "";
  const country = normalizeNationality(raw, worldNationalities) ?? raw;
  const r = balanceSquadLines({
    squadId: String(f.squad.id), players: f.squad.players, pool: pools.get(country) ?? { first: [], last: [] }, country,
    leagueBase: leagueBase.get(f.league) ?? {}, worldBase, overall, rank,
  });
  if (r.players === f.squad.players) continue;
  if (r.added.length) { filled++; youthAdded += r.added.length; }
  if (r.cut.length) { cutClubs++; cutPlayers += r.cut.length; }
  f.squad.players = r.players;
  f.dirty = true;
}

// 3. Never again in silence: every squad within the line minimums and 18..30 players.
const bad = files.map((f) => ({ f, issues: squadLineIssues(f.squad.players) })).filter((x) => x.issues.length);
if (bad.length)
  throw new Error(`applyMarketRecalibration: ${bad.length} squad(s) outside the line limits: ${bad.slice(0, 5).map((x) => `${x.f.league}/${x.f.squad.id} (${x.issues.join(", ")})`).join("; ")}`);

let filesWritten = 0;
for (const f of files) if (f.dirty) { writeFileSync(f.path, formatLike(f.text, f.squad)); filesWritten++; }

const missing = Object.keys(entries).filter((id) => !seen.has(id));
console.log("Recalibração pelo valor de mercado: jogadores alterados por liga");
let total = 0;
for (const [league, r] of [...byLeague].sort(([a], [b]) => a.localeCompare(b))) {
  if (!r.changed) continue;
  total += r.changed;
  console.log(`  ${league.padEnd(42)} ${String(r.changed).padStart(5)} / ${r.players}`);
}
console.log(`${total} jogador(es) alterado(s), ${filesWritten} arquivo(s) de elenco gravado(s).`);
console.log(`Linhas: ${filled} elenco(s) completado(s) com ${youthAdded} jovem(ns); ${cutClubs} elenco(s) cortado(s) em ${cutPlayers} jogador(es); todos dentro dos mínimos por linha e de 18..30.`);
if (missing.length)
  console.log(`${missing.length} id(s) do derived.json fora do mundo (cortados no MAX_SQUAD do importEspn, ou mundo regenerado): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", …" : ""}`);
