/**
 * Face pilot: a LOCAL comparison page (never published). Per player: the Commons photo (loaded by
 * URL from Wikimedia, not embedded) | current face | new face with the traits, plus the traits and
 * the photo's licence/author.
 *
 *   bun scripts/faces/pilotPage.ts <out.html> [max=64] [--leagues a,b]
 *
 * Players: the Wikidata-labelled ones in label order (stars first, data_process/wikidata/faceTraits*),
 * then the ESPN heuristic ones. `--leagues` keeps only players of those leagues (stars of the list
 * `STARS` first).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import type { FaceTraits } from "@/Domain/faces/faceTraits";
import { LEAGUES } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("usage: bun scripts/faces/pilotPage.ts <out.html> [max]");
const MAX = Number(process.argv[3] ?? 64);
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const traits: Record<string, FaceTraits> = read("src/example_data/faceTraits.json");
const meta: Record<string, { file: string; license: string; artist: string; thumb: string; page: string }> = read("data_process/wikidata/photoMeta.json");
const labelOrder = readFileSync(join(ROOT, "data_process/wikidata/faceTraitLabels.txt"), "utf8")
  .split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]!);
const espn: Record<string, string> = read("data_process/espn/faceAthletes.json");
const espnTraits: Record<string, FaceTraits> = read("data_process/espn/faceTraits.json");

interface Row { id: string; name: string; club: string; league: string; nat?: string; colors: string[] }
const byId = new Map<string, Row>();
for (const league of LEAGUES) {
  const dir = join(ROOT, "src/example_data/squads", league);
  for (const f of readdirSync(dir)) {
    const sq = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const p of sq.players) byId.set(p.id, { id: p.id, name: p.name, club: sq.name, league, nat: p.nationality, colors: sq.colors ?? [] });
  }
}
const leaguesArg = process.argv.indexOf("--leagues");
const onlyLeagues = leaguesArg > 0 ? new Set(process.argv[leaguesArg + 1]!.split(",")) : null;
const STARS = ["Kane", "Musiala", "Lautaro", "Leão", "Wirtz", "Olise", "Kvaratskhelia", "Barella", "Gyökeres", "Messi", "Suárez", "De Bruyne", "Lewandowski", "Son", "Paredes", "Otamendi", "McTominay", "Pulišić"];
const labelled = [...labelOrder, ...Object.keys(espnTraits).filter((id) => !labelOrder.includes(id))]
  .filter((id) => !onlyLeagues || onlyLeagues.has(byId.get(id)?.league ?? ""));
const stars = labelled.filter((id) => STARS.some((s) => byId.get(id)?.name.includes(s)));
const ids = [...stars, ...labelled.filter((id) => !stars.includes(id))].slice(0, MAX);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const svgImg = (svg: string) => `<img class="face" alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;

const card = (id: string) => {
  const r = byId.get(id)!;
  const t = traits[id];
  const m = meta[id];
  const src = m ? "Wikimedia Commons" : "ESPN";
  const photoUrl = m ? m.thumb : `https://a.espncdn.com/i/headshots/soccer/players/full/${espn[id]}.png`;
  const credit = m
    ? `<a href="${esc(m.page)}" target="_blank" rel="noopener">${esc(m.license)}</a> · ${esc(m.artist)}`
    : "ESPN (sem licença livre: só referência local)";
  return `<div class="card">
  <div class="head"><b>${esc(r.name)}</b><span>${esc(r.club)} · ${esc(r.league)} · ${esc(r.nat ?? "?")}</span></div>
  <div class="cols"><div><img class="photo" alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc(photoUrl)}"><small>${src}</small></div><div>${svgImg(croppedPlayerFaceSvg(id, r.nat, r.colors))}<small>atual</small></div><div>${svgImg(croppedPlayerFaceSvg(id, r.nat, r.colors, t))}<small>novo</small></div></div>
  <div class="meta">traços: ${esc(JSON.stringify(t))}<br>foto: ${credit}</div>
</div>`;
};

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Piloto de rostos</title>
<style>
:root{--bg:#f6f6f4;--fg:#1b1b1b;--muted:#666;--card:#fff;--border:#ddd;--ph:#e9e9e9}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#9a9a9a;--card:#1e1e1e;--border:#333;--ph:#2a2a2a}}
body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px} p{color:var(--muted);margin:0 0 16px;max-width:900px}
a{color:inherit}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px}
.head{display:flex;flex-direction:column;margin-bottom:6px}.head span{color:var(--muted);font-size:13px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
.cols small{display:block;color:var(--muted)}
.photo{width:100%;aspect-ratio:1;object-fit:cover;object-position:50% 15%;background:var(--ph);border-radius:6px}
.face{width:100%;aspect-ratio:1;border-radius:6px;background:var(--ph)}
.meta{margin-top:6px;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
</style></head><body>
<h1>Piloto de rostos (Wikidata/Commons → facesjs)</h1>
<p>Página local, não publicada. Fotos carregadas do Wikimedia Commons pela URL (licença e autor em cada cartão). Traços das fotos do Commons rotulados à mão (pele 1–7, cor e comprimento do cabelo, barba); os demais, da heurística sobre as fotos da ESPN (só pele e cor do cabelo). ${ids.length} jogadores.</p>
<div class="grid">${ids.filter((id) => byId.has(id)).map(card).join("\n")}</div>
</body></html>`;
writeFileSync(out, html);
console.log(`${ids.length} players → ${out}`);
