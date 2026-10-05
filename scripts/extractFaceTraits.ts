/**
 * Face pilot: derives face traits from the downloaded ESPN headshots (`fetchHeadshots.ts`).
 *
 *   bun scripts/extractFaceTraits.ts [--debug]
 *
 * Reads data_process/espn/faceAthletes.json (our player id → athlete id) and
 * data_process/espn/headshots/<athleteId>.png; writes data_process/espn/faceTraits.json keyed by OUR
 * player id, with only the derived parameters (skin tone, hair colour, hair length, beard) — no
 * image data. Copy it to src/example_data/faceTraits.json (and src/Data) to use it in the game.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "@/../scripts/faces/png";
import { measure, traitsOf } from "@/../scripts/faces/traits";
import type { FaceTraits } from "@/Domain/faces/faceTraits";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process", "espn");
const DEBUG = process.argv.includes("--debug");

/**
 * Traits judged unreliable in the validation (91 hand-labelled photos, 2026-10-05) and left out:
 * hair length (62% vs 74% for "always short") and beard (56%, ~chance). Skin (±1 tone 79%) and hair
 * colour (76% exact, 89% dark/brown/light) are kept. See the pilot report.
 */
const DROP: (keyof FaceTraits)[] = ["hairLength", "beard"];

const map: Record<string, string> = JSON.parse(readFileSync(join(DIR, "faceAthletes.json"), "utf8"));
const out: Record<string, FaceTraits> = {};
let failed = 0;
for (const [pid, aid] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
  const file = join(DIR, "headshots", `${aid}.png`);
  if (!existsSync(file)) continue;
  try {
    const m = measure(decodePng(readFileSync(file)));
    if (!m) { failed++; continue; }
    const t = traitsOf(m);
    for (const k of DROP) delete t[k];
    out[pid] = t;
    if (DEBUG) {
      console.log(pid, aid, JSON.stringify(t), `skinL=${m.skinL.toFixed(0)} hair=${m.hair} hairL=${m.hairL.toFixed(0)} cover=${m.hairCover.toFixed(2)} vol=${m.volume.toFixed(2)} fh=${m.faceHalf} side=${m.sideHair.toFixed(2)} ear=${m.earHair.toFixed(2)} bDark=${m.beardDark.toFixed(2)} bRatio=${m.beardRatio.toFixed(2)} top=${m.top} eye=${m.eyeY} mouth=${m.mouthY} earY=${m.earY} cx=${m.cx}`);
    }
  } catch (e) {
    failed++;
    if (DEBUG) console.log(pid, aid, "error", (e as Error).message);
  }
}
const lines = Object.entries(out).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
writeFileSync(join(DIR, "faceTraits.json"), `{\n${lines.join(",\n")}\n}\n`);
console.log(`traits for ${Object.keys(out).length} players (${failed} failed) → data_process/espn/faceTraits.json`);
