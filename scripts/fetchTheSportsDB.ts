/**
 * Face pilot (TheSportsDB): finds photos for the priority players that have no Commons label yet.
 *
 *   bun scripts/fetchTheSportsDB.ts [--limit N] [--no-download]
 *
 * The free key ("123") caps team rosters at 10 players, so this searches player by player
 * (`searchplayers.php?p=<name>`), sequentially with a pause. A result is kept when it is a soccer
 * player whose name matches ours (full key, initial + surname, or all its tokens inside our full
 * name) and whose birth year fits our age (2026 season, -2..+1), and it is the only such result;
 * a TheSportsDB player matched to two of ours is dropped.
 *
 * Writes data_process/thesportsdb/photoMeta.json (ids, names, birth date, image URL — no images,
 * committable) and downloads the cutout (else render, else thumb) to
 * data_process/thesportsdb/photos/<ourId>.<ext> (gitignored). API answers are cached in
 * data_process/thesportsdb/cache/ (gitignored). Photos are only for labelling at home, never published.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { playerKey } from "@/../scripts/espn/normalize";
import { idsInFile, priorityPlayers, type PriorityPlayer } from "@/../scripts/faces/priority";
import { curlFile, curlJson, sleep } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process/thesportsdb");
const CACHE = join(DIR, "cache");
const PHOTOS = join(DIR, "photos");
const API = "https://www.thesportsdb.com/api/v1/json/123";
const SEASON_YEAR = 2026;
const PAUSE_MS = 2100;
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
mkdirSync(CACHE, { recursive: true });

interface TsdbPlayer { idPlayer: string; strPlayer: string; strTeam?: string; dateBorn?: string; strNationality?: string; strSport?: string; strCutout?: string; strRender?: string; strThumb?: string }

const toks = (s: string | undefined) => (s ? playerKey(s).split(" ").filter((t) => t.length > 0) : []);

/** 2 = same full key, 1 = initial+surname of an abbreviated name, or all its tokens in our full name. */
function nameScore(p: PriorityPlayer, t: TsdbPlayer): number {
  const theirs = toks(t.strPlayer);
  if (theirs.length === 0) return 0;
  const key = theirs.join(" ");
  if ([toks(p.name).join(" "), toks(p.fullName).join(" ")].filter(Boolean).includes(key)) return 2;
  if (p.name.includes(".") && theirs.length >= 2 && toks(p.name).join(" ") === `${theirs[0]![0]} ${theirs[theirs.length - 1]}`) return 1;
  const ft = new Set(toks(p.fullName));
  if (theirs.length >= 2 && theirs.every((x) => ft.has(x))) return 1;
  return 0;
}

/** Queries to try, most specific first. */
function queries(p: PriorityPlayer): string[] {
  const q: string[] = [];
  const full = toks(p.fullName);
  const short = p.name.replace(/\./g, "").trim();
  if (!p.name.includes(".")) q.push(p.name);
  if (p.fullName && full.length >= 2) {
    const first = p.fullName.split(/\s+/)[0]!;
    const last = p.name.split(/\s+/).pop()!;
    q.push(`${first} ${last}`);
  }
  if (p.fullName) q.push(p.fullName);
  if (q.length === 0) q.push(short);
  return [...new Set(q)];
}

async function search(q: string): Promise<TsdbPlayer[]> {
  const file = join(CACHE, `q_${playerKey(q).replace(/ /g, "_").slice(0, 100)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  await sleep(PAUSE_MS);
  const r = await curlJson(`${API}/searchplayers.php?p=${encodeURIComponent(q)}`);
  const list: TsdbPlayer[] = r.player ?? [];
  writeFileSync(file, JSON.stringify(list));
  return list;
}

const wdLabelled = new Set(idsInFile(join(ROOT, "data_process/wikidata/faceTraitLabels.txt")));
const queue = priorityPlayers().filter((p) => !wdLabelled.has(p.id)).slice(0, LIMIT);
console.log(`${queue.length} priority players without a Commons label`);

const found = new Map<string, { p: PriorityPlayer; t: TsdbPlayer }>();
let n = 0;
for (const p of queue) {
  const expected = SEASON_YEAR - p.age;
  for (const q of queries(p)) {
    const cands = (await search(q))
      .filter((t) => (t.strSport ?? "Soccer") === "Soccer")
      .filter((t) => { const y = Number(t.dateBorn?.slice(0, 4)); return y >= expected - 2 && y <= expected + 1; })
      .map((t) => ({ t, s: nameScore(p, t) }))
      .filter((c) => c.s > 0);
    if (cands.length === 0) continue;
    const top = Math.max(...cands.map((c) => c.s));
    const best = cands.filter((c) => c.s === top);
    if (best.length === 1) found.set(p.id, { p, t: best[0]!.t });
    break;
  }
  if (++n % 100 === 0) console.log(`${n}/${queue.length}, ${found.size} matched`);
}
// A TheSportsDB player matched to two of ours is ambiguous: both lose it.
const owners = new Map<string, string[]>();
for (const [pid, m] of found) owners.set(m.t.idPlayer, [...(owners.get(m.t.idPlayer) ?? []), pid]);
for (const pids of owners.values()) if (pids.length > 1) for (const pid of pids) found.delete(pid);

const meta: Record<string, { idPlayer: string; name: string; team: string; born: string; nationality: string; image: string }> = {};
for (const [pid, { t }] of found) {
  const image = t.strCutout || t.strRender || t.strThumb;
  if (!image) continue;
  meta[pid] = { idPlayer: t.idPlayer, name: t.strPlayer, team: t.strTeam ?? "", born: t.dateBorn ?? "", nationality: t.strNationality ?? "", image };
}
writeFileSync(join(DIR, "photoMeta.json"), JSON.stringify(Object.fromEntries(Object.entries(meta).sort()), null, 1) + "\n");
const byLeague = new Map<string, [number, number, number]>();
for (const p of queue) {
  const v = byLeague.get(p.league) ?? [0, 0, 0];
  v[0]++; if (found.has(p.id)) v[1]++; if (meta[p.id]) v[2]++;
  byLeague.set(p.league, v);
}
console.log("\nCoverage (queued / matched / with image):");
for (const [l, v] of [...byLeague].sort((a, b) => b[1][0] - a[1][0])) console.log(`  ${l}: ${v.join(" / ")}`);

if (!process.argv.includes("--no-download")) {
  mkdirSync(PHOTOS, { recursive: true });
  let ok = 0, fail = 0;
  for (const [pid, m] of Object.entries(meta)) {
    const ext = /\.jpe?g$/i.test(m.image) ? "jpg" : "png";
    const file = join(PHOTOS, `${pid}.${ext}`);
    if (existsSync(file)) { ok++; continue; }
    // "/preview" is TheSportsDB's small (~250 px) size: enough to label, lighter on their server.
    if (await curlFile(`${m.image}/preview`, file) || await curlFile(m.image, file)) ok++; else fail++;
    await sleep(500);
  }
  console.log(`photos: ${ok} present, ${fail} failed → data_process/thesportsdb/photos/`);
}
