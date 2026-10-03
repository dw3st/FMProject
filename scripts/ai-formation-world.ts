/**
 * World distribution of the AI formation choice (Etapa 18, #59).
 *
 *   bun scripts/ai-formation-world.ts [--season 2026] [--league premier_league]
 *
 * Prints how many clubs pick each formation (whole world, or one league), how many have a
 * defensive alternative, and the share of league pairings in which the weaker side would switch to
 * it (`matchdayAiFormation`, every home/away pair of each league).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chooseAiFormation, matchdayAiFormation } from "@/Domain/formation/aiFormation";
import { FORMATION_IDS } from "@/Domain/matchFormations";
import { AI_FORMATION } from "@/Domain/formation/aiFormationConfig";
import type { AiFormationRecord, Squad } from "@/types/playerTypes";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const season = arg("--season", "2026");
const only = arg("--league", "");

const root = fileURLToPath(new URL("../src/Data/squads/", import.meta.url));
const leagues = new Map<string, { squad: Squad; rec: AiFormationRecord }[]>();
const t0 = performance.now();
for (const league of readdirSync(root)) {
  if (only && league !== only) continue;
  const list = readdirSync(root + league).filter((f) => f.endsWith(".json")).map((f) => {
    const squad = JSON.parse(readFileSync(`${root}${league}/${f}`, "utf8")) as Squad;
    return { squad, rec: chooseAiFormation(squad, season) };
  });
  leagues.set(league, list);
}
const all = [...leagues.values()].flat();
const ms = performance.now() - t0;

const count = new Map<string, number>();
for (const { rec } of all) count.set(rec.id, (count.get(rec.id) ?? 0) + 1);
let pairs = 0;
let switches = 0;
const switchTo = new Map<string, number>();
for (const list of leagues.values()) {
  for (const a of list) for (const b of list) {
    if (a === b) continue;
    pairs++;
    const f = matchdayAiFormation(a.rec, b.rec.level);
    if (f !== a.rec.id) { switches++; switchTo.set(f, (switchTo.get(f) ?? 0) + 1); }
  }
}

console.log(`${all.length} clubs, ${(ms / all.length).toFixed(1)} ms per club`);
console.log(`| Formação | clubes | % |`);
console.log(`|---|---|---|`);
for (const id of [...FORMATION_IDS].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0))) {
  const n = count.get(id) ?? 0;
  console.log(`| ${id} | ${n} | ${((100 * n) / all.length).toFixed(1)} |`);
}
// Expected engine goal change vs an all-4-3-3 world, approximating a match by its two mirrors.
let vol = 0;
let mixed = 0;
for (const list of leagues.values()) for (const a of list) for (const b of list) {
  if (a === b) continue;
  const fa = matchdayAiFormation(a.rec, b.rec.level);
  const fb = matchdayAiFormation(b.rec, a.rec.level);
  vol += ((AI_FORMATION.GOAL_VOLUME[fa] ?? 1) + (AI_FORMATION.GOAL_VOLUME[fb] ?? 1)) / 2 - 1;
  mixed++;
}
console.log(`expected engine goal volume vs all-4-3-3: +${((100 * vol) / Math.max(1, mixed)).toFixed(1)}%`);
console.log(`defensive alternative: ${all.filter((x) => x.rec.defensive).length} clubs`);
console.log(`underdog switch: ${switches}/${pairs} side-matches (${((100 * switches) / Math.max(1, pairs)).toFixed(1)}%)`, Object.fromEntries(switchTo));
