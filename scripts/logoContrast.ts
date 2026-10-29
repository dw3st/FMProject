/**
 * Crests that vanish on the game's dark background: thin dark lines on a transparent crest (QPR, Bolton…, tester
 * report). Writes `src/example_data/logoBacking.json` (squad ids) — `ClubLogo` draws a light disc behind them.
 * Rule: little of the image is painted (coverage < 0.3), what is painted is dark (mean luminance < 90 of 255) and
 * almost nothing is bright. Run after the logo index changes, then copy the file to `src/Data`.
 *
 *   bun scripts/logoContrast.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodePng } from "./faces/png";

const ROOT = join(import.meta.dir, "..", "src", "example_data");
const index = JSON.parse(readFileSync(join(ROOT, "logoIndex.json"), "utf8")) as Record<string, string>;

export function needsBacking(px: { data: Uint8Array }): boolean {
  const d = px.data;
  let alphaSum = 0, lumSum = 0, bright = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    n++;
    const a = d[i + 3]! / 255;
    if (a === 0) continue;
    const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    alphaSum += a;
    lumSum += lum * a;
    if (a > 0.5 && lum > 140) bright++;
  }
  if (alphaSum === 0) return false;
  return alphaSum / n < 0.3 && lumSum / alphaSum < 90 && bright / n < 0.05;
}

const out: string[] = [];
for (const [squadId, entry] of Object.entries(index)) {
  const file = join(ROOT, "logos", `${entry}.png`);
  let buf: Uint8Array;
  try {
    buf = readFileSync(file);
  } catch {
    continue; // an SVG crest (native) or another extension: not measured
  }
  try {
    if (needsBacking(decodePng(buf))) out.push(squadId);
  } catch {
    // an image the decoder can't read: left as is
  }
}
out.sort();
writeFileSync(join(ROOT, "logoBacking.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.length} crests get a light backing`);
