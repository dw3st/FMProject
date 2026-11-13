/**
 * Followers of every club of the world, recalibrated (tester report: Barcelona out of the ranking, Juventude 8th).
 *
 *   bun scripts/curated/buildFollowerCorrections.ts [--check]
 *
 * Known clubs take the real figure of `followersTable.ts`. Every other club keeps the number of the source data unless
 * it is out of line with the club's income (TV + commercial): the expected following is fitted on the known clubs
 * (log-log) and the old number is held between a fifth and twice that, and never above `UNKNOWN_CAP`.
 * Writes `data_process/curated/followerCorrections.json` (`squadId → { name, followers }`, only clubs that change) and
 * prints the new top 30. `--check` writes nothing.
 */
import { Glob } from "bun";
import { FOLLOWERS_M } from "./followersTable";

const UNKNOWN_CAP = 15_000_000;
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface Row { id: string; name: string; league: string; old: number; income: number }

const rows: Row[] = [];
for await (const f of new Glob("src/example_data/squads/*/*.json").scan(".")) {
  const s = await Bun.file(f).json();
  const league = f.split(/[\\/]/).at(-2)!;
  rows.push({ id: String(s.id), name: s.name, league, old: s.finances?.followers ?? 0, income: (s.finances?.broadcasting ?? 0) + (s.finances?.commercial ?? 0) });
}

const known = new Map<string, number>();
const missing: string[] = [];
for (const [league, name, millions] of FOLLOWERS_M) {
  const hits = rows.filter((r) => norm(r.name) === norm(name) && (!league || r.league === league));
  // The biggest club of that name (a reserve side or a namesake abroad is smaller).
  const hit = hits.sort((a, b) => b.income - a.income)[0];
  if (!hit) { missing.push(`${league || "*"} / ${name}`); continue; }
  known.set(hit.id, Math.round(millions * 1e6));
}
if (missing.length > 0) {
  console.error("No club for:\n  " + missing.join("\n  "));
  process.exit(1);
}

// log(followers) = a + b × log(income), least squares on the known clubs.
const pts = rows.filter((r) => known.has(r.id) && r.income > 0).map((r) => [Math.log(r.income), Math.log(known.get(r.id)!)] as const);
const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
const a = my - b * mx;
const expected = (income: number) => Math.exp(a + b * Math.log(Math.max(income, 100_000)));

const out: Record<string, { name: string; followers: number }> = {};
const next = new Map<string, number>();
for (const r of rows) {
  let v: number;
  if (known.has(r.id)) v = known.get(r.id)!;
  else {
    const e = expected(r.income);
    v = Math.round(Math.min(UNKNOWN_CAP, Math.max(e / 5, Math.min(e * 2, r.old || e))));
    v = Math.max(1000, v);
  }
  next.set(r.id, v);
  if (v !== r.old) out[r.id] = { name: r.name, followers: v };
}

const top = [...rows].sort((x, y) => next.get(y.id)! - next.get(x.id)!).slice(0, 30);
console.log(`fit: followers = e^${a.toFixed(2)} × income^${b.toFixed(2)} (${pts.length} known clubs)`);
console.log(`changed ${Object.keys(out).length} of ${rows.length} clubs (${known.size} from the table)`);
console.log(top.map((r, i) => `${String(i + 1).padStart(2)} ${r.name.padEnd(24)} ${(next.get(r.id)! / 1e6).toFixed(1).padStart(6)}M  (was ${(r.old / 1e6).toFixed(1)}M)`).join("\n"));
if (!process.argv.includes("--check")) {
  await Bun.write("data_process/curated/followerCorrections.json", JSON.stringify(out, null, 2) + "\n");
  console.log("written data_process/curated/followerCorrections.json");
}
