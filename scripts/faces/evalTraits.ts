/**
 * Face pilot: accuracy of the photo heuristics against hand labels (data_process/espn/faceTraitLabels.txt:
 * athleteId skin(1-7) hairColor hairLength beard, labelled by looking at each headshot).
 *
 *   bun scripts/faces/evalTraits.ts [all|even|odd] [--v]
 */
import { readFileSync } from "node:fs";
import { decodePng } from "@/../scripts/faces/png";
import { measure, traitsOf, type TraitMetrics } from "@/../scripts/faces/traits";

const rows = readFileSync("data_process/espn/faceTraitLabels.txt", "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/));
const set = process.argv[2] ?? "all"; // all | even | odd
const data: { id: string; lab: { skin: number; hairColor: string; hairLength: string; beard: string }; m: TraitMetrics }[] = [];
rows.forEach(([id, skin, hc, hl, b], i) => {
  if (set === "even" && i % 2) return;
  if (set === "odd" && !(i % 2)) return;
  const m = measure(decodePng(readFileSync(`data_process/espn/headshots/${id}.png`)))!;
  data.push({ id: id!, lab: { skin: +skin!, hairColor: hc!, hairLength: hl!, beard: b! }, m });
});
let skc = 0, sk = 0, sk1 = 0, hc = 0, hcCoarse = 0, hl = 0, bd = 0, bdBin = 0;
const coarse = (c: string) => (c === "black" || c === "darkBrown" ? "dark" : c === "brown" ? "brown" : "light");
const conf: Record<string, Record<string, number>> = { hairColor: {}, hairLength: {}, beard: {} };
for (const d of data) {
  const t = traitsOf(d.m);
  const g = (v: number) => (v <= 3 ? 0 : v <= 5 ? 1 : 2);
  if (g(t.skin!) === g(d.lab.skin)) skc++;
  if (t.skin === d.lab.skin) sk++;
  if (Math.abs(t.skin! - d.lab.skin) <= 1) sk1++;
  if (t.hairColor === d.lab.hairColor) hc++;
  if (coarse(t.hairColor!) === coarse(d.lab.hairColor)) hcCoarse++;
  if (t.hairLength === d.lab.hairLength) hl++;
  if (t.beard === d.lab.beard) bd++;
  if ((t.beard === "none") === (d.lab.beard === "none")) bdBin++;
  for (const k of ["hairColor", "hairLength", "beard"] as const) {
    const key = `${d.lab[k]}→${t[k]}`;
    conf[k]![key] = (conf[k]![key] ?? 0) + 1;
  }
  if (process.argv.includes("--v")) console.log(d.id, JSON.stringify(d.lab), JSON.stringify(t),
    `L=${d.m.skinL.toFixed(0)} hL=${d.m.hairL.toFixed(0)} hair=${d.m.hair} cov=${d.m.hairCover.toFixed(2)} vol=${d.m.volume.toFixed(2)} side=${d.m.sideHair.toFixed(2)} ear=${d.m.earHair.toFixed(2)} bD=${d.m.beardDark.toFixed(2)} bR=${d.m.beardRatio.toFixed(2)}`);
}
const n = data.length, pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
console.log(`n=${n} skin exact ${pct(sk)} ±1 ${pct(sk1)} light/med/dark ${pct(skc)} | hairColor ${pct(hc)} (dark/brown/light ${pct(hcCoarse)}) | hairLength ${pct(hl)} | beard ${pct(bd)} (any/none ${pct(bdBin)})`);
for (const k of Object.keys(conf)) console.log(k, JSON.stringify(Object.entries(conf[k]!).sort((a, b) => b[1] - a[1])));
