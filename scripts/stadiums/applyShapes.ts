/**
 * Adds `shape` to `src/example_data/stadiums.json` from the cached OpenStreetMap shapes (no network): the same outline
 * choice and the same "outline drawn tight around the pitch" rule as `fetchStadiums.ts`, which writes the field on a
 * full regeneration. A `shape` in `data_process/curated/stadiumCorrections.json` wins.
 *   bun scripts/stadiums/applyShapes.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { heightFromDepth, minAreaRect, outlineFill, polygonArea, standDepths, toLocal, type PitchRect, type Pt } from "@/../scripts/stadiums/geometry";
import { shapeFromFill } from "@/Domain/matchday/stadiumShape";
import type { RealStadium } from "@/Domain/matchday/stadiumSun";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FILE = join(ROOT, "src/example_data/stadiums.json");
const CACHE = join(ROOT, "data_process/stadiums/cache");
const CORRECTIONS = join(ROOT, "data_process/curated/stadiumCorrections.json");

const stadiums: Record<string, RealStadium> = JSON.parse(readFileSync(FILE, "utf8"));
const corrections: Record<string, { shape?: RealStadium["shape"] }> = existsSync(CORRECTIONS) ? JSON.parse(readFileSync(CORRECTIONS, "utf8")) : {};

const centroid = (p: Pt[]): Pt => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
const d2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const counts: Record<string, number> = {};
for (const [squadId, st] of Object.entries(stadiums)) {
  delete st.shape;
  const fixed = corrections[squadId]?.shape;
  const file = [join(CACHE, `${st.qid}_fix.json`), join(CACHE, `${st.qid}.json`)].find(existsSync);
  let shape = fixed;
  if (!shape && file) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const toL = toLocal(st.lat, st.lon);
    const polys = (e: any): Pt[][] => e.type === "way"
      ? [e.geometry.map((g: any) => toL(g.lat, g.lon))]
      : (e.members ?? []).filter((m: any) => m.role === "outer" && m.geometry).map((m: any) => m.geometry.map((g: any) => toL(g.lat, g.lon)));
    const outline: Pt[][] = data.elements.filter((e: any) => e.tags?.leisure === "stadium").map(polys)
      .sort((a: Pt[][], b: Pt[][]) => d2(centroid(a.flat()), { x: 0, y: 0 }) - d2(centroid(b.flat()), { x: 0, y: 0 }))[0] ?? [];
    if (outline.length) {
      const ref = centroid(outline.flat());
      const pitches = data.elements
        .filter((e: any) => e.type === "way" && e.tags?.leisure === "pitch" && /soccer|football/.test(e.tags?.sport ?? "soccer"))
        .map((e: any) => polys(e)[0]!)
        .filter((p: Pt[]) => { const a = polygonArea(p); return a > 4800 && a < 12500; })
        .sort((a: Pt[], b: Pt[]) => d2(centroid(a), ref) - d2(centroid(b), ref));
      let pitch: PitchRect;
      if (pitches.length) pitch = minAreaRect(pitches[0]!);
      else { const r = minAreaRect(outline.flat()); pitch = { center: r.center, axis: r.axis, length: 105, width: 68 }; }
      const depths = standDepths(pitch, outline);
      const tight = Math.max(...(["top", "bottom", "low", "high"] as const).map((k) => heightFromDepth(depths[k]))) < 10;
      const fill = tight ? null : outlineFill(outline);
      if (fill !== null) shape = shapeFromFill(fill);
    }
  }
  if (shape) st.shape = shape;
  counts[shape ?? "none"] = (counts[shape ?? "none"] ?? 0) + 1;
}
writeFileSync(FILE, JSON.stringify(stadiums, null, 1) + "\n");
console.log(counts);
