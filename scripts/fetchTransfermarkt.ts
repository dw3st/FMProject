// Busca clubes e elencos de cada liga mapeada na API local do Transfermarkt e guarda as respostas cruas
// em data_process/transfermarkt/cache/ (fora do git). Retomável: o que já está em cache não é buscado de novo.
// Uso: bun scripts/fetchTransfermarkt.ts [--leagues a,b] [--season 2026] [--port 8765]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseClubPlayers, parseCompetitionClubs } from "@/../scripts/transfermarkt/api";

const DIR = fileURLToPath(new URL("../data_process/transfermarkt/", import.meta.url));
const CACHE = `${DIR}cache/`;

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SEASON = Number(argValue("--season") ?? "2026");
const PORT = argValue("--port") ?? "8765";
const ONLY = argValue("--leagues")?.split(",").map((s) => s.trim()).filter(Boolean);
const PAUSE_MS = 2000;
const RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Devolve a resposta (do cache ou da rede), validada por `validate`. */
async function cached(file: string, path: string, validate: (body: unknown) => unknown): Promise<unknown> {
  const full = `${CACHE}${file}`;
  if (existsSync(full)) {
    const body = JSON.parse(readFileSync(full, "utf8"));
    validate(body);
    return body;
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const body = await res.json();
      validate(body); // formato mudou → falha alto, sem tentar de novo
      writeFileSync(full, JSON.stringify(body));
      await sleep(PAUSE_MS);
      return body;
    } catch (e) {
      if (e instanceof Error && !e.message.includes("HTTP")) throw e;
      lastError = e;
      if (attempt < RETRIES) await sleep(10_000 * attempt);
    }
  }
  throw lastError;
}

mkdirSync(CACHE, { recursive: true });
const map: Record<string, string | null> = JSON.parse(readFileSync(`${DIR}leagueMap.json`, "utf8"));
const slugs = Object.entries(map)
  .filter(([slug, id]) => id && (!ONLY || ONLY.includes(slug)))
  .map(([slug]) => slug);
if (ONLY) for (const s of ONLY) if (!map[s]) throw new Error(`liga sem id no leagueMap: ${s}`);

for (const slug of slugs) {
  const compId = map[slug]!;
  // Ligas de ano civil: o Transfermarkt ainda não tem clubes na temporada nova (clubs vazio) → usa a anterior.
  let season = SEASON;
  let comp = parseCompetitionClubs(await cached(`comp-${compId}-${season}.json`, `/competitions/${compId}/clubs?season_id=${season}`, parseCompetitionClubs));
  if (comp.length === 0) {
    season = SEASON - 1;
    comp = parseCompetitionClubs(await cached(`comp-${compId}-${season}.json`, `/competitions/${compId}/clubs?season_id=${season}`, parseCompetitionClubs));
  }
  let players = 0;
  for (const club of comp) {
    // Elenco atual (sem season_id): numa temporada passada a API não devolve idade nem valor de mercado.
    const body = await cached(`club-${club.id}-current.json`, `/clubs/${club.id}/players`, parseClubPlayers);
    players += parseClubPlayers(body).length;
  }
  console.log(`${slug} (${compId}, temporada ${season}): ${comp.length} clubes, ${players} jogadores`);
}
console.log("ok");
