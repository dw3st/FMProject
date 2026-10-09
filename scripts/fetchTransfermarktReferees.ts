/**
 * Real referee rigor from Transfermarkt (spec `docs/superpowers/specs/2026-10-09-referees-design.md` §1.3).
 *
 * The local Transfermarkt API (`C:/Projects/transfermarkt-api`, used by `fetchTransfermarkt.ts`) has no referee
 * route and tmapi's `/referee/:id` only has the profile, so the career totals come from the referee's profile page
 * (`/-/profil/schiedsrichter/<id>/saison_id/0`, totals row). Pages are cached in
 * `data_process/transfermarkt/cache/referees/` (gitignored); only the derived rigor (`strictness`, `tmMatches`) is
 * written back into `data_process/wikidata/referees.json`, never the card counts. Then the game copy
 * `src/example_data/referees.json` is written (without the Transfermarkt id).
 *
 *   bun scripts/fetchTransfermarktReferees.ts [--offline]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cardRate, parseTmRefereeTotals, realStrictness, TM_MIN_MATCHES, type RefereeSource, type TmCareerTotals } from "@/../scripts/wikidata/refereesSource";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CACHE = join(ROOT, "data_process/transfermarkt/cache/referees");
const SRC = join(ROOT, "data_process/wikidata/referees.json");
const GAME = join(ROOT, "src/example_data/referees.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const OFFLINE = process.argv.includes("--offline");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
mkdirSync(CACHE, { recursive: true });

async function page(tmId: string): Promise<string | null> {
  const file = join(CACHE, `${tmId}.html`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  if (OFFLINE) return null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "-L", "--max-time", "60", "-A", UA, "-H", "Accept-Language: en",
      `https://www.transfermarkt.com/-/profil/schiedsrichter/${encodeURIComponent(tmId)}/saison_id/0`], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text.includes("responsive-table")) {
      writeFileSync(file, text);
      await sleep(2000);
      return text;
    }
    await sleep(8000 * attempt);
  }
  console.warn(`sem página: ${tmId}`);
  return null;
}

const refs: RefereeSource[] = JSON.parse(readFileSync(SRC, "utf8"));
const entries: { id: string; country: string; totals: TmCareerTotals }[] = [];
for (const r of refs) {
  if (!r.tmId || !/^\d+$/.test(r.tmId)) continue;
  const html = await page(r.tmId);
  const totals = html ? parseTmRefereeTotals(html) : null;
  if (totals) entries.push({ id: r.id, country: r.country, totals });
}
const rigor = realStrictness(entries);
const matchesOf = new Map(entries.map((e) => [e.id, e.totals.matches]));
const out: RefereeSource[] = refs.map((r): RefereeSource => {
  const { strictness: _s, tmMatches: _m, ...rest } = r;
  const s = rigor.get(r.id);
  return s === undefined ? rest : { ...rest, strictness: s, tmMatches: matchesOf.get(r.id)! };
});
writeFileSync(SRC, `${JSON.stringify(out, null, 1)}\n`);
const game = out.map(({ tmId: _t, ...rest }) => rest);
writeFileSync(GAME, `${JSON.stringify(game, null, 1)}\n`);

// Report: coverage, mean/sd of the real rigor, and card rates by band (the raw numbers stay local).
const real = out.filter((r) => r.strictness !== undefined);
const vals = real.map((r) => r.strictness!);
const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length));
console.log(`no arquivo: ${out.length}; com ID do Transfermarkt: ${out.filter((r) => r.tmId).length}; com totais: ${entries.length}; com rigor real (≥ ${TM_MIN_MATCHES} jogos): ${real.length}`);
console.log(`rigor real: média ${mean.toFixed(3)}, dp ${sd.toFixed(3)}, Tolerante ${vals.filter((v) => v <= -0.35).length} / Equilibrado ${vals.filter((v) => v > -0.35 && v < 0.35).length} / Rigoroso ${vals.filter((v) => v >= 0.35).length}`);
const byCountry = new Map<string, number[]>();
for (const e of entries) byCountry.set(e.country, [...(byCountry.get(e.country) ?? []), cardRate(e.totals)]);
for (const [c, xs] of [...byCountry].sort()) {
  xs.sort((a, b) => a - b);
  console.log(`${c.padEnd(14)} ${String(xs.length).padStart(2)} árbitros, cartões/jogo min ${xs[0]!.toFixed(2)} mediana ${xs[xs.length >> 1]!.toFixed(2)} máx ${xs[xs.length - 1]!.toFixed(2)}`);
}
