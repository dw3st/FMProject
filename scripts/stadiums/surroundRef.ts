/**
 * Input of the painted surroundings (art, `data_process/assets/surround/`): for every real stadium its shape, where it is
 * and which way its pitch runs, and for each shape the stadium footprint the game draws, in yards from the pitch centre
 * (+x along the pitch, +y down), measured on the live match's reference canvas (`SURROUND_ART.REF_CANVAS`).
 *   bun scripts/stadiums/surroundRef.ts <out.json>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stadiumShapeOf, type StadiumShape } from "@/Domain/matchday/stadiumShape";
import type { RealStadium } from "@/Domain/matchday/stadiumSun";
import { SURROUND_ART } from "@/Domain/art/surroundArt";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { standFootprint } from "@/GraficsEngine/stadiumExtras";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: surroundRef.ts <out.json>");

const stadiums: Record<string, RealStadium> = JSON.parse(readFileSync(join(ROOT, "src/example_data/stadiums.json"), "utf8"));
// Capacity of each club's ground (blocks under 15 000).
const capacity = new Map<string, number>();
const squadsDir = join(ROOT, "src/example_data/squads");
for (const league of readdirSync(squadsDir)) {
  for (const f of readdirSync(join(squadsDir, league))) {
    const sq = JSON.parse(readFileSync(join(squadsDir, league, f), "utf8"));
    capacity.set(String(sq.id), sq.venue?.capacity ?? 0);
  }
}

const shapes: StadiumShape[] = ["oval", "rounded", "square", "blocks"];
const [cw, ch] = SURROUND_ART.REF_CANVAS;
const footprints: Record<string, number[][]> = {};
for (const shape of shapes) {
  const m = buildMetrics(cw, ch, { stadium: true, shape });
  const cx = m.marginX + m.width / 2, cy = m.marginY + m.height / 2;
  footprints[shape] = standFootprint(m.stand!).map((p) => p.map((v, i) => (i % 2 === 0 ? (v - cx) : (v - cy)) / m.scale));
}

// One entry per stadium (clubs that share a ground share the painting).
const seen = new Map<string, { id: string; qid: string; name: string; lat: number; lon: number; axis: number; shape: StadiumShape }>();
for (const [squadId, st] of Object.entries(stadiums)) {
  if (seen.has(st.id)) continue;
  const shape = stadiumShapeOf({ id: st.id, capacity: capacity.get(squadId) ?? 0, ...(st.shape ? { real: st.shape } : {}) });
  seen.set(st.id, { id: st.id, qid: st.qid, name: st.name, lat: st.lat, lon: st.lon, axis: st.axis, shape });
}
writeFileSync(out, JSON.stringify({ art: SURROUND_ART, footprints, stadiums: [...seen.values()] }, null, 1));
console.log(`${seen.size} stadiums`, Object.fromEntries(shapes.map((s) => [s, [...seen.values()].filter((v) => v.shape === s).length])));
