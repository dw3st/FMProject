# Recalibração pelo valor de mercado + atributos 0–100 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reordenar a nota e corrigir a posição natural de todos os jogadores do mundo pelo valor de mercado e
pela posição do Transfermarkt, e passar os atributos para uma escala real de uma casa decimal, mostrada de 0 a 100
com cor por faixa.

**Architecture:** a busca no Transfermarkt sai de uma cópia local da `felipeall/transfermarkt-api`, com cache fora
do git. Módulos puros em `scripts/transfermarkt/` casam clubes e jogadores, estimam o "nível" a partir do valor e
reordenam as notas dentro de cada liga. Um passo novo da cadeia (`applyMarketRecalibration.ts`) grava
`naturalPosition` e reescala os atributos com o mesmo `shiftToOverall` das correções manuais. No repositório só
entra `derived.json` (nota-alvo, posição, nascimento, altura), nunca valor de mercado. Os atributos passam a ser
decimais (0,0–10,0) em toda a cadeia e no jogo; a tela mostra ×10.

**Tech Stack:** Bun + TypeScript (scripts e jogo), React 19 + Tailwind (telas), Python 3.12 só para subir a API do
Transfermarkt localmente.

Spec: `docs/superpowers/specs/2026-10-07-market-value-recalibration-design.md`. Regras do projeto que valem em toda
tarefa:
- Imports sempre `@/` (os scripts importam outros scripts com `@/../scripts/...`).
- Nunca escreva arquivo do repositório com PowerShell `Set-Content`/`Out-File` (BOM).
- Não commite `src/Data` nem saves.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Os arquivos de trabalho podem estar em CRLF e o índice em LF. Antes de commitar, confira com `git diff --stat`
  que nenhum arquivo foi convertido inteiro.
- Protótipo: sem migração nem fallback de save antigo.

Toda a etapa roda numa branch `feat/market-recalibration`, num worktree `C:/Projects/FMProject-recal` (crie com
`git worktree add C:/Projects/FMProject-recal -b feat/market-recalibration main`, depois `cp -R src/Data` do repo
principal e `bun install --frozen-lockfile`).

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `data_process/transfermarkt/leagueMap.json` (novo, commitado) | Nosso slug de liga → id de competição do Transfermarkt (`null` = sem cobertura) |
| `data_process/transfermarkt/clubOverrides.json`, `playerOverrides.json` (novos, commitados) | Exceções de casamento |
| `data_process/transfermarkt/cache/` (novo, **gitignored**) | Respostas cruas da API |
| `data_process/transfermarkt/derived.json` (novo, commitado) | Saída: por jogador `{ targetOverall?, naturalPosition?, birthDate?, heightCm? }` + resumo por liga |
| `scripts/fetchTransfermarkt.ts` (novo) | Busca com cache e retomada |
| `scripts/transfermarkt/api.ts` (novo) | Tipos e parse das respostas (`parseClubPlayers`, `parseMarketValue`) |
| `scripts/transfermarkt/positions.ts` (+ teste) | Posição do Transfermarkt → posição detalhada |
| `scripts/transfermarkt/match.ts` (+ teste) | Casamento de clubes e jogadores |
| `scripts/transfermarkt/level.ts` (+ teste) | Efeitos de idade/linha e nível |
| `scripts/transfermarkt/reorder.ts` (+ teste) | Reordenação por liga, teto dos jovens sem par, cobertura |
| `scripts/buildMarketDerived.ts` (novo) | Cache + mundo → `derived.json` + relatório |
| `scripts/applyMarketRecalibration.ts` (novo) | `derived.json` → elencos (`naturalPosition`, `positions[0]`, atributos, `birthDate`, `heightCm`) |
| `src/Domain/attributes.ts` | `roundAttr`, `attrDisplay` (×10) |
| `src/GameInterface/scoreColors.ts` | `attributeColorClasses` (cinco faixas) |
| `src/GameEngine/PlayerDevelopment.ts` | Passo de 0,1 |
| `src/Domain/Player.ts` | Constantes de `valueMillions` |
| `src/types/playerTypes.ts`, `dayLogTypes.ts` | `birthDate?`, `heightCm?`; `StatLevelChange.delta: number` |

---

### Task 1: API local do Transfermarkt e sondagem do formato

**Files:**
- Modify: `.gitignore`
- Create: `data_process/transfermarkt/README.md`

- [ ] **Step 1: Subir a API fora do repositório**

```bash
git clone https://github.com/felipeall/transfermarkt-api C:/Projects/transfermarkt-api
cd C:/Projects/transfermarkt-api
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # se não houver requirements.txt: pip install poetry && poetry export … ou pip install .
.venv/Scripts/python -m uvicorn app.main:app --port 8765
```

Rode o `uvicorn` em segundo plano e anote o PID: só esse processo pode ser parado depois (nunca mate todos os
`python`/`bun`).

- [ ] **Step 2: Sondar as três rotas e anotar o formato**

```bash
curl -s "http://127.0.0.1:8765/competitions/search/Premier%20League" | head -c 1500
curl -s "http://127.0.0.1:8765/competitions/GB1/clubs?season_id=2025" | head -c 1500
curl -s "http://127.0.0.1:8765/clubs/985/players?season_id=2025" | head -c 3000
```

Confira e escreva em `data_process/transfermarkt/README.md`:
- os nomes reais dos campos (`id`, `name`, `position`, `dateOfBirth`, `age`, `height`, `marketValue`);
- se `marketValue` vem como número ou texto (ex. `"€45.00m"`);
- se `height` vem em cm ou em metros;
- qual `season_id` tem os elencos atuais (2025 ou 2026; use o que tiver mais jogadores na Premier League).

Se o formato for diferente do assumido em `scripts/transfermarkt/api.ts` (Task 3), ajuste o parse lá. O parse tem
que falhar alto, nunca seguir em silêncio.

- [ ] **Step 3: `.gitignore`**

Acrescente:

```
data_process/transfermarkt/cache/
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore data_process/transfermarkt/README.md
git commit -m "chore(transfermarkt): cache fora do git e notas do formato da API local"
```

---

### Task 2: Mapa de ligas

**Files:**
- Create: `scripts/transfermarkt/proposeLeagueMap.ts`
- Create: `data_process/transfermarkt/leagueMap.json`

- [ ] **Step 1: Script que propõe o mapa**

O script lê `src/example_data/leagueData.json`. Para cada liga ele chama `/competitions/search/<nome da liga>`, fica
com o primeiro resultado do mesmo país e grava a proposta. Uma liga sem resultado do país fica com `null`.

```ts
/**
 * Proposes data_process/transfermarkt/leagueMap.json (our league slug → Transfermarkt competition id)
 * from the local API's competition search. The output is reviewed by hand before use.
 *
 *   bun scripts/transfermarkt/proposeLeagueMap.ts [--port 8765]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = join(ROOT, "data_process", "transfermarkt", "leagueMap.json");
const port = process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : "8765";
const leagues = JSON.parse(readFileSync(join(ROOT, "src", "example_data", "leagueData.json"), "utf-8")) as
  Record<string, { name: string; country: string }>;
const existing: Record<string, string | null> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : {};

const out: Record<string, string | null> = { ...existing };
for (const [slug, l] of Object.entries(leagues)) {
  if (slug in existing) continue;
  const res = await fetch(`http://127.0.0.1:${port}/competitions/search/${encodeURIComponent(l.name)}`);
  if (!res.ok) throw new Error(`search ${l.name}: ${res.status}`);
  const body = (await res.json()) as { results?: { id: string; name: string; country?: string }[] };
  const hit = (body.results ?? []).find((r) => (r.country ?? "").toLowerCase() === l.country.toLowerCase());
  out[slug] = hit?.id ?? null;
  console.log(`${slug.padEnd(40)} ${l.country.padEnd(16)} → ${hit ? `${hit.id} ${hit.name}` : "—"}`);
  await new Promise((r) => setTimeout(r, 1500));
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
```

Se o formato real do `leagueData.json` for outro (um array, por exemplo), adapte a leitura.

- [ ] **Step 2: Rodar e revisar à mão**

Run: `bun scripts/transfermarkt/proposeLeagueMap.ts`

Revise cada linha do console, principalmente as divisões de grupo (Rússia B, Argentina B) e as ligas `null`. Corrija
o JSON à mão. As ligas nativas têm ids conhecidos: `premier_league` GB1, `la_liga` ES1, `bundesliga` L1,
`serie_a` IT1, `ligue_1` FR1, `brazil_serie_a` BRA1, `brazil_serie_b` BRA2, `brazil_serie_c` BRA3. Uma liga sem
cobertura no Transfermarkt fica `null`: a recalibração deixa essa liga como está.

- [ ] **Step 3: Commit**

```bash
git add scripts/transfermarkt/proposeLeagueMap.ts data_process/transfermarkt/leagueMap.json
git commit -m "feat(transfermarkt): mapa liga → competição revisado"
```

---

### Task 3: Parse das respostas (puro)

**Files:**
- Create: `scripts/transfermarkt/api.ts`
- Test: `scripts/transfermarkt/api.test.ts`

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { parseClubPlayers, parseCompetitionClubs, parseHeightCm, parseMarketValue } from "@/../scripts/transfermarkt/api";

describe("parseMarketValue", () => {
  test("number passes through", () => expect(parseMarketValue(45_000_000)).toBe(45_000_000));
  test("€45.00m", () => expect(parseMarketValue("€45.00m")).toBe(45_000_000));
  test("€500k", () => expect(parseMarketValue("€500k")).toBe(500_000));
  test("€1.20bn", () => expect(parseMarketValue("€1.20bn")).toBe(1_200_000_000));
  test("missing / dash", () => {
    expect(parseMarketValue(undefined)).toBeNull();
    expect(parseMarketValue("-")).toBeNull();
  });
});

describe("parseHeightCm", () => {
  test("cm number", () => expect(parseHeightCm(184)).toBe(184));
  test("metres text", () => expect(parseHeightCm("1,84 m")).toBe(184));
  test("missing", () => expect(parseHeightCm(null)).toBeNull());
});

describe("parseClubPlayers", () => {
  test("keeps the fields we need", () => {
    const r = parseClubPlayers({ id: "985", players: [
      { id: "1", name: "A B", position: "Centre-Back", dateOfBirth: "2000-05-01", age: 26, height: 190, marketValue: 1e6 },
    ] });
    expect(r).toEqual([{ id: "1", name: "A B", position: "Centre-Back", birthDate: "2000-05-01", age: 26, heightCm: 190, value: 1e6 }]);
  });
  test("throws when the shape changed", () => {
    expect(() => parseClubPlayers({ id: "985" })).toThrow();
    expect(() => parseClubPlayers({ id: "985", players: [{ name: "x" }] })).toThrow();
  });
});

describe("parseCompetitionClubs", () => {
  test("ids and names", () => {
    expect(parseCompetitionClubs({ id: "GB1", clubs: [{ id: "985", name: "Manchester United" }] }))
      .toEqual([{ id: "985", name: "Manchester United" }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/transfermarkt/api.test.ts`
Expected: FAIL (o módulo não existe)

- [ ] **Step 3: Implementação**

```ts
/** Shapes and parsing of the local transfermarkt-api responses. Throws on any unexpected shape. */

export interface TmClub { id: string; name: string }
export interface TmPlayer {
  id: string; name: string; position: string | null;
  birthDate: string | null; age: number | null; heightCm: number | null; value: number | null;
}

const UNIT: Record<string, number> = { k: 1e3, m: 1e6, bn: 1e9 };

export function parseMarketValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = /([\d.,]+)\s*(bn|m|k)?/i.exec(v.replace(/\s/g, ""));
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2] ? UNIT[m[2].toLowerCase()]! : 1));
}

export function parseHeightCm(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v < 3 ? Math.round(v * 100) : Math.round(v);
  if (typeof v !== "string") return null;
  const m = /(\d)[.,](\d{2})/.exec(v);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

function str(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null; }

export function parseCompetitionClubs(body: unknown): TmClub[] {
  const clubs = (body as { clubs?: unknown }).clubs;
  if (!Array.isArray(clubs)) throw new Error("competition clubs: no clubs array");
  return clubs.map((c) => {
    const id = str((c as { id?: unknown }).id), name = str((c as { name?: unknown }).name);
    if (!id || !name) throw new Error(`competition clubs: bad club ${JSON.stringify(c)}`);
    return { id, name };
  });
}

export function parseClubPlayers(body: unknown): TmPlayer[] {
  const players = (body as { players?: unknown }).players;
  if (!Array.isArray(players)) throw new Error("club players: no players array");
  return players.map((p) => {
    const o = p as Record<string, unknown>;
    const id = str(o.id), name = str(o.name);
    if (!id || !name) throw new Error(`club players: bad player ${JSON.stringify(p)}`);
    return {
      id, name,
      position: str(o.position),
      birthDate: str(o.dateOfBirth),
      age: typeof o.age === "number" ? o.age : o.age != null && Number.isFinite(Number(o.age)) ? Number(o.age) : null,
      heightCm: parseHeightCm(o.height),
      value: parseMarketValue(o.marketValue),
    };
  });
}
```

Se o Step 2 da Task 1 mostrou outros nomes de campo, ajuste aqui e no teste.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/transfermarkt/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/transfermarkt/api.ts scripts/transfermarkt/api.test.ts
git commit -m "feat(transfermarkt): parse das respostas da API"
```

---

### Task 4: Busca com cache (roda em segundo plano, 2–3 h)

**Files:**
- Create: `scripts/fetchTransfermarkt.ts`

- [ ] **Step 1: Script**

```ts
/**
 * Fetches every mapped league's clubs and squads from the local transfermarkt-api into
 * data_process/transfermarkt/cache/ (gitignored). Resumable: cached responses are never fetched again.
 * One request every ~2 s. Fails loudly on an unexpected shape (parse in scripts/transfermarkt/api.ts).
 *
 *   bun scripts/fetchTransfermarkt.ts [--port 8765] [--season 2025] [--leagues a,b]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClubPlayers, parseCompetitionClubs } from "@/../scripts/transfermarkt/api";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process", "transfermarkt");
const CACHE = join(DIR, "cache");
const arg = (k: string, d: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1]! : d);
const port = arg("--port", "8765");
const season = arg("--season", "2025");
const only = process.argv.includes("--leagues") ? new Set(arg("--leagues", "").split(",")) : null;
const DELAY_MS = 2000;

mkdirSync(CACHE, { recursive: true });
const leagueMap = JSON.parse(readFileSync(join(DIR, "leagueMap.json"), "utf-8")) as Record<string, string | null>;

async function cached(name: string, path: string): Promise<unknown> {
  const file = join(CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf-8"));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (res.ok) {
      const body = await res.json();
      writeFileSync(file, JSON.stringify(body));
      return body;
    }
    if (attempt >= 3) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 10_000 * attempt));
  }
}

let clubsDone = 0;
for (const [slug, comp] of Object.entries(leagueMap)) {
  if (!comp || (only && !only.has(slug))) continue;
  const clubs = parseCompetitionClubs(await cached(`comp-${comp}-${season}.json`, `/competitions/${comp}/clubs?season_id=${season}`));
  for (const c of clubs) {
    parseClubPlayers(await cached(`club-${c.id}-${season}.json`, `/clubs/${c.id}/players?season_id=${season}`));
    clubsDone++;
  }
  console.log(`${slug}: ${clubs.length} clubes (total ${clubsDone})`);
}
console.log("ok");
```

- [ ] **Step 2: Testar com uma liga**

Run: `bun scripts/fetchTransfermarkt.ts --leagues premier_league`
Expected: `premier_league: 20 clubes (total 20)`, depois `ok`; 21 arquivos em `data_process/transfermarkt/cache/`.

- [ ] **Step 3: Commit e soltar a busca completa em segundo plano**

```bash
git add scripts/fetchTransfermarkt.ts
git commit -m "feat(transfermarkt): busca com cache e retomada"
bun scripts/fetchTransfermarkt.ts > C:/…/scratchpad/tm-fetch.log 2>&1   # em segundo plano
```

As Tasks 5 a 11 não dependem da busca e seguem enquanto ela roda. A Task 12 precisa dela pronta. Se a busca cair,
rode de novo: o cache retoma de onde parou.

---

### Task 5: Posição do Transfermarkt → posição do jogo

**Files:**
- Create: `scripts/transfermarkt/positions.ts`
- Test: `scripts/transfermarkt/positions.test.ts`

- [ ] **Step 1: Teste**

```ts
import { expect, test } from "bun:test";
import { tmPosition } from "@/../scripts/transfermarkt/positions";

test("maps every Transfermarkt position", () => {
  expect(tmPosition("Goalkeeper")).toBe("GK");
  expect(tmPosition("Centre-Back")).toBe("CB");
  expect(tmPosition("Left-Back")).toBe("LB");
  expect(tmPosition("Right-Back")).toBe("RB");
  expect(tmPosition("Defensive Midfield")).toBe("CDM");
  expect(tmPosition("Central Midfield")).toBe("CM");
  expect(tmPosition("Attacking Midfield")).toBe("CAM");
  expect(tmPosition("Left Midfield")).toBe("LM");
  expect(tmPosition("Right Midfield")).toBe("RM");
  expect(tmPosition("Left Winger")).toBe("LW");
  expect(tmPosition("Right Winger")).toBe("RW");
  expect(tmPosition("Centre-Forward")).toBe("ST");
  expect(tmPosition("Second Striker")).toBe("ST");
});

test("generic or unknown → null", () => {
  expect(tmPosition("Defender")).toBeNull();
  expect(tmPosition(null)).toBeNull();
  expect(tmPosition("Sweeper")).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/transfermarkt/positions.test.ts` → FAIL

- [ ] **Step 3: Implementação**

```ts
import type { DetailedRole } from "@/types/playerTypes";

const MAP: Record<string, DetailedRole> = {
  "goalkeeper": "GK", "centre-back": "CB", "left-back": "LB", "right-back": "RB",
  "defensive midfield": "CDM", "central midfield": "CM", "attacking midfield": "CAM",
  "left midfield": "LM", "right midfield": "RM", "left winger": "LW", "right winger": "RW",
  "centre-forward": "ST", "second striker": "ST",
};

/** Transfermarkt main position → our detailed position; null for a generic or unknown label. */
export function tmPosition(pos: string | null): DetailedRole | null {
  return pos ? MAP[pos.trim().toLowerCase()] ?? null : null;
}
```

- [ ] **Step 4: Rodar e ver passar** — `bun test scripts/transfermarkt/positions.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(transfermarkt): mapa de posições"`

---

### Task 6: Casamento de clubes e jogadores

**Files:**
- Create: `scripts/transfermarkt/match.ts`
- Test: `scripts/transfermarkt/match.test.ts`

Reaproveite `clubKey`, `looseClubKey` e `playerKey` de `scripts/espn/normalize.ts` (leia o arquivo para as
assinaturas exatas).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import { matchClubs, matchPlayers } from "@/../scripts/transfermarkt/match";

const ours = [
  { squadId: "33", name: "Manchester United" },
  { squadId: "50", name: "Manchester City" },
  { squadId: "40", name: "Liverpool" },
];

describe("matchClubs", () => {
  test("exact, then override; ambiguous loose keys never match", () => {
    const tm = [
      { id: "985", name: "Manchester United" },
      { id: "281", name: "Man City" },
      { id: "31", name: "Liverpool FC" },
    ];
    const r = matchClubs(ours, tm, { "50": "281" });
    expect(r.get("33")).toBe("985");
    expect(r.get("50")).toBe("281");
    expect(r.get("40")).toBe("31");
  });
  test("a Transfermarkt club claimed twice matches nobody", () => {
    const r = matchClubs([{ squadId: "a", name: "Sporting" }, { squadId: "b", name: "Sporting" }], [{ id: "1", name: "Sporting" }], {});
    expect(r.size).toBe(0);
  });
});

describe("matchPlayers", () => {
  const world = [
    { id: "p1", name: "Bruno Fernandes", fullName: "Bruno Miguel Borges Fernandes", age: 32 },
    { id: "p2", name: "D. Dalot", fullName: "Diogo Dalot Teixeira", age: 27 },
    { id: "p3", name: "Pedro", fullName: "Pedro", age: 22 },
    { id: "p4", name: "Pedro", fullName: "Pedro", age: 30 },
  ];
  const tm = [
    { id: "t1", name: "Bruno Fernandes", age: 31 },
    { id: "t2", name: "Diogo Dalot", age: 27 },
    { id: "t3", name: "Pedro", age: 22 },
  ];
  test("name + age within one year, unique on both sides", () => {
    const r = matchPlayers(world, tm, {});
    expect(r.get("p1")).toBe("t1");
    expect(r.get("p3")).toBe("t3");
    expect(r.has("p4")).toBe(false);
  });
  test("abbreviated first name matches by surname + initial", () => {
    expect(matchPlayers(world, tm, {}).get("p2")).toBe("t2");
  });
  test("override wins", () => {
    expect(matchPlayers(world, tm, { p4: "t3" }).get("p4")).toBe("t3");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun test scripts/transfermarkt/match.test.ts` → FAIL

- [ ] **Step 3: Implementação**

```ts
import { clubKey, looseClubKey, playerKey } from "@/../scripts/espn/normalize";

export interface OurClub { squadId: string; name: string }
export interface OurPlayer { id: string; name: string; fullName?: string; age: number }
export interface TmNamed { id: string; name: string }
export interface TmAged { id: string; name: string; age: number | null }

/** Unique pairs only: each side's candidate list must have exactly one entry pointing at the other. */
function uniquePairs<A extends string, B extends string>(cands: Map<A, B[]>): Map<A, B> {
  const claims = new Map<B, number>();
  for (const list of cands.values()) for (const b of new Set(list)) claims.set(b, (claims.get(b) ?? 0) + 1);
  const out = new Map<A, B>();
  for (const [a, list] of cands) {
    const set = [...new Set(list)];
    if (set.length === 1 && claims.get(set[0]!) === 1) out.set(a, set[0]!);
  }
  return out;
}

/** Club → Transfermarkt club id inside one country/league: override → exact key → loose key → prefix. */
export function matchClubs(ours: OurClub[], tm: TmNamed[], overrides: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const c of ours) {
    const o = overrides[c.squadId];
    if (o && tm.some((t) => t.id === o)) { out.set(c.squadId, o); taken.add(o); }
  }
  const passes: ((a: string, b: string) => boolean)[] = [
    (a, b) => clubKey(a) === clubKey(b),
    (a, b) => looseClubKey(a) === looseClubKey(b),
    (a, b) => { const x = clubKey(a), y = clubKey(b); return x.length > 2 && y.length > 2 && (x.startsWith(y) || y.startsWith(x)); },
  ];
  for (const same of passes) {
    const cands = new Map<string, string[]>();
    for (const c of ours) {
      if (out.has(c.squadId)) continue;
      const hits = tm.filter((t) => !taken.has(t.id) && same(c.name, t.name)).map((t) => t.id);
      if (hits.length) cands.set(c.squadId, hits);
    }
    for (const [s, t] of uniquePairs(cands)) { out.set(s, t); taken.add(t); }
  }
  return out;
}

function tokens(s: string): string[] { return playerKey(s).split(" ").filter(Boolean); }

function nameMatches(p: OurPlayer, t: TmAged): boolean {
  const tk = tokens(t.name);
  for (const n of [p.name, p.fullName ?? ""]) {
    if (!n) continue;
    if (playerKey(n) === playerKey(t.name)) return true;
    const ours = tokens(n);
    // "D. Dalot" × "Diogo Dalot": same last token, initials agree.
    if (ours.length >= 2 && tk.length >= 2 && ours.at(-1) === tk.at(-1) && ours[0]![0] === tk[0]![0]) return true;
    // "Bruno Miguel Borges Fernandes" contains every token of "Bruno Fernandes".
    if (tk.length >= 2 && tk.every((x) => ours.includes(x))) return true;
  }
  return false;
}

/** Player → Transfermarkt player id inside one club: override, else name + age (≤ 1 year), unique both ways. */
export function matchPlayers(world: OurPlayer[], tm: TmAged[], overrides: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const forced = new Set<string>();
  for (const p of world) {
    const o = overrides[p.id];
    if (o && tm.some((t) => t.id === o)) { out.set(p.id, o); forced.add(o); }
  }
  const cands = new Map<string, string[]>();
  for (const p of world) {
    if (out.has(p.id)) continue;
    const hits = tm
      .filter((t) => !forced.has(t.id) && (t.age == null || Math.abs(t.age - p.age) <= 1) && nameMatches(p, t))
      .map((t) => t.id);
    if (hits.length) cands.set(p.id, hits);
  }
  for (const [a, b] of uniquePairs(cands)) out.set(a, b);
  return out;
}
```

Se `playerKey` devolver outra forma (não separada por espaço), adapte `tokens`.

- [ ] **Step 4: Rodar e ver passar** — `bun test scripts/transfermarkt/match.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(transfermarkt): casamento de clubes e jogadores"`

---

### Task 7: Nível a partir do valor

**Files:**
- Create: `scripts/transfermarkt/level.ts`
- Test: `scripts/transfermarkt/level.test.ts`

- [ ] **Step 1: Teste**

```ts
import { expect, test } from "bun:test";
import { fitEffects, levelOf, type ValuedPlayer } from "@/../scripts/transfermarkt/level";

function mk(league: string, age: number, line: ValuedPlayer["line"], value: number, id = `${league}${age}${line}${value}`): ValuedPlayer {
  return { id, league, age, line, value };
}

test("age effect: a 20-year-old worth the same as a 27-year-old ranks lower", () => {
  const players: ValuedPlayer[] = [];
  for (let i = 0; i < 30; i++) {
    players.push(mk("L", 20, "Midfielder", 4e6, `y${i}`));
    players.push(mk("L", 27, "Midfielder", 2e6, `o${i}`));
  }
  const fx = fitEffects(players);
  expect(fx.age.get(20)!).toBeGreaterThan(0);
  expect(levelOf(mk("L", 20, "Midfielder", 3e6), fx)).toBeLessThan(levelOf(mk("L", 27, "Midfielder", 3e6), fx));
});

test("line effect: goalkeepers valued lower are not punished", () => {
  const players: ValuedPlayer[] = [];
  for (let i = 0; i < 30; i++) {
    players.push(mk("L", 27, "GK", 1e6, `g${i}`));
    players.push(mk("L", 27, "Midfielder", 3e6, `m${i}`));
  }
  const fx = fitEffects(players);
  expect(levelOf(mk("L", 27, "GK", 1e6), fx)).toBeCloseTo(levelOf(mk("L", 27, "Midfielder", 3e6), fx), 5);
});

test("27 and Midfielder are the references (effect 0)", () => {
  const fx = fitEffects([mk("L", 27, "Midfielder", 1e6), mk("L", 27, "Midfielder", 2e6)]);
  expect(fx.age.get(27) ?? 0).toBe(0);
  expect(fx.line.Midfielder).toBe(0);
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL

- [ ] **Step 3: Implementação**

```ts
import type { MainRole } from "@/Domain/roles";

export interface ValuedPlayer { id: string; league: string; age: number; line: MainRole; value: number }
export interface Effects { age: Map<number, number>; line: Record<MainRole, number> }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const MIN_AGE = 16, MAX_AGE = 40;
const clampAge = (a: number) => Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(a)));

/**
 * log(value) effects, estimated inside each league (so league strength never leaks in) and
 * aggregated by median: age (1-year bands, relative to 27) and main line (relative to Midfielder).
 */
export function fitEffects(players: ValuedPlayer[]): Effects {
  const byLeague = new Map<string, ValuedPlayer[]>();
  for (const p of players) if (p.value > 0) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);

  const ageDiffs = new Map<number, number[]>();
  const lineDiffs: Record<MainRole, number[]> = { GK: [], Defender: [], Midfielder: [], Forward: [] };
  for (const list of byLeague.values()) {
    const ref = list.filter((p) => clampAge(p.age) === 27).map((p) => Math.log(p.value));
    if (ref.length) {
      const r = median(ref);
      const bands = new Map<number, number[]>();
      for (const p of list) bands.set(clampAge(p.age), [...(bands.get(clampAge(p.age)) ?? []), Math.log(p.value)]);
      for (const [a, xs] of bands) ageDiffs.set(a, [...(ageDiffs.get(a) ?? []), median(xs) - r]);
    }
    const mid = list.filter((p) => p.line === "Midfielder").map((p) => Math.log(p.value));
    if (mid.length) {
      const r = median(mid);
      for (const line of Object.keys(lineDiffs) as MainRole[]) {
        const xs = list.filter((p) => p.line === line).map((p) => Math.log(p.value));
        if (xs.length) lineDiffs[line].push(median(xs) - r);
      }
    }
  }
  const age = new Map<number, number>();
  for (const [a, ds] of ageDiffs) age.set(a, a === 27 ? 0 : median(ds));
  const line = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 } as Record<MainRole, number>;
  for (const l of Object.keys(lineDiffs) as MainRole[]) line[l] = l === "Midfielder" || !lineDiffs[l].length ? 0 : median(lineDiffs[l]);
  return { age, line };
}

/** Nearest band with an estimate (ages at the edges borrow the closest band). */
function ageEffect(fx: Effects, age: number): number {
  const a = clampAge(age);
  for (let d = 0; d <= MAX_AGE - MIN_AGE; d++) {
    if (fx.age.has(a - d)) return fx.age.get(a - d)!;
    if (fx.age.has(a + d)) return fx.age.get(a + d)!;
  }
  return 0;
}

export function levelOf(p: ValuedPlayer, fx: Effects): number {
  return Math.log(p.value) - ageEffect(fx, p.age) - fx.line[p.line];
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(transfermarkt): nível pelo valor com efeitos de idade e linha"`

---

### Task 8: Reordenação por liga

**Files:**
- Create: `scripts/transfermarkt/reorder.ts`
- Test: `scripts/transfermarkt/reorder.test.ts`

- [ ] **Step 1: Teste**

```ts
import { expect, test } from "bun:test";
import { COVERAGE_MIN, MIN_VALUED_PLAYERS, reorderLeague, youthCaps } from "@/../scripts/transfermarkt/reorder";

test("matched players get the league's own multiset, ordered by level", () => {
  const r = reorderLeague([
    { id: "a", overall: 5.0, level: 3 },
    { id: "b", overall: 6.5, level: 1 },
    { id: "c", overall: 5.8, level: 2 },
  ]);
  expect(r.get("a")).toBe(6.5);
  expect(r.get("c")).toBe(5.8);
  expect(r.get("b")).toBe(5.0);
});

test("ties broken by id, deterministic", () => {
  const r = reorderLeague([{ id: "b", overall: 5, level: 1 }, { id: "a", overall: 6, level: 1 }]);
  expect(r.get("a")).toBe(6);
  expect(r.get("b")).toBe(5);
});

test("unmatched youth above the club's matched median is capped there", () => {
  const caps = youthCaps(
    [{ id: "y", squadId: "s", age: 19, overall: 6.2, matched: false },
     { id: "o", squadId: "s", age: 25, overall: 6.4, matched: false },
     { id: "m1", squadId: "s", age: 27, overall: 5.0, matched: true },
     { id: "m2", squadId: "s", age: 28, overall: 5.6, matched: true }],
    new Map([["m1", 5.0], ["m2", 5.6]]),
  );
  expect(caps.get("y")).toBeCloseTo(5.3, 5);
  expect(caps.has("o")).toBe(false);
});

test("coverage threshold", () => {
  expect(COVERAGE_MIN).toBe(0.4);
  expect(MIN_VALUED_PLAYERS).toBe(100);
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL

- [ ] **Step 3: Implementação**

```ts
export const COVERAGE_MIN = 0.4;        // aprovado: era 0,6
export const MIN_VALUED_PLAYERS = 100;
export const YOUTH_CAP_MAX_AGE = 21;

/** Matched players of one league: the multiset of their current overalls, reassigned in level order. */
export function reorderLeague(players: { id: string; overall: number; level: number }[]): Map<string, number> {
  const targets = players.map((p) => p.overall).sort((a, b) => b - a);
  const order = [...players].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
  return new Map(order.map((p, i) => [p.id, targets[i]!]));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Unmatched players aged ≤ 21 rated above their club's matched median (after the reorder) come down to it.
 * `newOverall` holds the reordered targets of the matched players.
 */
export function youthCaps(
  players: { id: string; squadId: string; age: number; overall: number; matched: boolean }[],
  newOverall: Map<string, number>,
): Map<string, number> {
  const byClub = new Map<string, number[]>();
  for (const p of players) if (p.matched && newOverall.has(p.id)) byClub.set(p.squadId, [...(byClub.get(p.squadId) ?? []), newOverall.get(p.id)!]);
  const out = new Map<string, number>();
  for (const p of players) {
    if (p.matched || p.age > YOUTH_CAP_MAX_AGE) continue;
    const xs = byClub.get(p.squadId);
    if (!xs?.length) continue;
    const cap = median(xs);
    if (p.overall > cap) out.set(p.id, cap);
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(transfermarkt): reordenação por liga e teto dos jovens sem par"`

---

### Task 9: Atributos decimais na cadeia de dados

**Files:**
- Modify: `src/Domain/attributes.ts` (acrescentar `roundAttr`)
- Modify: `scripts/openfootball/derive.ts:148,163`, `scripts/espn/estimate.ts:43-50`, `scripts/espn/aging.ts:66-71`,
  `scripts/openfootball/recalibrate.ts:133-188`, `src/Domain/youth/youth.ts:63-69`,
  `src/Domain/retirement/retirement.ts:182`
- Test: `scripts/openfootball/derive.test.ts`, `scripts/curated/corrections.test.ts`, `src/Domain/youth/youth.test.ts`,
  `src/Domain/retirement/retirement.test.ts`, `scripts/openfootball/recalibrate.test.ts`

- [ ] **Step 1: Helper**

Em `src/Domain/attributes.ts`:

```ts
/** Attributes live on 0..10 with one decimal (shown ×10 as 0..100). */
export function roundAttr(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, Math.round(v * 10) / 10));
}

/** Display value 0..100 (integer) of an attribute. */
export function attrDisplay(v: number): number {
  return Math.round(roundAttr(v) * 10);
}
```

Teste em `src/Domain/attributes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { attrDisplay, roundAttr } from "@/Domain/attributes";

test("one decimal, clamped", () => {
  expect(roundAttr(5.04)).toBe(5);
  expect(roundAttr(5.06)).toBe(5.1);
  expect(roundAttr(-1)).toBe(0);
  expect(roundAttr(10.4)).toBe(10);
});
test("display ×10", () => {
  expect(attrDisplay(5)).toBe(50);
  expect(attrDisplay(6.27)).toBe(63);
});
```

- [ ] **Step 2: Trocar o arredondamento inteiro por `roundAttr`**

- `derive.ts`: `return clamp(Math.round(raw), 0, 10);` → `return roundAttr(raw);` (as duas funções).
- `estimate.ts`: `Math.max(0, Math.min(10, Math.floor(v + unitHash(...))))` → `roundAttr(v)`. Atualize o comentário
  da função: o arredondamento estocástico deixa de ser necessário, porque a casa decimal preserva o ajuste fracionário.
- `aging.ts`: o laço final vira `out[k] = roundAttr(x[k]!)`.
- `youth.ts`: `clamp(Math.floor(best[k] + unit(...)), 0, 10)` → `roundAttr(best[k])`. O teto de 2 para atributos sem
  peso continua.
- `retirement.ts`: `clamp(Math.floor(best[k] + unit(...)), 0, 10)` → `roundAttr(best[k])`.
- `recalibrate.ts` → `shiftToOverall`: troque o arredondamento estocástico por `roundAttr(continuous[k])`. Mantenha
  `repairRounding`, mas em passos de 0,1 (`for (const d of [-0.1, 0.1])`, `v = roundAttr(cur[k] + d)`) e com
  `REPAIR_TOLERANCE = 0.01`. Com décimos o erro já fica bem menor que 0,04; o reparo só fecha a última diferença.

Deixe os parâmetros `playerId`/`id` e as funções de hash (`unitHash`, `unit`) que ficarem sem uso: remova o import se
nada mais o usar, e mantenha a assinatura de `shiftToOverall` (os chamadores passam `playerId`).

- [ ] **Step 3: Atualizar os testes que travam inteiros**

`derive.test.ts:33,60-78`, `corrections.test.ts:70`, `youth.test.ts:9`, `retirement.test.ts:13` conferem
`Number.isInteger`. Troque pela checagem de uma casa:

```ts
const oneDecimal = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
expect(Object.values(stats).every(oneDecimal)).toBe(true);
```

No `recalibrate.test.ts`, se houver um teste de "erro do reparo ≤ 0,04", aperte para ≤ 0,02.

- [ ] **Step 4: Rodar**

Run: `bun test scripts/openfootball scripts/espn scripts/curated src/Domain/youth src/Domain/retirement src/Domain/attributes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** — `git commit -m "feat(attributes): atributos com uma casa decimal em toda a cadeia de dados"`

---

### Task 10: Evolução em passos de 0,1

**Files:**
- Modify: `src/GameEngine/PlayerDevelopment.ts`, `src/types/dayLogTypes.ts:56-60`
- Modify: `src/GameInterface/DevelopmentScreen.tsx:77-79` (usar a função exportada)
- Test: `src/GameEngine/PlayerDevelopment.test.ts` (crie se não existir)
- Create: `scripts/development-pace.ts` (medição antes/depois)

- [ ] **Step 1: Medir o ritmo atual antes de mudar**

```ts
/**
 * Development pace: average attribute change over 3 seasons for typical careers (young, peak, veteran).
 * Used to check the 0.1-step development keeps the old pace.
 *
 *   bun scripts/development-pace.ts
 */
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

const base = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 };
const mean = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;

for (const age of [18, 24, 31]) {
  let p = { id: `pace${age}`, name: "x", age, positions: ["CM"], stats: { ...base } } as unknown as RosterPlayer;
  const start = mean(p);
  for (let season = 0; season < 3; season++) {
    for (let m = 0; m < 38; m++) {
      p = applyDevelopment(p, m % 3 === 0 ? 7.2 : 6.4, DEFAULT_DP_WEIGHTS).updatedPlayer;
      p = applyTrainingDevelopment(p, "normal", DEFAULT_DP_WEIGHTS).updatedPlayer;
    }
  }
  console.log(`idade ${age}: média ${start.toFixed(2)} → ${mean(p).toFixed(2)} (Δ ${(mean(p) - start).toFixed(2)})`);
}
```

Run: `bun scripts/development-pace.ts` e guarde a saída (antes).

- [ ] **Step 2: Teste do comportamento novo**

```ts
import { expect, test } from "bun:test";
import { applyDevelopment, DEFAULT_DP_WEIGHTS, dpRequired } from "@/GameEngine/PlayerDevelopment";
import type { RosterPlayer } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3 };

test("a step costs a tenth of the old level cost", () => {
  expect(dpRequired(5)).toBeCloseTo((10 * (1 + 25 * 0.1)) / 10, 9);
});

test("changes are 0.1 steps and values keep one decimal", () => {
  const p = { id: "x", name: "x", age: 18, positions: ["CM"], stats } as unknown as RosterPlayer;
  const r = applyDevelopment(p, 8.6, DEFAULT_DP_WEIGHTS);
  for (const c of r.levelChanges?.changes ?? []) {
    expect(Math.abs(c.delta)).toBeCloseTo(0.1, 9);
    expect(Math.abs(c.newValue * 10 - Math.round(c.newValue * 10))).toBeLessThan(1e-9);
  }
  expect(r.levelChanges).not.toBeNull();
});
```

- [ ] **Step 3: Implementação**

Em `PlayerDevelopment.ts`:

```ts
export const ATTR_STEP = 0.1;

/** DP for one 0.1 step at `value` (a tenth of the old whole-point cost). */
export function dpRequired(value: number): number {
  return (BASE_COST * ATTR_STEP) * (1 + value * value * SCALE);
}
```

- Semente do progresso: hoje `dpRequired(v) * 0.5`, a metade do custo de um ponto inteiro. Para manter a mesma folga
  contra o declínio, a semente passa a ser `BASE_COST * (1 + v*v*SCALE) * 0.5`, o mesmo valor absoluto de antes. Use
  uma constante `SEED_DP(v)` com esse corpo.
- Nos laços de subir e descer: `stats[stat] = roundAttr(stats[stat] + ATTR_STEP)` (e `- ATTR_STEP`), e
  `statChanges.push({ stat, delta: ATTR_STEP, newValue: stats[stat] })` (negativo na descida). A descida devolve
  `dpRequired(stats[stat] - ATTR_STEP)`.
- `softCapFactor` continua no valor contínuo.
- Agregue as mudanças por atributo antes de devolver: uma sessão que sobe 0,3 vira uma entrada
  `{ stat, delta: 0.3, newValue }` (some os deltas por `stat` e arredonde com `roundAttr`; tire as entradas com delta 0).

Em `dayLogTypes.ts`: `delta: number;` com o comentário "soma do dia em décimos (0,1 = um ponto na tela)".

`DevelopmentScreen.tsx`: apague a cópia local de `dpRequired` e importe a de `@/GameEngine/PlayerDevelopment`.

- [ ] **Step 4: Rodar os testes e medir de novo**

Run: `bun test src/GameEngine/PlayerDevelopment.test.ts src/Domain/advanceDay` → PASS
Run: `bun scripts/development-pace.ts`. O Δ de cada idade deve ficar a ±15% do valor de antes. Com o mesmo DP o ritmo
esperado é igual: 10 passos de 0,1 custam o mesmo que um ponto. Se sair da faixa, investigue; não ajuste constantes
para compensar.

- [ ] **Step 5: Commit** — `git commit -m "feat(development): evolução em passos de 0,1 com o mesmo ritmo"`

---

### Task 11: Olheiro com décimos

**Files:**
- Modify: `src/Domain/scouting/seen.ts:45-48`, `src/Domain/scout/scoutQuery.ts:92-95,123-131`,
  `src/backend/scoutSearch.ts:101`, `src/GameInterface/Scout/ScoutAttributeFiltersDisclosure.tsx:31,42`
- Test: `src/Domain/scout/scoutSeen.test.ts`, `src/Domain/scout/*.test.ts`

- [ ] **Step 1: Faixa de atributo com uma casa**

`seenAttributeRange`: troque `Math.round(value ± noise)` por `roundAttr(value ± noise)`. O comentário passa a dizer
"uma casa decimal, 0..10".

- [ ] **Step 2: Filtros em décimos**

Em `scoutQuery.ts`, os filtros de atributo chegam da tela em 0..100 inteiros. Converta uma vez na entrada
(`min / 10`) e compare com o valor (ou o meio da faixa) em 0..10. Em `ScoutAttributeFiltersDisclosure.tsx` os
controles vão de 0 a 100 de 1 em 1, e o rótulo mostra o número ×10. Em `scoutSearch.ts:101` aplique a mesma
conversão, se ela arredonda.

- [ ] **Step 3: Testes**

Ajuste os testes do olheiro que esperam inteiros (`scoutSeen.test.ts`, `scoutQuery.test.ts`) para uma casa e para
filtros em 0..100. Acrescente:

```ts
test("attribute filter takes 0..100 and compares on 0..10", () => {
  // a row with passing 6.3 passes min 63 and fails min 64
});
```

Escreva o corpo com o helper de linha que esses testes já usam.

- [ ] **Step 4: Rodar** — `bun test src/Domain/scout src/Domain/scouting src/backend/scoutSearch.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(scouting): faixas e filtros de atributo em décimos (0–100 na tela)"`

---

### Task 12: Tela — atributos ×10 com cor por faixa

**Files:**
- Modify: `src/GameInterface/scoreColors.ts`
- Modify: `src/GameInterface/Components/AttributesPanel.tsx:28`, `src/GameInterface/Dashboard/PlayerCard.tsx:39-78`,
  `src/GameInterface/DevelopmentScreen.tsx`, `src/GameInterface/DaySummaryModal.tsx:405-428`, telas do olheiro que
  mostram faixa de atributo, mensagens de evolução da inbox
- Test: `src/GameInterface/scoreColors.test.ts` (novo)

- [ ] **Step 1: Teste da cor**

```ts
import { expect, test } from "bun:test";
import { attributeBand } from "@/GameInterface/scoreColors";

test("five bands on the 0..100 display value", () => {
  expect(attributeBand(39)).toBe("red");
  expect(attributeBand(40)).toBe("orange");
  expect(attributeBand(54)).toBe("orange");
  expect(attributeBand(55)).toBe("yellow");
  expect(attributeBand(69)).toBe("yellow");
  expect(attributeBand(70)).toBe("green");
  expect(attributeBand(84)).toBe("green");
  expect(attributeBand(85)).toBe("blue");
});
```

- [ ] **Step 2: Implementação**

```ts
export type AttributeBand = "red" | "orange" | "yellow" | "green" | "blue";

/** Band of an attribute's display value (0..100). The overall keeps the rating colours above. */
export function attributeBand(display: number): AttributeBand {
  if (display >= 85) return "blue";
  if (display >= 70) return "green";
  if (display >= 55) return "yellow";
  if (display >= 40) return "orange";
  return "red";
}

const BAND_TEXT: Record<AttributeBand, string> = {
  red: "text-red-400", orange: "text-orange-400", yellow: "text-yellow-300", green: "text-emerald-400", blue: "text-sky-400",
};
const BAND_BAR: Record<AttributeBand, string> = {
  red: "bg-red-500", orange: "bg-orange-500", yellow: "bg-yellow-400", green: "bg-emerald-500", blue: "bg-sky-500",
};

export function attributeTextClass(display: number): string { return BAND_TEXT[attributeBand(display)]; }
export function attributeBarClass(display: number): string { return BAND_BAR[attributeBand(display)]; }
```

- [ ] **Step 3: Trocar cada exibição de atributo**

Todo lugar que mostra um atributo passa a mostrar `attrDisplay(v)` com `attributeTextClass` (barras com
`attributeBarClass` e largura `display%`):
- ficha (`AttributesPanel`);
- cartão do jogador (`PlayerCard` → `StatBar`);
- Evolução (`DevelopmentScreen`): valor, progresso para o próximo ponto com o `dpRequired` exportado;
- faixa do olheiro: `attrDisplay(lo)–attrDisplay(hi)`, "?" igual a antes;
- resumo do dia (`DaySummaryModal`): "Velocidade 61 → 63", agrupado por jogador e atributo. A partir do `newValue`
  e do `delta` somado: `attrDisplay(newValue - delta) → attrDisplay(newValue)`;
- mensagens de evolução na inbox: o mesmo formato.

Ache os demais com `rg -n "stats\.(passing|vision|finishing|dribbling|speed|acceleration|tackling|pressing|stamina|heading|strength|reflex|jump)" src/GameInterface`
e `rg -n "toFixed\(|Math.round" src/GameInterface/Components/AttributesPanel.tsx src/GameInterface/Dashboard/PlayerCard.tsx`.
A nota geral (overall) não muda de escala nem de cor nesta etapa.

- [ ] **Step 4: Verificar**

Run: `bunx tsc --noEmit -p .`, `bun test src/GameInterface`, `bun run ui:audit --hard` (0 duras, 0 leves).
Suba o servidor de dev a partir de `C:\Projects\FMProject-recal` com dev-login
(`.claude/rules/dev-login.md`) e confira a ficha, o elenco, a Evolução, o olheiro e um resumo do dia. Pare só o
processo que você subiu (pelo PID).

- [ ] **Step 5: Commit** — `git commit -m "feat(ui): atributos de 0 a 100 com cor por faixa"`

---

### Task 13: Nascimento e altura no jogador (#94)

**Files:**
- Modify: `src/types/playerTypes.ts` (`RosterPlayer.birthDate?: string; heightCm?: number`)
- Modify: ficha do jogador (`src/GameInterface/PlayerScreen.tsx`, bloco de identidade)
- i18n: `player.birthDate`, `player.height` (en, pt-BR)

- [ ] **Step 1: Campos opcionais e exibição**

Os dois campos são opcionais e só aparecem quando existem. Data no formato da língua (`Intl.DateTimeFormat`).
Altura em cm (`184 cm`). Peso não existe no Transfermarkt e fica fora.

- [ ] **Step 2: Verificar** — `bunx tsc --noEmit -p .`, `bun run ui:audit --hard`
- [ ] **Step 3: Commit** — `git commit -m "feat(player): data de nascimento e altura na ficha (#94)"`

---

### Task 13b: Nacionalidade de quem não tem (#96)

2.368 jogadores do mundo (6,5%, sobretudo Série C, MLS, Championship) estão sem `nationality`: a ESPN criou o
jogador sem cidadania. O Transfermarkt traz a nacionalidade no elenco.

- `scripts/transfermarkt/api.ts`: `TmPlayer.nationality: string | null` (o primeiro item de `nationality`, se vier
  lista); teste no `api.test.ts`.
- Task 14: `derived.json` ganha `nationality` **só para casados que hoje não têm**, e só quando
  `nationalityFlagCode(nome)` (`src/Domain/world/nationalityFlag.ts`) resolve o nome do Transfermarkt. Nome que não
  resolve vai para o relatório ("nacionalidades sem bandeira"). Acrescente as grafias que faltarem ao mapa do
  `nationalityFlag.ts`, com teste.
- Task 15: `applyDerived` grava `nationality` quando o jogador não tem (nunca troca uma existente). Teste:
  `applyDerived({ ...p, nationality: undefined }, { nationality: "Cameroon" })` → `"Cameroon"`, e um jogador com
  nacionalidade não muda.
- Relatório da Task 14: quantos continuam sem nacionalidade por liga.

---

### Task 14: `derived.json` e relatório

**Precisa da busca da Task 4 completa.**

**Files:**
- Create: `scripts/buildMarketDerived.ts`
- Create: `data_process/transfermarkt/clubOverrides.json` (`{}`), `playerOverrides.json` (`{}`)

- [ ] **Step 1: Script**

Fluxo (puro onde der, E/S só aqui):
1. Lê `leagueMap.json`, os elencos de `src/example_data/squads/<liga>/*.json` e o cache.
2. Por liga mapeada:
   - `matchClubs` entre os clubes da pasta da liga e os clubes da competição;
   - para cada par, `matchPlayers` entre os jogadores do elenco e os do Transfermarkt;
   - guarda os casados com `{ id, squadId, league, age, line, value, tmPosition, birthDate, heightCm, overall }`
     (`overall` = `computeOverallAvg`; `line` = `getMainRole(tmPosition)` quando o Transfermarkt dá posição, senão
     `getMainRole(positions[0])`).
3. `fitEffects` sobre todos os casados com `value > 0`. `levelOf` para cada um.
4. Por liga: cobertura = casados com valor ÷ jogadores da liga. Com cobertura ≥ `COVERAGE_MIN` (40%) e pelo menos `MIN_VALUED_PLAYERS` (100) casados com valor: `reorderLeague` e
   `youthCaps`. Abaixo disso, nenhuma nota muda na liga.
5. Monta `derived.json`:

```json
{
  "players": {
    "<playerId>": { "targetOverall": 6.12, "naturalPosition": "RB", "birthDate": "2001-03-04", "heightCm": 184 }
  },
  "leagues": { "<slug>": { "players": 640, "matched": 512, "coverage": 0.8, "reordered": true } }
}
```

   Só os campos que existem. `targetOverall` arredondado a duas casas. **Nada de valor de mercado.**
6. Relatório no console:
   - cobertura por liga, ligas fora;
   - top 10 antes → depois de `premier_league`, `la_liga`, `brazil_serie_a` e do Flamengo;
   - trocas de posição natural (contagem por par `antes → depois`);
   - contagem por posição do Guarani antes e depois;
   - os 30 maiores saltos de nota (para conferir casamentos errados).

Use `stableStringify` (chaves ordenadas) para `derived.json` não mudar de ordem entre rodadas.

- [ ] **Step 2: Rodar, revisar e acrescentar exceções**

Run: `bun scripts/buildMarketDerived.ts`

Clube sem par que deveria casar vai para `clubOverrides.json` (`squadId → id do clube no Transfermarkt`). Um salto
absurdo (craque casado com um homônimo da base) vai para `playerOverrides.json` (id nosso → id do Transfermarkt, ou
`"none"` para impedir). Nesse caso, trate `"none"` em `matchPlayers`: o jogador fica sem par. Rode até o relatório
fazer sentido.

- [ ] **Step 3: Mostrar o relatório ao usuário e esperar a aprovação** (spec, seção 6). Não siga sem ela.

- [ ] **Step 4: Commit**

```bash
git add scripts/buildMarketDerived.ts data_process/transfermarkt/*.json
git commit -m "feat(transfermarkt): derived.json com nota-alvo, posição, nascimento e altura"
```

---

### Task 15: Aplicar ao mundo

**Files:**
- Create: `scripts/transfermarkt/apply.ts` (+ teste), `scripts/applyMarketRecalibration.ts`
- Modify: `.claude/rules/data/espn-import.md` (cadeia), `package.json` só se houver script novo

- [ ] **Step 1: Teste puro**

```ts
import { expect, test } from "bun:test";
import { applyDerived } from "@/../scripts/transfermarkt/apply";
import ROLES from "@/Data/roles.json";
import { computeOverallAvg, fixedNaturalRole } from "@/Domain/playerRating";
import type { RosterPlayer } from "@/types/playerTypes";

const p = { id: "x", name: "x", age: 25, positions: ["Defender"], preferredFoot: "right",
  stats: { passing: 5, vision: 5, finishing: 3, dribbling: 5, speed: 6, acceleration: 6, tackling: 6,
    pressing: 6, stamina: 6, heading: 6, strength: 6, reflex: 1, jump: 3 } } as unknown as RosterPlayer;

test("sets the natural position, line and target overall", () => {
  const r = applyDerived(p, { naturalPosition: "RB", targetOverall: 6.2, birthDate: "2001-01-01", heightCm: 180 }, ROLES as never);
  expect(fixedNaturalRole(r)).toBe("RB");
  expect(Math.abs(computeOverallAvg(r) - 6.2)).toBeLessThan(0.05);
  expect(r.birthDate).toBe("2001-01-01");
  expect(r.heightCm).toBe(180);
});

test("a Transfermarkt line different from positions[0] wins", () => {
  const r = applyDerived(p, { naturalPosition: "CM" }, ROLES as never);
  expect(r.positions[0]).toBe("Midfielder");
  expect(fixedNaturalRole(r)).toBe("CM");
});

test("idempotent", () => {
  const once = applyDerived(p, { naturalPosition: "RB", targetOverall: 6.2 }, ROLES as never);
  expect(applyDerived(once, { naturalPosition: "RB", targetOverall: 6.2 }, ROLES as never)).toEqual(once);
});
```

Confira em `src/types/playerTypes.ts` como `positions[0]` guarda a linha ("Defender" ou "CB") e use o mesmo formato
que o mundo usa.

- [ ] **Step 2: Implementação**

`applyDerived(player, entry, roles)`:
1. Se houver `naturalPosition`: grava `naturalPosition`; se `getMainRole(naturalPosition)` difere da linha de
   `positions[0]`, troca `positions[0]` pela linha nova (mesmo formato).
2. Se houver `targetOverall` e `|computeOverallAvg − alvo| > 0.05`: `shiftToOverall` com os pesos da posição natural
   (mesmo código de `applyCorrection` em `scripts/curated/corrections.ts`; extraia uma função comum
   `rescaleToOverall(player, target, roles)` lá e use nos dois).
3. Copia `birthDate`/`heightCm`.
4. Tira `overallAvg` se mudou algo.

`applyMarketRecalibration.ts`: mesmo esqueleto de `scripts/applyPlayerCorrections.ts` (checagem do `roles.json`,
leitura dos elencos, `formatLike`, grava só o que mudou), lendo `derived.json`. Imprime quantos jogadores mudaram por
liga. Id em `derived.json` que não existe no mundo: aviso, não erro (o mundo pode ter sido regenerado).

- [ ] **Step 3: Encaixar na cadeia**

Em `.claude/rules/data/espn-import.md` → "Regenerar", depois de `bun scripts/importEspn.ts`:

```bash
bun scripts/applyMarketRecalibration.ts   # notas e posições pelo valor de mercado (derived.json)
bun scripts/applyPlayerCorrections.ts     # correções manuais vencem
```

Acrescente uma seção "Recalibração pelo valor de mercado" curta: fonte, `derived.json`, como regenerar
(`fetchTransfermarkt` → `buildMarketDerived` → cadeia), o que nunca entra no repositório.

- [ ] **Step 4: Rodar a cadeia inteira**

Siga "Regenerar" de `espn-import.md` do `importOpenFootball` até os kits (`kits:generate 5` e cópia para
`src/example_data/startKits`). `checkWorldIntegrity` tem que passar.

Revise as `playerCorrections.json` (16 do São Paulo): depois da recalibração algumas podem não ser mais necessárias.
Mantenha as de posição; as de nota só se o relatório ainda mostrar o problema.

- [ ] **Step 5: Commit**

```bash
git add scripts/transfermarkt/apply.ts scripts/transfermarkt/apply.test.ts scripts/applyMarketRecalibration.ts \
  scripts/curated .claude/rules/data/espn-import.md src/example_data
git commit -m "feat(world): notas e posições recalibradas pelo valor de mercado, atributos com uma casa"
```

---

### Task 16: Valor de mercado no jogo

**Files:**
- Modify: `src/Domain/Player.ts:69-83`
- Create: `scripts/fitValueFormula.ts`

- [ ] **Step 1: Ajuste**

`fitValueFormula.ts` lê o cache e o mundo novo (os mesmos casados da Task 14) e ajusta, por mínimos quadrados em log,
`log(valor/1e6) = log(K) + E × log(nota) + log(fatorIdade[faixa])`. As faixas são as mesmas de `valueMillions`
(≤19, ≤21, ≤23, ≤25, ≤28, ≤30, ≤32, ≤34, >34), com a faixa ≤28 fixa em 1. O script imprime K, E e os nove fatores, o
erro mediano em log antes/depois e a mediana do valor do jogo ÷ real por liga grande.

- [ ] **Step 2: Aplicar só as constantes**

```ts
get valueMillions(): number {
  const base = VALUE_K * this.overallRating ** VALUE_EXP;
  return base * ageValueFactor(this.age);
}
```

`VALUE_K`, `VALUE_EXP` e a tabela de idade viram constantes nomeadas no topo de `Player.ts`, com o comentário da
medição. Arredonde os fatores a duas casas.

- [ ] **Step 3: Mercado da IA**

Run: `bun scripts/market-sim.ts 3` antes (main) e depois. Transferências com taxa e estados de contratação por tier
devem ficar dentro dos alvos de `.claude/rules/game/transfer-windows.md` → "Medição". Se o volume cair muito porque
as verbas não cobrem os preços novos, anote na regra e pergunte ao usuário antes de mexer em verbas.

- [ ] **Step 4: Testes** — `bun test src/Domain src/backend` (os testes que fixam preço vão mudar: atualize os
  números com cuidado, conferindo que a lógica testada continua a mesma).
- [ ] **Step 5: Commit** — `git commit -m "feat(market): fórmula de valor calibrada no valor real"`

---

### Task 17: Verificação do motor e documentação

- [ ] **Step 1: Gols e chutes**

Run: `bun scripts/ai-formation-goals.ts --engine 400 --modes ai` em `premier_league` e `brazil_serie_a`, antes (main)
e depois. Meta: ±5%. Se sair, documente na regra antes de mexer em qualquer constante.

- [ ] **Step 2: quickSim**

Run: `bun scripts/quicksim-spread.ts collect premier_league 100 2 <dir>/pl.json --fitness 88 --ai`, idem
`brazil_serie_a`, depois `analyze <dir>`. Meta: as duas a ±10%. Fora disso, recalibre seguindo
`.claude/rules/non-player-games.md` → "Como recalibrar".

- [ ] **Step 3: Suite e smoke**

Run: `bunx tsc --noEmit -p .`, `bun test`, `bun run ui:audit --hard`, `bun scripts/season-rollover-smoke.ts` (~15 min).

- [ ] **Step 4: Documentação**

- `.claude/rules/game/development.md`: passo de 0,1 e custo.
- `.claude/rules/game/positions.md`: `naturalPosition` vem do Transfermarkt para os casados.
- `.claude/rules/data/openfootball-import.md`: atributos com uma casa (o "arredondamento estocástico" e o
  `repairRounding` mudaram).
- `.claude/rules/game/scouting.md`: faixas com uma casa e filtros 0–100.
- `.claude/rules/game-engine/player-stats-usage.md`: escala 0,0–10,0 (tela 0–100).
- Changelog: entrada nova **4.5** (pt/en, texto de jogador): notas e posições revisadas com dados reais; atributos
  de 0 a 100 com cor; data de nascimento e altura na ficha. `package.json` igual.
- Comentário na #83 com o resumo e os números.

- [ ] **Step 5: Commit** — `git commit -m "docs: recalibração pelo valor de mercado e atributos 0–100"`

---

## Ordem e paralelismo

- A Task 4 (busca) roda em segundo plano assim que é escrita. As Tasks 5–13 não dependem dela.
- As Tasks 14–17 precisam da busca completa e são sequenciais.
- A Task 14 tem um ponto de parada: o usuário aprova o relatório antes da aplicação.
