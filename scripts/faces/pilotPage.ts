/**
 * Face pilot: a LOCAL comparison page (never published): ESPN photo (loaded by URL from ESPN, not
 * embedded) | current face | new face with the extracted traits, plus the traits and the hand label.
 *
 *   bun scripts/faces/pilotPage.ts <out.html>
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import type { FaceTraits } from "@/Domain/faces/faceTraits";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: bun scripts/faces/pilotPage.ts <out.html>");
const LEAGUES = ["brazil_serie_a", "premier_league", "la_liga", "ligue_1"];
const STARS = ["Mbapp", "Vinícius", "Salah", "Saka", "Lewandowski", "Neymar", "Haaland", "Yamal", "Bellingham", "Raphinha"];

const traits: Record<string, FaceTraits> = JSON.parse(readFileSync(join(ROOT, "src/example_data/faceTraits.json"), "utf8"));
const athletes: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "data_process/espn/faceAthletes.json"), "utf8"));
const labels = new Map(readFileSync(join(ROOT, "data_process/espn/faceTraitLabels.txt"), "utf8").trim().split("\n")
  .map((l) => l.trim().split(/\s+/)).map(([id, ...rest]) => [id!, rest.join(" ")]));

interface Row { id: string; name: string; club: string; league: string; nat?: string; colors: string[] }
const rows: Row[] = [];
const stars: Row[] = [];
for (const league of LEAGUES) {
  const dir = join(ROOT, "src/example_data/squads", league);
  for (const f of readdirSync(dir)) {
    const sq = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const p of sq.players) {
      const row: Row = { id: p.id, name: p.name, club: sq.name, league, nat: p.nationality, colors: sq.colors ?? [] };
      if (traits[p.id]) rows.push(row);
      else if (STARS.some((s) => `${p.name} ${p.fullName ?? ""}`.includes(s))) stars.push(row);
    }
  }
}
rows.sort((a, b) => a.league.localeCompare(b.league) || a.club.localeCompare(b.club));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const svgImg = (svg: string) => `<img class="face" alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
const photo = (aid: string | undefined) => aid
  ? `<img class="photo" alt="" loading="lazy" referrerpolicy="no-referrer" src="https://a.espncdn.com/i/headshots/soccer/players/full/${aid}.png">`
  : `<div class="none">sem foto na ESPN</div>`;

const card = (r: Row, withTraits: boolean) => {
  const t = traits[r.id];
  const aid = athletes[r.id];
  const before = croppedPlayerFaceSvg(r.id, r.nat, r.colors);
  const after = croppedPlayerFaceSvg(r.id, r.nat, r.colors, t);
  return `<div class="card">
  <div class="head"><b>${esc(r.name)}</b><span>${esc(r.club)} · ${esc(r.league)} · ${esc(r.nat ?? "?")}</span></div>
  <div class="cols"><div>${photo(withTraits ? aid : undefined)}<small>ESPN</small></div><div>${svgImg(before)}<small>atual</small></div><div>${svgImg(after)}<small>novo</small></div></div>
  ${withTraits ? `<div class="meta">extraído: ${esc(JSON.stringify(t))}<br>rótulo manual: ${esc(labels.get(aid ?? "") ?? "-")}</div>` : ""}
</div>`;
};

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Piloto de rostos</title>
<style>
:root{--bg:#f6f6f4;--fg:#1b1b1b;--muted:#666;--card:#fff;--border:#ddd}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#9a9a9a;--card:#1e1e1e;--border:#333}}
body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px} p{color:var(--muted);margin:0 0 16px;max-width:900px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px}
.head{display:flex;flex-direction:column;margin-bottom:6px}.head span{color:var(--muted);font-size:13px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
.cols small{display:block;color:var(--muted)}
.photo{width:100%;aspect-ratio:1;object-fit:cover;object-position:50% 10%;background:#e9e9e9;border-radius:6px}
.face{width:100%;aspect-ratio:1;border-radius:6px;background:#e9e9e9}
.none{aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:var(--muted);background:#e9e9e9;border-radius:6px;font-size:13px}
.meta{margin-top:6px;font-size:13px;color:var(--muted)}
h2{font-size:16px;margin:24px 0 8px}
</style></head><body>
<h1>Piloto de rostos (ESPN → facesjs)</h1>
<p>Página local, não publicada. Fotos carregadas da ESPN pela URL. Traços usados: cor da pele (7 tons) e cor do cabelo. Comprimento do cabelo e barba foram medidos mas descartados (acerto perto do acaso). ${rows.length} jogadores com foto nas 4 ligas.</p>
<div class="grid">${rows.map((r) => card(r, true)).join("\n")}</div>
<h2>Estrelas sem foto na ESPN (rosto continua o sorteio de hoje)</h2>
<div class="grid">${stars.map((r) => card(r, false)).join("\n")}</div>
</body></html>`;
writeFileSync(out, html);
console.log(`${rows.length} players with traits + ${stars.length} stars without photo → ${out}`);
