# Open World — Plano 2: importador open-football

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar, a partir do `seed-real.json` do open-football, 75 ligas novas (60 países) no formato nativo do TouchLines, jogáveis e simuladas pelo quickSim, mantendo o `Continuar` abaixo de 2 s por dia.

**Architecture:** O importador é um script offline (`scripts/importOpenFootball.ts`) montado a partir de módulos puros e testados em `scripts/openfootball/`. Ele:
- calibra atributos e finanças contra os jogadores e clubes que existem nos dois datasets;
- grava squads, `leagueData.json`, `countries.json` e `leagueSchedules.json` em `src/example_data/`.

O jogo passa a ler o calendário de um JSON em vez do array em código. O avanço de dia ao vivo passa a usar o `BufferingSaveDAL` (já usado pelo gerador de kits), que lê e grava cada elenco uma vez por dia.

**Tech Stack:** Bun + TypeScript, `bun:test`, JSON.

**Spec:** `docs/superpowers/specs/2026-09-23-open-world-database-design.md`, seção 1. Pirâmide e acesso ficam no plano 3; telas no plano 4.

---

## Fatos do código que o plano assume

- O runtime lê de `src/Data/`, cópia gitignored de `src/example_data/` (README). Depois de gerar, sincronize com `cp -R src/example_data/. src/Data/`.
- **Uma liga só joga se estiver no calendário.** Só vira `activeLeagues` se estiver em `LEAGUE_SCHEDULE_CONFIGS` **e** em `leagueData.json` (`SaveService.createSave`, ~453).
- **Formato do elenco.** O squad é `squads/{liga}/{id}.json`, com arquivo = `id` = `standings[].squadId`. Nos standings, o `slug` é único na liga. Os ids de squad e de jogador devem ser únicos no mundo inteiro.
- **Posições.** Os elencos guardam só o papel principal em `positions[0]` (`GK` / `Defender` / `Midfielder` / `Forward`), com 13 atributos de 0 a 10.
- **Campos que ninguém lê:** `logo`, `apiId`, `code`, `money`, `finances.score`, `profile`, `fullName`.
- **Escudo ausente.** Sem arquivo em `Data/logos/{liga}/{slug}.(svg|png)`, o `ClubLogo` desenha o brasão com as cores. Não precisa de código novo.
- **O wizard junta ligas a países pelo nome.** `countries.json` é chaveado pelo nome do país (`"Brazil"`), e o wizard casa `leagueData[].country === country.name`. Só países `playable: true` são clicáveis.
- **Temporadas.** Ligas europeias usam `season: "2024-25"` e começam em 08-15. As de ano civil usam `season: "2025"` e começam em 02-05. Os startKits pré-simulam até 2025-02-05. **Toda liga de ano civil precisa começar em 02-05**, senão fica com rodadas passadas sem jogar.
- **Seed:** 91 ligas, das quais 82 têm 8 ou mais clubes. Tirando as 7 sobrepostas, sobram 75. Não há ids duplicados; os ids seguem `[a-z0-9-]+`. Posições `GK/DEF/MID/ATT`; pé `R/L/B`. Há clubes com só 7 jogadores.
- **Calibração viável.** O casamento por nome achou 2.873 pares de jogadores (correlação OVR × média de atributos entre 0,63 e 0,75) e 104 pares de clubes (reputação × log do orçamento: 0,79).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `data_process/openfootball/seed-real.json` | adicionar | Fonte (13,8 MB), copiada do SportsManagerInterativo |
| `data_process/openfootball/NOTICE.md` | criar | Atribuição e licença (Apache-2.0, projeto open-football) |
| `scripts/openfootball/types.ts` | criar | Tipos do seed |
| `scripts/openfootball/ids.ts` | criar | Normalização de nomes, ids, slugs, hash determinístico |
| `scripts/openfootball/roster.ts` | criar | Mapeamento de posição, corte de elenco, jovens de preenchimento |
| `scripts/openfootball/calibration.ts` | criar | Casamento seed↔TouchLines, regressões |
| `scripts/openfootball/derive.ts` | criar | Atributos, perfil, finanças, estádio, técnico |
| `scripts/openfootball/leagues.ts` | criar | Filtro de ligas, zonas, países, calendários |
| `scripts/openfootball/*.test.ts` | criar | Testes de cada módulo |
| `scripts/importOpenFootball.ts` | criar | CLI que orquestra e grava as saídas |
| `data_process/openfootball/calibration.json` | gerado | Coeficientes (auditáveis) |
| `src/example_data/leagueSchedules.json` | criar/gerado | Calendário de todas as ligas |
| `src/Domain/season/leagueScheduleConfig.ts` | modificar | Lê o JSON em vez do array |
| `src/example_data/{leagueData,countries,databases}.json` | gerado | Entradas novas |
| `src/example_data/squads/of_*/…` | gerado | Elencos novos |
| `src/backend/advanceDay.ts` | modificar | Rota ao vivo com `BufferingSaveDAL` por dia |
| `src/backend/dal/FileSystemDAL.ts` | modificar | Elenco gravado em JSON compacto |
| `scripts/bench-advance-day.ts` | criar | Mede o custo de um dia com o mundo inteiro |
| `src/example_data/startKits/*` | regenerado | Kits com as ligas novas |
| `.claude/rules/data/openfootball-import.md` | criar | Como regenerar os dados |

**Convenções de id (fixas):**
- liga = `of_` + slug do seed com `-` → `_` (ex.: `of_championship`);
- clube = `of_` + id do seed com `-` → `_` (ex.: `of_uy_albion`);
- jogador = `of_` + id do seed com `-` → `_`;
- `slug` do clube = id do clube, o que evita a leitura dupla em `getSquad`.

---

### Task 1: Trazer o seed para o repositório

**Files:**
- Create: `data_process/openfootball/seed-real.json` (cópia)
- Create: `data_process/openfootball/NOTICE.md`

- [ ] **Step 1: Copiar o seed**

Run:
```bash
mkdir -p data_process/openfootball
cp "C:/Users/ADMINI~1/AppData/Local/Temp/claude/C--projects-fmproject/4492b9da-b745-4e1b-830e-b456a14340d6/scratchpad/smi/src/data/seed-real.json" data_process/openfootball/seed-real.json
```
Se o clone do scratchpad não existir mais: `gh repo clone dw3st/SportsManagerInterativo <tmp> -- --depth 1` e copie `src/data/seed-real.json`.

Expected: arquivo com cerca de 13,8 MB; `python -c "import json;d=json.load(open('data_process/openfootball/seed-real.json',encoding='utf-8'));print(len(d['leagues']),len(d['clubs']),len(d['players']))"` imprime `91 1236 54423`.

- [ ] **Step 2: NOTICE**

```markdown
# open-football — atribuição

`seed-real.json` foi extraído do projeto **open-football** (https://github.com/ZOXEXIVO/open-football)
via SportsManagerInterativo (dw3st). Licença: Apache License 2.0.

Uso aqui: fonte de ligas, clubes e jogadores para `scripts/importOpenFootball.ts`. Os atributos do
TouchLines são **derivados** (calibrados contra os elencos da API-Football que o TouchLines já tem);
não são dados originais do open-football.
```

- [ ] **Step 3: Commit**

```bash
git add data_process/openfootball/seed-real.json data_process/openfootball/NOTICE.md
git commit -m "data: vendor open-football seed (91 leagues, 1236 clubs, 54k players)"
```

---

### Task 2: Tipos, ids e hash

**Files:**
- Create: `scripts/openfootball/types.ts`, `scripts/openfootball/ids.ts`
- Test: `scripts/openfootball/ids.test.ts`

- [ ] **Step 1: Tipos do seed**

```ts
// scripts/openfootball/types.ts
export interface SeedLeague {
  slug: string; name: string; country: string; countryName: string; tier: number; reputation: number;
}
export interface SeedClub {
  id: string; name: string; league: string; country: string; tier: number;
  attack: number; midfield: number; defense: number;
  colorBg?: string; colorFg?: string; reputation: number;
}
export interface SeedPlayer {
  id: string; name: string; position: "GK" | "DEF" | "MID" | "ATT";
  overall: number; potential: number; age: number; country: string;
  foot: "R" | "L" | "B"; value: number; clubId: string;
}
export interface Seed { version: number; leagues: SeedLeague[]; clubs: SeedClub[]; players: SeedPlayer[] }
```

- [ ] **Step 2: Testes**

```ts
// scripts/openfootball/ids.test.ts
import { describe, expect, test } from "bun:test";
import { clubId, gaussianFromKey, leagueSlug, normName, playerId, unitHash } from "@/../scripts/openfootball/ids";

describe("ids", () => {
  test("prefixo of_ e hífen vira underscore", () => {
    expect(leagueSlug("uruguayan-second-division")).toBe("of_uruguayan_second_division");
    expect(clubId("uy-albion")).toBe("of_uy_albion");
    expect(playerId("uy-albion-78066268")).toBe("of_uy_albion_78066268");
  });

  test("normName remove acento, caixa e pontuação", () => {
    expect(normName("José Álvarez")).toBe("jose alvarez");
    expect(normName("A. Bayındır")).toBe("a bayindir");
  });

  test("unitHash é determinístico e em [0,1)", () => {
    expect(unitHash("x")).toBe(unitHash("x"));
    expect(unitHash("x")).not.toBe(unitHash("y"));
    for (const k of ["a", "b", "c", "d"]) {
      expect(unitHash(k)).toBeGreaterThanOrEqual(0);
      expect(unitHash(k)).toBeLessThan(1);
    }
  });

  test("gaussianFromKey tem média ~0 e desvio ~1", () => {
    const xs = Array.from({ length: 5000 }, (_, i) => gaussianFromKey(`k${i}`));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });
});
```

O alias `@/` aponta para `src/`, então `@/../scripts/...` alcança `scripts/`. Se o Bun não resolver esse caminho, use o mesmo padrão que `scripts/quicksim-calibrate.ts` usa para importar módulos vizinhos (verifique antes). A regra "sem imports relativos" vale para `src/`; dentro de `scripts/openfootball/` o padrão do script existente prevalece.

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test scripts/openfootball/ids.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar**

```ts
// scripts/openfootball/ids.ts
const toId = (s: string) => `of_${s.replace(/-/g, "_")}`;
export const leagueSlug = (seedSlug: string) => toId(seedSlug);
export const clubId = (seedClubId: string) => toId(seedClubId);
export const playerId = (seedPlayerId: string) => toId(seedPlayerId);

export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a 32-bit → [0, 1). Deterministic per key. */
export function unitHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 4294967296;
}

/** Standard normal from a key (Box–Muller on two hashes). */
export function gaussianFromKey(key: string): number {
  const u1 = Math.max(unitHash(`${key}#1`), 1e-12);
  const u2 = unitHash(`${key}#2`);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test scripts/openfootball/ids.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add scripts/openfootball/types.ts scripts/openfootball/ids.ts scripts/openfootball/ids.test.ts
git commit -m "feat(import): seed types, ids and deterministic hash"
```

---

### Task 3: Elenco — posição, corte e preenchimento

**Files:**
- Create: `scripts/openfootball/roster.ts`
- Test: `scripts/openfootball/roster.test.ts`

Regras:
- `DEF`→`Defender`, `MID`→`Midfielder`, `ATT`→`Forward`, `GK`→`GK`.
- O elenco fica com no máximo **30** jogadores. Primeiro garante os mínimos por setor, `GK 3, Defender 7, Midfielder 7, Forward 4` (tier `low` do `sellList`), pegando os de maior OVR de cada setor; depois completa pelos maiores OVR restantes.
- Se o clube tiver menos de **18** jogadores, completa com jovens gerados até 18, priorizando os setores abaixo do mínimo.
- Os jovens têm OVR igual ao p25 do clube − 3, idade de 17 a 19 (determinística), pé direito e nome montado a partir do pool de primeiros e últimos nomes do **mesmo país** no seed. O id é `${clubSeedId}-youth-${n}`.

- [ ] **Step 1: Testes**

```ts
// scripts/openfootball/roster.test.ts
import { describe, expect, test } from "bun:test";
import { MAX_SQUAD, MIN_SQUAD, mainRole, trimAndFill } from "@/../scripts/openfootball/roster";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

function p(id: string, position: SeedPlayer["position"], overall: number): SeedPlayer {
  return { id, name: `Name ${id}`, position, overall, potential: overall, age: 25, country: "uy", foot: "R", value: 0, clubId: "c" };
}

const namePool = { first: ["Juan", "Diego", "Luis"], last: ["Pérez", "Suárez", "Gómez"] };

describe("mainRole", () => {
  test("mapeia posições do seed", () => {
    expect(mainRole("GK")).toBe("GK");
    expect(mainRole("DEF")).toBe("Defender");
    expect(mainRole("MID")).toBe("Midfielder");
    expect(mainRole("ATT")).toBe("Forward");
  });
});

describe("trimAndFill", () => {
  test("corta em 30 garantindo os mínimos por setor", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => p(`g${i}`, "GK", 50 + i)),
      ...Array.from({ length: 15 }, (_, i) => p(`d${i}`, "DEF", 60 + i)),
      ...Array.from({ length: 15 }, (_, i) => p(`m${i}`, "MID", 70 + i)),
      ...Array.from({ length: 10 }, (_, i) => p(`a${i}`, "ATT", 40 + i)),
    ];
    const out = trimAndFill(players, "c", namePool);
    expect(out.length).toBe(MAX_SQUAD);
    const count = (r: string) => out.filter((x) => mainRole(x.position) === r).length;
    expect(count("GK")).toBeGreaterThanOrEqual(3);
    expect(count("Defender")).toBeGreaterThanOrEqual(7);
    expect(count("Midfielder")).toBeGreaterThanOrEqual(7);
    expect(count("Forward")).toBeGreaterThanOrEqual(4);
    // O melhor goleiro está dentro
    expect(out.some((x) => x.id === "g4")).toBe(true);
  });

  test("clube pequeno é completado até 18 com jovens determinísticos", () => {
    const players = [p("g0", "GK", 60), p("d0", "DEF", 62), p("m0", "MID", 64), p("a0", "ATT", 66), p("d1", "DEF", 58), p("m1", "MID", 61), p("a1", "ATT", 59)];
    const a = trimAndFill(players, "c", namePool);
    const b = trimAndFill(players, "c", namePool);
    expect(a.length).toBe(MIN_SQUAD);
    expect(a).toEqual(b);
    const youth = a.filter((x) => x.id.startsWith("c-youth-"));
    expect(youth.length).toBe(MIN_SQUAD - players.length);
    for (const y of youth) {
      expect(y.age).toBeGreaterThanOrEqual(17);
      expect(y.age).toBeLessThanOrEqual(19);
      expect(y.name.split(" ").length).toBeGreaterThanOrEqual(2);
    }
    // Setores abaixo do mínimo recebem jovens primeiro: GK chega a 3
    expect(a.filter((x) => x.position === "GK").length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/openfootball/roster.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// scripts/openfootball/roster.ts
import type { SeedPlayer } from "@/../scripts/openfootball/types";
import { unitHash } from "@/../scripts/openfootball/ids";

export type MainRole = "GK" | "Defender" | "Midfielder" | "Forward";
export const MAX_SQUAD = 30;
export const MIN_SQUAD = 18;
export const MIN_BY_ROLE: Record<MainRole, number> = { GK: 3, Defender: 7, Midfielder: 7, Forward: 4 };
const SEED_POS: Record<MainRole, SeedPlayer["position"]> = { GK: "GK", Defender: "DEF", Midfielder: "MID", Forward: "ATT" };

export function mainRole(pos: SeedPlayer["position"]): MainRole {
  return pos === "GK" ? "GK" : pos === "DEF" ? "Defender" : pos === "MID" ? "Midfielder" : "Forward";
}

export interface NamePool { first: string[]; last: string[] }

const byOverallDesc = (a: SeedPlayer, b: SeedPlayer) => b.overall - a.overall || a.id.localeCompare(b.id);

function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 50;
}

export function trimAndFill(players: SeedPlayer[], clubSeedId: string, pool: NamePool): SeedPlayer[] {
  const chosen = new Set<SeedPlayer>();
  for (const role of Object.keys(MIN_BY_ROLE) as MainRole[]) {
    players.filter((x) => mainRole(x.position) === role).sort(byOverallDesc)
      .slice(0, MIN_BY_ROLE[role]).forEach((x) => chosen.add(x));
  }
  for (const x of [...players].sort(byOverallDesc)) {
    if (chosen.size >= MAX_SQUAD) break;
    chosen.add(x);
  }
  const out = [...chosen].sort(byOverallDesc);

  const youthOverall = Math.max(30, percentile(players.map((x) => x.overall), 0.25) - 3);
  let n = 0;
  while (out.length < MIN_SQUAD) {
    const short = (Object.keys(MIN_BY_ROLE) as MainRole[]).find(
      (r) => out.filter((x) => mainRole(x.position) === r).length < MIN_BY_ROLE[r],
    );
    const role: MainRole = short ?? (["Defender", "Midfielder", "Forward", "Midfielder"] as MainRole[])[n % 4]!;
    const key = `${clubSeedId}-youth-${n}`;
    const first = pool.first[Math.floor(unitHash(`${key}:f`) * pool.first.length)] ?? "Juan";
    const last = pool.last[Math.floor(unitHash(`${key}:l`) * pool.last.length)] ?? "Silva";
    out.push({
      id: key, name: `${first} ${last}`, position: SEED_POS[role], overall: youthOverall,
      potential: youthOverall, age: 17 + Math.floor(unitHash(`${key}:a`) * 3),
      country: players[0]?.country ?? "", foot: "R", value: 0, clubId: clubSeedId,
    });
    n++;
  }
  return out;
}

/** First/last-name pools per seed country code, from real seed names (≥ 2 tokens). */
export function buildNamePools(players: SeedPlayer[]): Map<string, NamePool> {
  const pools = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const x of players) {
    const parts = x.name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const e = pools.get(x.country) ?? { first: new Set(), last: new Set() };
    e.first.add(parts[0]!);
    e.last.add(parts[parts.length - 1]!);
    pools.set(x.country, e);
  }
  return new Map([...pools].map(([k, v]) => [k, { first: [...v.first].sort(), last: [...v.last].sort() }]));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/openfootball/roster.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add scripts/openfootball/roster.ts scripts/openfootball/roster.test.ts
git commit -m "feat(import): roster role mapping, trim and youth fill"
```

---

### Task 4: Calibração

**Files:**
- Create: `scripts/openfootball/calibration.ts`
- Test: `scripts/openfootball/calibration.test.ts`

Duas regressões:
- **Atributos:** para cada `(papel principal, atributo)`, ajustar `stat = a + b × OVR` por mínimos quadrados sobre os pares, guardando o desvio-padrão do resíduo `sd`. Um par é jogador do TouchLines ↔ jogador do seed no mesmo clube, casado por nome normalizado completo ou pelo último sobrenome, desde que ele seja único no clube.
- **Clube:** para cada campo de finanças (`budget`, `broadcasting`, `commercial`, `followers`) e para `venue.capacity`, ajustar `ln(y) = a + b × reputação do clube no seed`. Os pares de clube saem do casamento por nome normalizado, igual ou um contido no outro, dentro da liga sobreposta.

- [ ] **Step 1: Testes**

```ts
// scripts/openfootball/calibration.test.ts
import { describe, expect, test } from "bun:test";
import { fitLine, fitLogLine, matchClubs, matchPlayers } from "@/../scripts/openfootball/calibration";

describe("fitLine", () => {
  test("recupera reta exata com resíduo 0", () => {
    const f = fitLine([[50, 2], [60, 3], [70, 4], [80, 5]]);
    expect(f.a).toBeCloseTo(-3, 6);
    expect(f.b).toBeCloseTo(0.1, 6);
    expect(f.sd).toBeCloseTo(0, 6);
    expect(f.n).toBe(4);
  });
  test("com < 2 pontos distintos devolve b = 0 e a = média", () => {
    const f = fitLine([[60, 3], [60, 5]]);
    expect(f.b).toBe(0);
    expect(f.a).toBe(4);
  });
});

describe("fitLogLine", () => {
  test("ajusta ln(y) linear na reputação", () => {
    const pts: Array<[number, number]> = [[1000, Math.exp(10)], [2000, Math.exp(12)], [3000, Math.exp(14)]];
    const f = fitLogLine(pts);
    expect(f.b).toBeCloseTo(0.002, 6);
    expect(f.a).toBeCloseTo(8, 6);
  });
});

describe("matchClubs / matchPlayers", () => {
  test("casa clubes por nome normalizado (igual ou contido)", () => {
    const pairs = matchClubs(
      [{ id: "33", name: "Manchester United" }, { id: "34", name: "Newcastle" }],
      [{ id: "gb-man-utd", name: "Manchester United FC" }, { id: "gb-newcastle", name: "Newcastle United" }],
    );
    expect(pairs.get("33")).toBe("gb-man-utd");
    expect(pairs.get("34")).toBe("gb-newcastle");
  });
  test("casa jogadores por nome completo ou sobrenome único", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "B. Fernandes", fullName: "Bruno Miguel Borges Fernandes" }, { id: "t2", name: "A. Onana", fullName: "André Onana" }],
      [{ id: "s1", name: "Bruno Fernandes" }, { id: "s2", name: "André Onana" }, { id: "s3", name: "Luke Shaw" }],
    );
    expect(m.get("t1")).toBe("s1");
    expect(m.get("t2")).toBe("s2");
  });
  test("sobrenome ambíguo não casa", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "J. Silva", fullName: "João Silva" }],
      [{ id: "s1", name: "Pedro Silva" }, { id: "s2", name: "Marcos Silva" }],
    );
    expect(m.has("t1")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/openfootball/calibration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// scripts/openfootball/calibration.ts
import { normName } from "@/../scripts/openfootball/ids";

export interface LineFit { a: number; b: number; sd: number; n: number }

export function fitLine(points: Array<[number, number]>): LineFit {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const sd = Math.sqrt(points.reduce((s, [x, y]) => s + (y - (a + b * x)) ** 2, 0) / Math.max(1, n));
  return { a, b, sd, n };
}

export function fitLogLine(points: Array<[number, number]>): LineFit {
  return fitLine(points.filter(([, y]) => y > 0).map(([x, y]) => [x, Math.log(y)]));
}

export function matchClubs(
  tl: Array<{ id: string; name: string }>,
  seed: Array<{ id: string; name: string }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tl) {
    const tn = normName(t.name);
    const hit = seed.find((s) => normName(s.name) === tn)
      ?? seed.find((s) => { const sn = normName(s.name); return sn.includes(tn) || tn.includes(sn); });
    if (hit) out.set(t.id, hit.id);
  }
  return out;
}

const lastToken = (s: string) => s.split(" ").at(-1) ?? s;

export function matchPlayers(
  tl: Array<{ id: string; name: string; fullName?: string }>,
  seed: Array<{ id: string; name: string }>,
): Map<string, string> {
  const byFull = new Map(seed.map((s) => [normName(s.name), s.id]));
  const lastCount = new Map<string, number>();
  const byLast = new Map<string, string>();
  for (const s of seed) {
    const l = lastToken(normName(s.name));
    lastCount.set(l, (lastCount.get(l) ?? 0) + 1);
    byLast.set(l, s.id);
  }
  const out = new Map<string, string>();
  for (const t of tl) {
    const full = normName(t.fullName ?? t.name);
    const fullHit = byFull.get(full) ?? byFull.get(normName(t.name));
    if (fullHit) { out.set(t.id, fullHit); continue; }
    const l = lastToken(normName(t.name));
    if (lastCount.get(l) === 1) out.set(t.id, byLast.get(l)!);
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/openfootball/calibration.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add scripts/openfootball/calibration.ts scripts/openfootball/calibration.test.ts
git commit -m "feat(import): calibration fits and seed↔TouchLines matching"
```

---

### Task 5: Derivação de jogador e clube

**Files:**
- Create: `scripts/openfootball/derive.ts`
- Test: `scripts/openfootball/derive.test.ts`

Contratos:
- `derivePlayer(seedPlayer, squadId, coeffs)` devolve um `RosterPlayer` sem `seasonLog`, no formato dos elencos atuais:
  - `id` via `playerId()`;
  - `name`, `age`, `squadId`;
  - `preferredFoot` (`L` → `"left"`, os demais → `"right"`);
  - `positions: [mainRole]`;
  - `stats` com os 13 atributos: `clamp(round(a + b×OVR + sd×NOISE_SCALE×gaussianFromKey(\`${seedId}:${attr}\`)), 0, 10)`;
  - `profile: { archetype, summary }`.

  `NOISE_SCALE = 1`. Se um `(papel, atributo)` tiver `n < 30` pares, usa o ajuste do mesmo atributo com todos os papéis juntos.
- `profile` por template:
  - `archetype` vem de `ARCHETYPES[papel][atributo mais alto]`, com fallback para o nome genérico do papel;
  - `summary` é `"${adjetivo pelo OVR} ${papel em inglês minúsculo}, strongest at ${atributo}."`;
  - adjetivo: `≥ 80 "Elite"`, `≥ 70 "Solid"`, `≥ 60 "Capable"`, senão `"Developing"`.
- `deriveClubEconomy(reputation, fits)` devolve `{ finances: { broadcasting, commercial, total, budget, followers }, capacity }`. Cada campo é `round(exp(a + b×rep))`, com `total = broadcasting + commercial` e `capacity` limitado a `[3000, 90000]`.
- `coachName(clubSeedId, pool)` monta `"${first} ${last}"` pelo hash do id, com o pool do país.

- [ ] **Step 1: Testes**

```ts
// scripts/openfootball/derive.test.ts
import { describe, expect, test } from "bun:test";
import { STAT_KEYS, coachName, deriveClubEconomy, derivePlayer, type PlayerCoeffs } from "@/../scripts/openfootball/derive";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

const line = (a: number, b: number, sd = 0, n = 100) => ({ a, b, sd, n });
const coeffs: PlayerCoeffs = {
  byRole: {
    GK: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-2, 0.08)])),
    Defender: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.09)])),
    Midfielder: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.09)])),
    Forward: Object.fromEntries(STAT_KEYS.map((k) => [k, k === "finishing" ? line(-4, 0.12, 0, 5) : line(-3, 0.09)])),
  },
  pooled: Object.fromEntries(STAT_KEYS.map((k) => [k, line(-3, 0.1)])),
};

const seedP: SeedPlayer = { id: "uy-x-1", name: "Juan Pérez", position: "ATT", overall: 70, potential: 72, age: 24, country: "uy", foot: "L", value: 0, clubId: "uy-x" };

describe("derivePlayer", () => {
  test("formato do elenco do TouchLines", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs);
    expect(p.id).toBe("of_uy_x_1");
    expect(p.squadId).toBe("of_uy_x");
    expect(p.positions).toEqual(["Forward"]);
    expect(p.preferredFoot).toBe("left");
    expect(Object.keys(p.stats).sort()).toEqual([...STAT_KEYS].sort());
    for (const v of Object.values(p.stats)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(p.profile.archetype.length).toBeGreaterThan(0);
  });
  test("sem ruído (sd 0) segue a reta; n < 30 usa o ajuste agrupado", () => {
    const p = derivePlayer(seedP, "of_uy_x", coeffs);
    expect(p.stats.passing).toBe(Math.round(-3 + 0.09 * 70));   // 3
    expect(p.stats.finishing).toBe(Math.round(-3 + 0.1 * 70));  // pooled → 4
  });
  test("determinístico", () => {
    expect(derivePlayer(seedP, "s", coeffs)).toEqual(derivePlayer(seedP, "s", coeffs));
  });
});

describe("deriveClubEconomy / coachName", () => {
  test("exp da reta, total = broadcast + commercial, capacidade limitada", () => {
    const fits = {
      budget: line(10, 0.001), broadcasting: line(9, 0.001), commercial: line(9, 0.001),
      followers: line(8, 0.001), capacity: line(20, 0.01),
    };
    const e = deriveClubEconomy(2000, fits);
    expect(e.finances.budget).toBe(Math.round(Math.exp(12)));
    expect(e.finances.total).toBe(e.finances.broadcasting + e.finances.commercial);
    expect(e.capacity).toBe(90000);
  });
  test("coachName determinístico", () => {
    const pool = { first: ["Ana", "Rui"], last: ["Lopes", "Dias"] };
    expect(coachName("uy-x", pool)).toBe(coachName("uy-x", pool));
    expect(coachName("uy-x", pool).split(" ").length).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/openfootball/derive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// scripts/openfootball/derive.ts
import type { SeedPlayer } from "@/../scripts/openfootball/types";
import type { LineFit } from "@/../scripts/openfootball/calibration";
import { gaussianFromKey, playerId, unitHash } from "@/../scripts/openfootball/ids";
import { mainRole, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import type { RosterPlayer } from "@/types/playerTypes";

export const STAT_KEYS = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface PlayerCoeffs {
  byRole: Record<MainRole, Record<string, LineFit>>;
  pooled: Record<string, LineFit>;
}

export const NOISE_SCALE = 1;
export const MIN_PAIRS = 30;

const ARCHETYPES: Record<MainRole, Partial<Record<StatKey, string>> & { _: string }> = {
  GK:         { _: "Goalkeeper", reflex: "Shot-stopper", passing: "Sweeper-keeper", jump: "Commanding keeper" },
  Defender:   { _: "Defender", tackling: "Ball-winning defender", heading: "Aerial defender", speed: "Recovery defender", passing: "Ball-playing defender" },
  Midfielder: { _: "Midfielder", passing: "Playmaker", vision: "Deep-lying playmaker", tackling: "Ball-winning midfielder", stamina: "Box-to-box midfielder", dribbling: "Creative midfielder" },
  Forward:    { _: "Forward", finishing: "Poacher", speed: "Pacey forward", dribbling: "Inside forward", heading: "Target forward", strength: "Target forward" },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function derivePlayer(sp: SeedPlayer, squadId: string, coeffs: PlayerCoeffs): RosterPlayer {
  const role = mainRole(sp.position);
  const stats = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    const roleFit = coeffs.byRole[role]?.[k];
    const f = roleFit && roleFit.n >= MIN_PAIRS ? roleFit : coeffs.pooled[k]!;
    const raw = f.a + f.b * sp.overall + f.sd * NOISE_SCALE * gaussianFromKey(`${sp.id}:${k}`);
    stats[k] = clamp(Math.round(raw), 0, 10);
  }
  const top = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))[0]!;
  const adjective = sp.overall >= 80 ? "Elite" : sp.overall >= 70 ? "Solid" : sp.overall >= 60 ? "Capable" : "Developing";
  const roleWord = role === "GK" ? "goalkeeper" : role.toLowerCase();
  return {
    id: playerId(sp.id),
    name: sp.name,
    age: sp.age,
    squadId,
    preferredFoot: sp.foot === "L" ? "left" : "right",
    positions: [role],
    stats: stats as RosterPlayer["stats"],
    profile: {
      archetype: ARCHETYPES[role][top] ?? ARCHETYPES[role]._,
      summary: `${adjective} ${roleWord}, strongest at ${top}.`,
    },
  } as RosterPlayer;
}

export interface ClubFits { budget: LineFit; broadcasting: LineFit; commercial: LineFit; followers: LineFit; capacity: LineFit }

export function deriveClubEconomy(reputation: number, fits: ClubFits) {
  const v = (f: LineFit) => Math.round(Math.exp(f.a + f.b * reputation));
  const broadcasting = v(fits.broadcasting);
  const commercial = v(fits.commercial);
  return {
    finances: { broadcasting, commercial, total: broadcasting + commercial, budget: v(fits.budget), followers: v(fits.followers) },
    capacity: clamp(v(fits.capacity), 3000, 90000),
  };
}

export function coachName(clubSeedId: string, pool: NamePool): string {
  const first = pool.first[Math.floor(unitHash(`${clubSeedId}:coach:f`) * pool.first.length)] ?? "Carlos";
  const last = pool.last[Math.floor(unitHash(`${clubSeedId}:coach:l`) * pool.last.length)] ?? "Silva";
  return `${first} ${last}`;
}
```

Se `RosterPlayer` exigir campos que não estão aqui, rode `bun run typecheck` e confira `src/types/playerTypes.ts:75-91`. Adicione só o que for obrigatório, sem inventar valores.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/openfootball/derive.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add scripts/openfootball/derive.ts scripts/openfootball/derive.test.ts
git commit -m "feat(import): derive player attributes, profile, club economy, coach"
```

---

### Task 6: Ligas, zonas, países e calendário

**Files:**
- Create: `scripts/openfootball/leagues.ts`
- Test: `scripts/openfootball/leagues.test.ts`

Regras:
- **Ligas sobrepostas (ficam de fora):**

  | Slug no seed | Slug no TouchLines |
  |---|---|
  | `premier-league` | `premier_league` |
  | `bundesliga` | `bundesliga` |
  | `spanish-first-division` | `la_liga` |
  | `italian-serie-a` | `serie_a` |
  | `ligue-1` | `ligue_1` |
  | `brazilian-serie-a` | `brazil_serie_a` |
  | `brazilian-serie-b` | `brazil_serie_b` |

- **Descarte:** ligas com menos de 8 clubes.
- **Zonas** (só exibição; o plano 3 garante que os números batam):
  - Se o país tem um nível abaixo, a liga ganha `rel` com `fromEnd: n`, onde `n = clubes ≥ 16 ? 3 : 2`.
  - Se o país tem um nível acima, a liga ganha `prom` com `from: 1, to: n`.
  - Cores e rótulos iguais aos atuais: `{ id: "prom", label: "Promotion", color: "green" }` e `{ id: "rel", label: "Relegation", color: "red" }`.
  - O nível "acima" e "abaixo" considera também as ligas do TouchLines do mesmo país. Exemplo: Inglaterra tem `premier_league` no nível 1 e `of_championship` no nível 2, então a Championship ganha `prom`.
- **Calendário de ano civil:**
  - Países: `br, ar, cl, uy, py, pe, co, ve, us, jp, no, se, fi, is, kz, by`.
  - `seasonStartMMDD "02-05"`, `seasonEndMMDD "11-30"`, `crossYear false`, `season "2025"`.
  - Os demais países: `"08-15"`, `"05-17"`, `true`, `"2024-25"`.
  - `matchDays`: `[3, 6, 0]` se `rodadas = 2 × (clubes − 1 + clubes % 2) > 40`, senão `[6, 0]`.
  - `baseWeekOffset`: índice da liga dentro do país, módulo 5.
- **Países** (chave = `countryName` do seed):
  - `slug` = nome em minúsculas, com espaço virando `_`;
  - `flag`: `gb-eng` para `England`, senão o código ISO em minúsculas;
  - `iso2` em maiúsculas; `playable: true`; `continent` pela tabela `CONTINENT`;
  - `headline`: `"In {name}, every match writes a new story.</br>Build your club and take on the league."`.
  - Os 6 países que já existem passam a ter `playable: true` e ganham `continent`; `headline` e `flag` ficam como estão.

- [ ] **Step 1: Testes**

```ts
// scripts/openfootball/leagues.test.ts
import { describe, expect, test } from "bun:test";
import { CONTINENT, OVERLAP, buildCountryEntry, keptLeagues, scheduleFor, zonesFor } from "@/../scripts/openfootball/leagues";
import type { SeedLeague } from "@/../scripts/openfootball/types";

const L = (slug: string, country: string, tier: number, countryName = country): SeedLeague =>
  ({ slug, name: slug, country, countryName, tier, reputation: 1000 });

describe("keptLeagues", () => {
  test("descarta sobrepostas e < 8 clubes", () => {
    const leagues = [L("premier-league", "gb", 1), L("championship", "gb", 2), L("tiny", "lv", 1)];
    const counts = new Map([["premier-league", 18], ["championship", 19], ["tiny", 3]]);
    expect(keptLeagues(leagues, counts).map((l) => l.slug)).toEqual(["championship"]);
    expect(OVERLAP["premier-league"]).toBe("premier_league");
  });
});

describe("zonesFor", () => {
  test("nível do meio ganha prom e rel; topo sem nível abaixo não ganha nada", () => {
    expect(zonesFor({ clubs: 20, hasAbove: true, hasBelow: true })).toEqual([
      { id: "prom", label: "Promotion", color: "green", from: 1, to: 3 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 3 },
    ]);
    expect(zonesFor({ clubs: 12, hasAbove: false, hasBelow: true })).toEqual([
      { id: "rel", label: "Relegation", color: "red", fromEnd: 2 },
    ]);
    expect(zonesFor({ clubs: 12, hasAbove: false, hasBelow: false })).toEqual([]);
  });
});

describe("scheduleFor", () => {
  test("ano civil vs europeu, meio de semana em ligas longas", () => {
    expect(scheduleFor("of_x", "br", 20, 0)).toMatchObject({ seasonStartMMDD: "02-05", crossYear: false, matchDays: [6, 0] });
    expect(scheduleFor("of_y", "pt", 18, 1)).toMatchObject({ seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, baseWeekOffset: 1 });
    expect(scheduleFor("of_z", "us", 30, 7).matchDays).toEqual([3, 6, 0]);
    expect(scheduleFor("of_z", "us", 30, 7).baseWeekOffset).toBe(2);
  });
});

describe("buildCountryEntry / CONTINENT", () => {
  test("England usa gb-eng; demais código minúsculo", () => {
    expect(buildCountryEntry("gb", "England").flag).toBe("gb-eng");
    expect(buildCountryEntry("uy", "Uruguay")).toMatchObject({ slug: "uruguay", flag: "uy", iso2: "UY", playable: true, continent: "South America" });
    expect(buildCountryEntry("za", "South Africa").slug).toBe("south_africa");
  });
  test("todo país do seed com liga mantida tem continente", () => {
    for (const code of ["ae","al","am","ar","at","au","be","bg","br","by","ch","cl","cm","co","cy","cz","de","dk","dz","eg","es","fi","fj","fr","gb","ge","gh","gr","hr","hu","id","il","ir","is","it","jp","ke","kz","mt","mx","ng","nl","no","pe","pl","pt","py","rs","ru","sa","se","si","sk","tr","ua","us","uy","uz","ve","za"]) {
      expect(CONTINENT[code]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/openfootball/leagues.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// scripts/openfootball/leagues.ts
import type { SeedLeague } from "@/../scripts/openfootball/types";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";

export const MIN_CLUBS = 8;

export const OVERLAP: Record<string, string> = {
  "premier-league": "premier_league",
  "bundesliga": "bundesliga",
  "spanish-first-division": "la_liga",
  "italian-serie-a": "serie_a",
  "ligue-1": "ligue_1",
  "brazilian-serie-a": "brazil_serie_a",
  "brazilian-serie-b": "brazil_serie_b",
};

export const CALENDAR_YEAR = new Set(["br", "ar", "cl", "uy", "py", "pe", "co", "ve", "us", "jp", "no", "se", "fi", "is", "kz", "by"]);

export const CONTINENT: Record<string, string> = {
  al: "Europe", am: "Europe", at: "Europe", be: "Europe", bg: "Europe", by: "Europe", ch: "Europe", cy: "Europe",
  cz: "Europe", de: "Europe", dk: "Europe", es: "Europe", fi: "Europe", fr: "Europe", gb: "Europe", ge: "Europe",
  gr: "Europe", hr: "Europe", hu: "Europe", is: "Europe", it: "Europe", mt: "Europe", nl: "Europe", no: "Europe",
  pl: "Europe", pt: "Europe", rs: "Europe", ru: "Europe", se: "Europe", si: "Europe", sk: "Europe", tr: "Europe",
  ua: "Europe", kz: "Asia", il: "Asia",
  ar: "South America", br: "South America", cl: "South America", co: "South America", pe: "South America",
  py: "South America", uy: "South America", ve: "South America",
  us: "North America", mx: "North America",
  ae: "Asia", id: "Asia", ir: "Asia", jp: "Asia", sa: "Asia", uz: "Asia",
  au: "Oceania", fj: "Oceania",
  cm: "Africa", dz: "Africa", eg: "Africa", gh: "Africa", ke: "Africa", ng: "Africa", za: "Africa",
};

export function keptLeagues(leagues: SeedLeague[], clubCounts: Map<string, number>): SeedLeague[] {
  return leagues.filter((l) => !(l.slug in OVERLAP) && (clubCounts.get(l.slug) ?? 0) >= MIN_CLUBS);
}

export interface Zone { id: string; label: string; color: string; from?: number; to?: number; fromEnd?: number }

export function zonesFor(o: { clubs: number; hasAbove: boolean; hasBelow: boolean }): Zone[] {
  const n = o.clubs >= 16 ? 3 : 2;
  const zones: Zone[] = [];
  if (o.hasAbove) zones.push({ id: "prom", label: "Promotion", color: "green", from: 1, to: n });
  if (o.hasBelow) zones.push({ id: "rel", label: "Relegation", color: "red", fromEnd: n });
  return zones;
}

export function scheduleFor(slug: string, countryCode: string, clubs: number, indexInCountry: number): LeagueScheduleConfig {
  const rounds = 2 * (clubs - 1 + (clubs % 2));
  const calendarYear = CALENDAR_YEAR.has(countryCode);
  return {
    slug,
    seasonStartMMDD: calendarYear ? "02-05" : "08-15",
    seasonEndMMDD: calendarYear ? "11-30" : "05-17",
    crossYear: !calendarYear,
    matchDays: rounds > 40 ? [3, 6, 0] : [6, 0],
    baseWeekOffset: indexInCountry % 5,
  };
}

export const seasonLabel = (countryCode: string) => (CALENDAR_YEAR.has(countryCode) ? "2025" : "2024-25");

export function buildCountryEntry(code: string, name: string) {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    flag: code === "gb" && name === "England" ? "gb-eng" : code,
    iso2: code.toUpperCase(),
    playable: true,
    continent: CONTINENT[code] ?? "Other",
    headline: `In ${name}, every match writes a new story.</br>Build your club and take on the league.`,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/openfootball/leagues.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add scripts/openfootball/leagues.ts scripts/openfootball/leagues.test.ts
git commit -m "feat(import): league filter, zones, schedules and countries"
```

---

### Task 7: Calendário lido do JSON

**Files:**
- Create: `src/example_data/leagueSchedules.json`
- Modify: `src/Domain/season/leagueScheduleConfig.ts:15-24`
- Test: `src/Domain/season/leagueScheduleConfig.test.ts`

- [ ] **Step 1: Criar o JSON com as 8 ligas atuais**

Copie o conteúdo de `LEAGUE_SCHEDULE_CONFIGS`, as 8 entradas de `leagueScheduleConfig.ts:16-23`, verbatim, para `src/example_data/leagueSchedules.json` como array JSON. Depois sincronize: `cp src/example_data/leagueSchedules.json src/Data/`.

- [ ] **Step 2: Teste**

```ts
// src/Domain/season/leagueScheduleConfig.test.ts
import { describe, expect, test } from "bun:test";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";

describe("LEAGUE_SCHEDULE_CONFIGS", () => {
  test("carrega do JSON com as ligas originais", () => {
    const slugs = LEAGUE_SCHEDULE_CONFIGS.map((c) => c.slug);
    for (const s of ["premier_league", "bundesliga", "la_liga", "serie_a", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]) {
      expect(slugs).toContain(s);
    }
  });
  test("slugs únicos e campos válidos", () => {
    const slugs = LEAGUE_SCHEDULE_CONFIGS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of LEAGUE_SCHEDULE_CONFIGS) {
      expect(c.seasonStartMMDD).toMatch(/^\d{2}-\d{2}$/);
      expect(c.seasonEndMMDD).toMatch(/^\d{2}-\d{2}$/);
      expect(c.matchDays.length).toBeGreaterThan(0);
    }
  });
  test("ligas de ano civil começam em 02-05 (alinhado aos startKits)", () => {
    for (const c of LEAGUE_SCHEDULE_CONFIGS.filter((c) => !c.crossYear)) expect(c.seasonStartMMDD).toBe("02-05");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test src/Domain/season/leagueScheduleConfig.test.ts`
Expected: os 3 testes passam com o array antigo. Isso é esperado, porque o teste protege o comportamento durante a troca. Siga para a troca.

- [ ] **Step 4: Trocar o array pelo JSON**

Em `leagueScheduleConfig.ts`, substitua o array literal por:

```ts
import leagueSchedules from "@/Data/leagueSchedules.json";

/** Loaded from Data/leagueSchedules.json (generated by scripts/importOpenFootball.ts). */
export const LEAGUE_SCHEDULE_CONFIGS: LeagueScheduleConfig[] = leagueSchedules as LeagueScheduleConfig[];
```

A interface, `leagueSeasonStart` e `leagueSeasonEnd` continuam iguais.

- [ ] **Step 5: Rodar tudo**

Run: `bun test && bun run typecheck` (compare o typecheck com a baseline).
Expected: os 3 testes novos passam; nenhuma regressão.

- [ ] **Step 6: Commit**

```bash
git add src/example_data/leagueSchedules.json src/Domain/season/leagueScheduleConfig.ts src/Domain/season/leagueScheduleConfig.test.ts
git commit -m "refactor: league schedules loaded from JSON"
```

---

### Task 8: CLI do importador + geração dos dados

**Files:**
- Create: `scripts/importOpenFootball.ts`
- Generated: `src/example_data/squads/of_*/…`, `leagueData.json`, `countries.json`, `leagueSchedules.json`, `databases.json`, `data_process/openfootball/calibration.json`

O CLI usa só os módulos das Tasks 2 a 6 e segue esta ordem:

1. **Carregar** `data_process/openfootball/seed-real.json` e os elencos atuais de `src/example_data/squads/{premier_league,bundesliga,la_liga,serie_a,ligue_1,brazil_serie_a}/*.json`. Ignore arquivos com `source === "open-football"`. Use `fileURLToPath(new URL(..., import.meta.url))`, porque o `.pathname` quebra no Windows.
2. **Calibrar.**
   - Para cada liga sobreposta, faça `matchClubs(elencos TL, clubes do seed da liga OVERLAP correspondente)`. Em cada par de clubes, faça `matchPlayers`.
   - Para cada par de jogadores `(tl, seed)`, acumule pontos `(seed.overall, tl.stats[k])` por `tl.positions[0]` e por atributo, além de um conjunto agrupado.
   - Ajuste com `fitLine` para obter `PlayerCoeffs`.
   - Para os clubes, acumule `(seedClub.reputation, valor)` de `finances.budget / broadcasting / commercial / followers` e `venue.capacity`. Ajuste com `fitLogLine` para obter `ClubFits`.
   - Grave tudo em `data_process/openfootball/calibration.json` com `n` e `sd`, e imprima a quantidade de pares.
3. **Limpar execuções anteriores (idempotência).**
   - Apague as pastas `src/example_data/squads/of_*`.
   - Remova de `leagueData.json` e de `leagueSchedules.json` as entradas com `slug` começando por `of_`.
   - Em `countries.json`, remova os países com `source === "open-football"`.
4. **Gerar as ligas.** Para cada `keptLeagues(...)`, em ordem de país e depois de nível:
   - Os clubes da liga são todos os do seed com `league === slug`. O elenco de cada um é `trimAndFill(jogadores do clube, club.id, pool do país)` e depois `derivePlayer(…, clubId(club.id), coeffs)`.
   - Escreva o squad com `id` e `slug` iguais a `clubId(club.id)`, `name`, `colors` (`[colorBg, colorFg]`; se faltarem, `["#555555", "#FFFFFF"]`), `country: countryName` e `venue: { name: \`${name} Stadium\`, city: null, capacity, surface: "grass" }`.
   - O `coach` recebe `{ id, name: coachName(...), firstname: null, lastname: null, age: null, nationality: null, points: 0 }`, onde `id = Math.floor(unitHash(club.id) * 1e9)`. As finanças vêm de `deriveClubEconomy`. Inclua `source: "open-football"` e os `players`.
   - Grave em **JSON compacto** (`JSON.stringify(squad)`), em `src/example_data/squads/{leagueSlug}/{clubId}.json`.
   - Acrescente ao `leagueData.json`: `{ slug, name, country: countryName, iso2, season: seasonLabel(code), zones, standings, source: "open-football" }`. As `zones` vêm de `zonesFor`; para calcular `hasAbove` e `hasBelow`, considere o nível das ligas mantidas **e** das ligas do TouchLines do mesmo país (tabela do Step 5 abaixo). Os `standings` são `[{ squadId, slug, name, colors, country }]`.
   - Acrescente `scheduleFor(...)` ao `leagueSchedules.json`.
5. **Níveis das ligas existentes do TouchLines**, para as zonas: `premier_league` (gb, 1), `bundesliga` (de, 1), `la_liga` (es, 1), `serie_a` (it, 1), `ligue_1` (fr, 1), `brazil_serie_a` (br, 1), `brazil_serie_b` (br, 2), `brazil_serie_c` (br, 3). As zonas das 8 ligas do TouchLines **não mudam** neste plano.
6. **Países.** Mescle em `countries.json`: os 6 existentes ganham `playable: true` e `continent`. Os novos saem de `buildCountryEntry` com `source: "open-football"`. Mantenha a chave pelo nome.
7. **`databases.json`.** Atualize os contadores do banco `official-2024`: `countries`, `playableCountries`, `leagues`, `playableLeagues` e `players` a partir do mundo resultante (8 ligas atuais + as novas).
8. **Resumo.** Imprima ligas, clubes, jogadores, jovens gerados, a faixa de OVR e a média dos 13 atributos por papel nas ligas novas, e a mesma média nas ligas do TouchLines, para comparar.

- [ ] **Step 1: Implementar o CLI** conforme a lista acima. Nenhuma lógica nova fora dos módulos: o CLI só lê, chama e grava.

- [ ] **Step 2: Rodar**

Run: `bun scripts/importOpenFootball.ts`
Expected:
- 75 ligas, cerca de 1.000 clubes e cerca de 25.000 jogadores;
- pares de jogadores ≥ 2.500 e pares de clubes ≥ 90;
- a média de atributos por papel nas ligas novas fica **abaixo** da média das ligas do TouchLines, porque o seed tem ligas menores.

Rode duas vezes seguidas e confirme que `git status --short src/example_data | wc -l` é igual nas duas, o que prova a idempotência.

- [ ] **Step 3: Checagens de sanidade**

```bash
python -c "import json;d=json.load(open('src/example_data/leagueData.json',encoding='utf-8'));print(len(d))"          # 83
python -c "import json;d=json.load(open('src/example_data/leagueSchedules.json',encoding='utf-8'));print(len(d))"     # 83
ls src/example_data/squads | wc -l                                                                                      # 83
```

Confira também:
- todo `standings[].squadId` tem o arquivo correspondente;
- nenhum id de squad nem de jogador se repete no mundo;
- todo `leagueData[].country` existe como chave em `countries.json`.

Escreva esses três checks como um bloco `if (...) throw` no fim do CLI, e não como script separado.

- [ ] **Step 4: Sincronizar e rodar a suíte**

Run: `cp -R src/example_data/. src/Data/ && bun test`
Expected: sem regressões.

- [ ] **Step 5: Commit (código e dados em commits separados)**

```bash
git add scripts/importOpenFootball.ts
git commit -m "feat(import): importOpenFootball CLI"
git add data_process/openfootball/calibration.json src/example_data/leagueData.json src/example_data/leagueSchedules.json src/example_data/countries.json src/example_data/databases.json src/example_data/squads
git commit -m "data: import 75 open-football leagues"
```

---

### Task 9: Medir o custo de um dia

**Files:**
- Create: `scripts/bench-advance-day.ts`

Script:
1. Cria um save pela mesma API do wizard: `SaveService.createSave(...)` numa carreira na `premier_league` com o primeiro clube.
2. Aplica `applyRandomStartKit`/`presimulate`, se aplicável.
3. Avança **14 dias** chamando `advanceOneDay(saveService, id)` exatamente como a rota ao vivo (`advanceDay.ts` ~797), com `FileSystemDAL` sem buffer.
4. Imprime, por dia, o tempo em ms, o número de partidas (full × fast) e a quantidade de squads lidos e gravados. Para contar, embrulhe o DAL num proxy de contagem **dentro do script**.
5. No fim, apaga o save. `RUNTIME_DATA_DIR` usa `new URL(...).pathname`; se isso falhar no Windows, rode com `RUNTIME_DATA_DIR=C:/projects/fmproject/src/Data`.

- [ ] **Step 1: Implementar e rodar**

Run: `bun scripts/bench-advance-day.ts`
Expected: uma tabela com os 14 dias e as médias de ms por dia, com e sem rodada. Anote os números no relatório.

- [ ] **Step 2: Commit**

```bash
git add scripts/bench-advance-day.ts
git commit -m "chore: bench advance-day with the full world"
```

---

### Task 10: Buffer por dia na rota ao vivo + JSON compacto

**Files:**
- Modify: `src/backend/advanceDay.ts` (rota que chama `advanceOneDay(saveService, …)`, ~797)
- Modify: `src/backend/dal/FileSystemDAL.ts:156` (`writeSquad`)

- [ ] **Step 1: Rota com buffer**

Na rota `POST /api/saves/:saveId/advance-day`, troque:

```ts
    const outcome = await advanceOneDay(saveService, req.params.saveId!, playedMatchOverride);
```

por:

```ts
    // One buffered unit of work per day: each squad is read at most once and written once.
    const buffer = new BufferingSaveDAL(new FileSystemDAL());
    const dayService = new SaveService(buffer);
    const outcome = await advanceOneDay(dayService, req.params.saveId!, playedMatchOverride);
    if (outcome.ok) await buffer.flush();
```

Confira se `BufferingSaveDAL`, `FileSystemDAL` e `SaveService` já estão importados no arquivo (o `presimulatePreStart` usa os três). Se o dia falhar (`!outcome.ok`), nada é gravado, e esse é o comportamento desejado.

- [ ] **Step 2: JSON compacto para elencos**

Em `FileSystemDAL.ts:156`, troque `JSON.stringify(squad, null, 2)` por `JSON.stringify(squad)`. Os demais arquivos, que são pequenos, continuam formatados.

- [ ] **Step 3: Medir de novo**

Run: `bun scripts/bench-advance-day.ts`. Adicione ao script uma opção `--buffered` que envolve cada dia no mesmo buffer da rota.
Expected: tabela antes × depois. **Meta: < 2 s por dia com rodada.**

Se a meta não for atingida, **não otimize mais nada nesta task**. Reporte os números com o perfil de onde o tempo vai (squads lidos e gravados, partidas, mercado) para uma decisão separada.

- [ ] **Step 4: Suíte e commit**

Run: `bun test && bun run typecheck`, comparando com a baseline.

```bash
git add src/backend/advanceDay.ts src/backend/dal/FileSystemDAL.ts scripts/bench-advance-day.ts
git commit -m "perf: buffer live advance-day per day + compact squad JSON"
```

---

### Task 11: Regenerar os startKits

**Files:**
- Regenerated: `src/example_data/startKits/*`

- [ ] **Step 1: Gerar**

Run: `cp -R src/example_data/. src/Data/ && bun run kits:generate 5`
O gerador lê de `src/Data` e grava em `src/Data/startKits`. Confira no script onde ele grava, e copie o resultado para `src/example_data/startKits/`.

Expected:
- 5 kits;
- os manifests listam as ligas europeias novas em `leaguesCaughtUp`;
- cada kit tem cerca de 1.000 squads ou mais.

Anote o tempo total e o tamanho de cada `.json.gz`.

- [ ] **Step 2: Conferir**

Crie uma carreira no Brasileirão pelo `bench-advance-day.ts` (ou por um script curto) e confirme que as ligas europeias novas já têm rodadas jogadas na data inicial.

- [ ] **Step 3: Commit**

```bash
git add src/example_data/startKits
git commit -m "data: regenerate start kits with the open-football world"
```

---

### Task 12: Documentação

**Files:**
- Create: `.claude/rules/data/openfootball-import.md`
- Modify: `README.md` (seção de dados, perto da linha 47)

- [ ] **Step 1: Regra**

Conteúdo em português:
- **O que é o importador** e a convenção de ids `of_*`.
- **Como regenerar:** `bun scripts/importOpenFootball.ts`, depois `cp -R src/example_data/. src/Data/`, depois `bun run kits:generate 5`, e por fim copiar os kits de volta.
- **Regras de calendário:** ano civil em 02-05 e europeu em 08-15, e o motivo (startKits).
- **Calibração:** onde fica `calibration.json`; os atributos são derivados, não originais.
- **Limitações:** clubes sem escudo (usam o brasão das cores); jovens gerados em clubes com menos de 18 jogadores; `ScoutScreen` carrega todos os elencos (`/api/saves/:id/all-squads`), o que fica pesado com ~1.000 clubes e está anotado para o plano 4.
- **Números do bench** da Task 10.

- [ ] **Step 2: README** — uma linha apontando para a regra e para o NOTICE do open-football.

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/data/openfootball-import.md README.md
git commit -m "docs: open-football import"
```

---

## Verificação final

- [ ] `bun test`: tudo passa, exceto o `budgetTierFromTransferBudget`, que já falhava antes.
- [ ] `bun run typecheck`: nenhum erro novo em relação à baseline.
- [ ] Importador idempotente: duas execuções seguidas não geram diff.
- [ ] Bench: dia com rodada abaixo de 2 s, ou números reportados se não atingir.
- [ ] Carreira nova na Premier League: a Championship e as ligas novas jogam no `Continuar`, e a Classificação mostra os placares.
- [ ] Carreira nova no Brasileirão: o kit aplica, e as ligas europeias novas chegam com rodadas jogadas.
