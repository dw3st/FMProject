/**
 * Face pilot (Wikidata): maps our clubs of a few leagues to Wikidata items with the public search API.
 *   bun scripts/faces/wdClubs.ts  → data_process/wikidata/clubs.json (review it; fix by hand if needed)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { curlJson, LEAGUE_LANG as LANG, LEAGUES, sleep } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "data_process/wikidata/clubs.json");
const ALIAS: Record<string, string> = {
  "Atletico-MG": "Clube Atlético Mineiro", "Atletico Paranaense": "Club Athletico Paranaense", "Sao Paulo": "São Paulo Futebol Clube",
  "Gremio": "Grêmio Foot-Ball Porto Alegrense", "Vitoria": "Esporte Clube Vitória", "Chapecoense-sc": "Associação Chapecoense de Futebol",
  "Bahia": "Esporte Clube Bahia", "Remo": "Clube do Remo", "Santos": "Santos Futebol Clube", "Botafogo": "Botafogo de Futebol e Regatas",
  "Internacional": "Sport Club Internacional", "Coritiba": "Coritiba Foot Ball Club", "Cruzeiro": "Cruzeiro Esporte Clube",
  "Mirassol": "Mirassol Futebol Clube", "Flamengo": "Clube de Regatas do Flamengo", "Fluminense": "Fluminense Football Club",
  "Palmeiras": "Sociedade Esportiva Palmeiras", "Corinthians": "Sport Club Corinthians Paulista", "Vasco da Gama": "Club de Regatas Vasco da Gama",
  "RB Bragantino": "Red Bull Bragantino", "Newcastle": "Newcastle United F.C.", "Tottenham": "Tottenham Hotspur F.C.",
  "Brighton": "Brighton & Hove Albion F.C.", "Leeds": "Leeds United F.C.", "Bournemouth": "AFC Bournemouth",
  "Atletico Madrid": "Atlético de Madrid", "Alaves": "Deportivo Alavés", "Celta Vigo": "RC Celta de Vigo", "Elche": "Elche CF",
  "Levante": "Levante UD", "Valencia": "Valencia CF", "Sevilla": "Sevilla FC", "Getafe": "Getafe CF", "Osasuna": "CA Osasuna",
  "Villarreal": "Villarreal CF", "Espanyol": "RCD Espanyol", "Barcelona": "FC Barcelona", "Málaga": "Málaga CF",
  "Lyon": "Olympique Lyonnais", "Marseille": "Olympique de Marseille", "Nice": "OGC Nice", "Monaco": "AS Monaco FC",
  "Rennes": "Stade Rennais FC", "Strasbourg": "RC Strasbourg Alsace", "Toulouse": "Toulouse FC", "Lorient": "FC Lorient",
  "Lille": "Lille OSC", "Lens": "RC Lens", "Angers": "Angers SCO", "Auxerre": "AJ Auxerre", "Le Havre": "Le Havre AC",
  "Troyes": "ES Troyes AC", "Le Mans": "Le Mans FC", "Paris Saint Germain": "Paris Saint-Germain F.C.",
};
const prev: Record<string, { qid: string; label: string; desc: string }> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out: typeof prev = {};
for (const league of LEAGUES) {
  const dir = join(ROOT, "src/example_data/squads", league);
  for (const f of readdirSync(dir)) {
    const sq = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (prev[sq.id]) { out[sq.id] = prev[sq.id]!; continue; }
    const name = ALIAS[sq.name] ?? sq.name;
    let hit: any = null;
    for (const lang of [LANG[league]!, "en"]) {
      const r = await curlJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=10&language=${lang}&uselang=${lang}&search=${encodeURIComponent(name)}`);
      hit = (r.search ?? []).find((s: any) => /football|soccer|futebol|fútbol|futbol|club|clube|football/i.test(s.description ?? "") && !/women|femin|femen|youth|under-|reserve| B$|academy|basket|rugby|hockey/i.test(`${s.description} ${s.label}`));
      await sleep(300);
      if (hit) break;
    }
    out[sq.id] = hit ? { qid: hit.id, label: hit.label, desc: hit.description ?? "" } : { qid: "", label: "", desc: "NOT FOUND" };
    console.log(league, sq.name, "→", out[sq.id]!.qid, out[sq.id]!.label, "|", out[sq.id]!.desc);
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
