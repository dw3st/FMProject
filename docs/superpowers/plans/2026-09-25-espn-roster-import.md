# Importador de elencos da ESPN — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o mundo 2024/25 pelo de 2026/27, com elencos, composições de liga e escudos da API pública da ESPN nas 34 ligas cobertas.

**Architecture:** `fetchEspn.ts` (único passo com rede) grava um snapshot versionado em `data_process/espn/`. `importEspn.ts` roda depois do `importOpenFootball.ts`, lê o snapshot e o mundo gerado em `src/example_data`, e aplica o overlay por uma função pura (`applyEspn`) composta de módulos pequenos em `scripts/espn/`. Os elencos nativos passam a ter uma fonte própria em `data_process/native/`, para a cadeia inteira poder ser regenerada do zero.

**Tech Stack:** Bun + TypeScript, `bun test`, `curl` (o `fetch` do Bun falha contra a ESPN no Windows).

**Spec:** `docs/superpowers/specs/2026-09-25-espn-roster-import-design.md`

**Branch:** `feat/espn-import` (já criada). Imports sempre com `@/` (ex.: `@/../scripts/espn/normalize`), nunca relativos.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `data_process/native/squads/{8 ligas nativas}/` | Criar (cópia) | Fonte dos elencos nativos |
| `data_process/native/{leagueData,leagueSchedules,countries}.json` | Criar | Entradas nativas (fonte) |
| `scripts/world/types.ts` | Criar | Tipos do mundo em disco (liga, linha da tabela, squad) |
| `scripts/world/integrity.ts` | Criar | Checagem de integridade compartilhada pelos dois importadores |
| `scripts/importOpenFootball.ts` | Modificar | Lê nativos de `data_process/native`, regrava `squads/` do zero, usa `integrity.ts` |
| `scripts/openfootball/derive.ts` | Modificar | Exporta `playerProfile` |
| `src/Domain/Player.ts` | Modificar | `Player.bestSpecificRole` |
| `scripts/espn/types.ts` | Criar | Tipos do snapshot e do mapa de ligas |
| `scripts/espn/normalize.ts` | Criar | Chaves normalizadas de clube e jogador |
| `scripts/espn/matchClubs.ts` | Criar | Clube ESPN → squadId |
| `scripts/espn/matchPlayers.ts` | Criar | Jogador ESPN → jogador do mundo |
| `scripts/espn/lineup.ts` | Criar | Nova composição das ligas, movimentos e saídas |
| `scripts/espn/aging.ts` | Criar | Curva de idade |
| `scripts/espn/estimate.ts` | Criar | Medianas, jogadores novos, jovens, corte do elenco |
| `scripts/espn/logos.ts` | Criar | Índice de escudos |
| `scripts/espn/apply.ts` | Criar | `applyEspn`: orquestração pura |
| `scripts/espn/fixtures.ts` | Criar | Mundo e snapshot de teste |
| `scripts/fetchEspn.ts` | Criar | Download do snapshot e dos escudos |
| `scripts/importEspn.ts` | Criar | IO: lê, aplica, grava, checa, imprime relatório |
| `data_process/espn/{leagueMap,clubOverrides,playerOverrides}.json` | Criar | Configuração |
| `src/Domain/world/logos.ts` | Criar | `logoUrlFromIndex` (puro) |
| `src/GameInterface/Components/ClubLogo.tsx` | Modificar | `squadLogoUrl` usa o índice |
| `src/i18n/locales/{en,pt-BR}.json` | Modificar | Nome da database 2026/27 |
| `.claude/rules/data/espn-import.md` | Criar | Regra do importador |
| `.claude/rules/data/openfootball-import.md`, `.claude/rules/ui-world.md` | Modificar | Apontar para o novo fluxo |

---

### Task 1: Fonte separada para os dados nativos

Hoje o `importOpenFootball` lê os elencos nativos do próprio `src/example_data` e só apaga `of_*`. Depois do overlay da ESPN (clubes nativos que mudam de pasta, jogadores envelhecidos), rodar a cadeia de novo estragaria o mundo. Os nativos passam a vir de `data_process/native/`, e o `src/example_data/squads` vira saída pura.

**Files:**
- Create: `data_process/native/` (cópia)
- Create: `scripts/world/types.ts`, `scripts/world/integrity.ts`
- Modify: `scripts/importOpenFootball.ts`

- [ ] **Step 1: Copiar os nativos para a fonte**

Rode com o `src/example_data` ainda no estado do `main` (mundo 2024/25):

```bash
mkdir -p data_process/native/squads
for l in premier_league bundesliga la_liga serie_a ligue_1 brazil_serie_a brazil_serie_b brazil_serie_c; do
  cp -R src/example_data/squads/$l data_process/native/squads/$l
done
bun -e '
import { formatSchedules } from "@/../scripts/openfootball/leagues";
const isOF = (x) => x.slug?.startsWith("of_") || x.source === "open-football";
const ld = await Bun.file("src/example_data/leagueData.json").json();
await Bun.write("data_process/native/leagueData.json", JSON.stringify(ld.filter((l) => !isOF(l)), null, 2) + "\n");
const sc = await Bun.file("src/example_data/leagueSchedules.json").json();
await Bun.write("data_process/native/leagueSchedules.json", formatSchedules(sc.filter((s) => !isOF(s))));
const co = await Bun.file("src/example_data/countries.json").json();
await Bun.write("data_process/native/countries.json", JSON.stringify(Object.fromEntries(Object.entries(co).filter(([, c]) => c.source !== "open-football")), null, 4) + "\n");
'
ls data_process/native data_process/native/squads
```

Esperado: `countries.json leagueData.json leagueSchedules.json squads` e as 8 pastas de liga.

- [ ] **Step 2: Criar `scripts/world/types.ts`**

```ts
import type { Zone } from "@/../scripts/openfootball/leagues";
import type { ClubFinances, RosterPlayer } from "@/types/playerTypes";

/** One row of a league's `standings` in leagueData.json. */
export interface StandingRow {
  squadId: string;
  slug: string;
  name: string;
  colors: [string, string];
  country?: string;
  logo?: string;
}

/** One entry of leagueData.json. Unknown fields are kept as they are. */
export interface LeagueEntry extends Record<string, unknown> {
  slug: string;
  name: string;
  country: string;
  iso2?: string;
  season: string;
  zones?: Zone[];
  standings: StandingRow[];
  source?: string;
}

/** A squad file (squads/{league}/{id}.json). Unknown fields are kept as they are. */
export interface SquadFile extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  colors: [string, string];
  country?: string;
  source?: string;
  venue?: { name: string; city: string | null; capacity: number; surface: string };
  coach?: { id: number; name: string } & Record<string, unknown>;
  finances?: ClubFinances & { score?: number };
  players: Array<RosterPlayer & { fullName?: string }>;
}
```

- [ ] **Step 3: Criar `scripts/world/integrity.ts`**

Extraído literalmente do bloco "Integrity checks" do `importOpenFootball.ts`. A única diferença é o predicado `mayHaveHandZones`, que substitui o teste `l.source === SOURCE` (liga fora de pirâmide que pode ter zonas escritas à mão).

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pyramidGroupOf } from "@/../scripts/openfootball/pyramid";
import type { LeagueEntry, SquadFile } from "@/../scripts/world/types";
import type { Pyramids } from "@/types/pyramidTypes";

export interface IntegrityInput {
  leagueData: LeagueEntry[];
  schedules: Array<{ slug: string }>;
  countries: Record<string, { flag?: unknown; continent?: unknown }>;
  pyramids: Pyramids;
  squadsDir: string;
  /** True for a league that may keep hand-written prom/rel zones while its country has no pyramid. */
  mayHaveHandZones: (l: LeagueEntry) => boolean;
}

/** Throws on the first inconsistency. Returns world totals. */
export function checkWorldIntegrity(w: IntegrityInput): { squads: number; players: number } {
  const squadIds = new Set<string>();
  const playerIds = new Set<string>();
  let players = 0;
  for (const l of w.leagueData) {
    for (const st of l.standings) {
      if (!existsSync(join(w.squadsDir, l.slug, `${st.squadId}.json`)))
        throw new Error(`integrity: ${l.slug} standings squadId ${st.squadId} has no file`);
    }
    for (const f of readdirSync(join(w.squadsDir, l.slug)).sort()) {
      const s = JSON.parse(readFileSync(join(w.squadsDir, l.slug, f), "utf-8")) as SquadFile;
      if (squadIds.has(s.id)) throw new Error(`integrity: duplicate squad id ${s.id}`);
      squadIds.add(s.id);
      for (const p of s.players) {
        if (playerIds.has(p.id)) throw new Error(`integrity: duplicate player id ${p.id} (${l.slug}/${s.id})`);
        playerIds.add(p.id);
      }
      players += s.players.length;
    }
    if (!w.countries[l.country]) throw new Error(`integrity: league ${l.slug} country ${l.country} missing from countries.json`);
    if (!w.schedules.some((s) => s.slug === l.slug)) throw new Error(`integrity: league ${l.slug} has no schedule in leagueSchedules.json`);

    const clubs = l.standings.length;
    const zones = (l.zones ?? []) as Array<{ id: string; from?: number; to?: number; fromEnd?: number }>;
    let lastTop = 0;
    let firstBottom = clubs + 1;
    for (const z of zones) {
      if (z.fromEnd !== undefined) {
        if (!Number.isInteger(z.fromEnd) || z.fromEnd < 1 || z.fromEnd > clubs)
          throw new Error(`integrity: ${l.slug} zone ${z.id} fromEnd ${z.fromEnd} outside 1..${clubs}`);
        firstBottom = Math.min(firstBottom, clubs - z.fromEnd + 1);
      } else {
        const { from, to } = z;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 1 || to! < from! || to! > clubs)
          throw new Error(`integrity: ${l.slug} zone ${z.id} range ${from}..${to} outside 1..${clubs}`);
        lastTop = Math.max(lastTop, to!);
      }
    }
    if (lastTop >= firstBottom)
      throw new Error(`integrity: ${l.slug} top zones reach ${lastTop} but bottom zones start at ${firstBottom} (${clubs} clubs)`);

    const g = pyramidGroupOf(w.pyramids, l.slug);
    const prom = zones.filter((z) => z.id === "prom");
    const rel = zones.filter((z) => z.id === "rel");
    if (g) {
      const promOk = g.promote > 0 ? prom.length === 1 && prom[0]!.from === 1 && prom[0]!.to === g.promote : prom.length === 0;
      const relOk = g.relegate > 0 ? rel.length === 1 && rel[0]!.fromEnd === g.relegate : rel.length === 0;
      if (!promOk || !relOk) throw new Error(`integrity: ${l.slug} prom/rel zones differ from pyramid (${g.promote}/${g.relegate})`);
    } else if (!w.mayHaveHandZones(l) && (prom.length || rel.length)) {
      throw new Error(`integrity: ${l.slug} has prom/rel zones but its country has no pyramid`);
    }
  }
  for (const p of Object.values(w.pyramids)) {
    for (let i = 0; i + 1 < p.levels.length; i++) {
      const down = p.levels[i]!.groups.reduce((s, g) => s + g.relegate, 0);
      const up = p.levels[i + 1]!.groups.reduce((s, g) => s + g.promote, 0);
      if (down !== up) throw new Error(`integrity: ${p.country} tier ${p.levels[i]!.tier} relegates ${down} but tier ${p.levels[i + 1]!.tier} promotes ${up}`);
      for (const g of p.levels[i + 1]!.groups)
        if (!w.leagueData.some((l) => l.slug === g.leagueSlug)) throw new Error(`integrity: pyramid group ${g.leagueSlug} has no league`);
    }
  }
  for (const [name, c] of Object.entries(w.countries)) {
    if (typeof c.flag !== "string" || c.flag === "") throw new Error(`integrity: country ${name} has no flag`);
    if (typeof c.continent !== "string" || c.continent === "") throw new Error(`integrity: country ${name} has no continent`);
  }
  return { squads: squadIds.size, players };
}
```

- [ ] **Step 4: Ajustar o `importOpenFootball.ts`**

4a. Imports e constantes (topo do arquivo): troque a linha do `node:fs` e acrescente `NATIVE` e o import da integridade.

```ts
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
```
```ts
const NATIVE = join(ROOT, "data_process", "native");
```
```ts
import { checkWorldIntegrity } from "@/../scripts/world/integrity";
```

4b. `readTLSquads` passa a ler da fonte nativa:

```ts
function readTLSquads(league: string): TLSquad[] {
  const dir = join(NATIVE, "squads", league);
  return sortedDir(dir).filter((f) => f.endsWith(".json"))
    .map((f) => readJson<TLSquad>(join(dir, f)))
    .filter((s) => s.source !== SOURCE);
}
```

4c. Seção "3. Clean previous runs": apague tudo e copie os nativos; leia as entradas nativas da fonte.

```ts
// ── 3. Clean previous runs ──────────────────────────────────────────────────
// src/example_data/squads is pure output: wipe it and start from the native sources.
for (const d of sortedDir(SQUADS)) rmSync(join(SQUADS, d), { recursive: true, force: true });
cpSync(join(NATIVE, "squads"), SQUADS, { recursive: true });
const isOF = (x: { slug: string; source?: string }) => x.slug.startsWith("of_") || x.source === SOURCE;
type LeagueEntry = { slug: string; country: string; source?: string; zones?: Zone[]; standings: Array<{ squadId: string }> } & Record<string, unknown>;
type CountryEntry = { slug: string; name: string; iso2: string; source?: string; headline: string } & Record<string, unknown>;
const leagueData = readJson<LeagueEntry[]>(join(NATIVE, "leagueData.json")).filter((l) => !isOF(l));
const schedules = readJson<Array<LeagueScheduleConfig & { source?: string }>>(join(NATIVE, "leagueSchedules.json")).filter((s) => !isOF(s));
const countriesIn = readJson<Record<string, CountryEntry>>(join(NATIVE, "countries.json"));
```

4d. Troque o bloco inteiro de "Integrity checks (also collect world totals)" até o fim do laço dos países (o `for (const [name, c] of Object.entries(countries))`) por:

```ts
const totals = checkWorldIntegrity({
  leagueData: leagueData as unknown as import("@/../scripts/world/types").LeagueEntry[],
  schedules, countries, pyramids, squadsDir: SQUADS,
  mayHaveHandZones: (l) => l.source !== SOURCE,
});
const worldPlayers = totals.players;
const squadIds = { size: totals.squads };
```

(`worldPlayers` e `squadIds.size` continuam sendo usados no `databases.json` e no resumo final.)

- [ ] **Step 5: Verificar que a saída é idêntica**

```bash
bun scripts/importOpenFootball.ts | tail -3
git status --porcelain src/example_data data_process/openfootball
```

Esperado: termina com `integrity checks passed`; o `git status` **não lista nada** (a saída é byte a byte a mesma). Se algum arquivo aparecer, rode `git diff --stat` nele e corrija antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add data_process/native scripts/world scripts/importOpenFootball.ts
git commit -m "refactor(import): native squads get their own source under data_process/native

src/example_data/squads is now pure importer output, so the open-football + ESPN
chain can be regenerated from scratch. Integrity checks move to scripts/world.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `Player.bestSpecificRole` e `playerProfile`

**Files:**
- Modify: `src/Domain/Player.ts`
- Modify: `scripts/openfootball/derive.ts`
- Test: `src/Domain/Player.test.ts` (novo), `scripts/openfootball/derive.test.ts`

- [ ] **Step 1: Teste que falha (`src/Domain/Player.test.ts`)**

```ts
import { describe, expect, test } from "bun:test";
import { Player } from "@/Domain/Player";
import type { PlayerStatsRecord } from "@/types/playerTypes";

const stats = (over: Partial<PlayerStatsRecord>): PlayerStatsRecord => ({
  passing: 3, vision: 3, finishing: 3, dribbling: 3, speed: 3, acceleration: 3, tackling: 3,
  pressing: 3, stamina: 3, heading: 3, strength: 3, reflex: 1, jump: 1, ...over,
});

describe("Player.bestSpecificRole", () => {
  test("GK is always GK", () => {
    expect(Player.bestSpecificRole(stats({ reflex: 8 }), "GK")).toBe("GK");
  });
  test("a finisher forward fits ST", () => {
    expect(Player.bestSpecificRole(stats({ finishing: 9, heading: 8, strength: 8 }), "Forward")).toBe("ST");
  });
  test("accepts a detailed position and searches its main role", () => {
    const r = Player.bestSpecificRole(stats({ tackling: 9, heading: 9 }), "LB");
    expect(["CB", "LB", "RB", "LWB", "RWB"]).toContain(r);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test src/Domain/Player.test.ts`
Esperado: FAIL com `Player.bestSpecificRole is not a function`.

- [ ] **Step 3: Implementar em `src/Domain/Player.ts`** (logo depois de `weightedScore`)

```ts
  /** Specific role (e.g. "ST", "CB") with the best weighted score inside `position`'s main role. */
  static bestSpecificRole(stats: PlayerStatsRecord, position: string): string {
    const specifics = MAIN_ROLE_TO_SPECIFICS[getMainRole(position)];
    let best = specifics[0]!;
    let bestScore = -1;
    for (const role of specifics) {
      const s = Player.scoreForRole(stats, role);
      if (s > bestScore) { bestScore = s; best = role; }
    }
    return best;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test src/Domain/Player.test.ts`
Esperado: 3 pass.

- [ ] **Step 5: Extrair `playerProfile` em `derive.ts`**

Acrescente em `scripts/openfootball/derive.ts`, antes de `derivePlayer`:

```ts
/** Archetype from the strongest stat, and a one-line summary ("Solid defender, strongest at tackling."). */
export function playerProfile(role: MainRole, stats: PlayerStatsRecord, adjective: string): RosterPlayer["profile"] {
  const top = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))[0]!;
  const roleWord = role === "GK" ? "goalkeeper" : role.toLowerCase();
  return { archetype: ARCHETYPES[role][top] ?? ARCHETYPES[role]._, summary: `${adjective} ${roleWord}, strongest at ${top}.` };
}
```

E dentro de `derivePlayer`, troque as linhas de `top`, `adjective`, `roleWord` e o campo `profile` por:

```ts
  const adjective = sp.overall >= 80 ? "Elite" : sp.overall >= 70 ? "Solid" : sp.overall >= 60 ? "Capable" : "Developing";
```
```ts
    profile: playerProfile(role, stats, adjective),
```

- [ ] **Step 6: Teste de `playerProfile` em `scripts/openfootball/derive.test.ts`**

Acrescente ao arquivo (e `playerProfile` ao import de `derive`):

```ts
test("playerProfile names the archetype of the strongest stat", () => {
  const s = { passing: 9, vision: 2, finishing: 1, dribbling: 3, speed: 3, acceleration: 3, tackling: 3,
    pressing: 3, stamina: 3, heading: 3, strength: 3, reflex: 0, jump: 0 };
  expect(playerProfile("Midfielder", s, "Solid")).toEqual({ archetype: "Playmaker", summary: "Solid midfielder, strongest at passing." });
});
```

- [ ] **Step 7: Testes e saída idêntica do importador**

```bash
bun test scripts/openfootball src/Domain/Player.test.ts
bun scripts/importOpenFootball.ts | tail -1
git status --porcelain src/example_data
```

Esperado: todos passam; `integrity checks passed`; `git status` vazio.

- [ ] **Step 8: Commit**

```bash
git add src/Domain/Player.ts src/Domain/Player.test.ts scripts/openfootball/derive.ts scripts/openfootball/derive.test.ts
git commit -m "refactor: expose Player.bestSpecificRole and derive.playerProfile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tipos do snapshot e normalização

**Files:**
- Create: `scripts/espn/types.ts`, `scripts/espn/normalize.ts`
- Test: `scripts/espn/normalize.test.ts`

- [ ] **Step 1: Criar `scripts/espn/types.ts`**

```ts
export type EspnPos = "G" | "D" | "M" | "F";

export interface EspnAthlete {
  id: string;
  displayName: string;
  fullName: string;
  age: number | null;
  position: EspnPos | null;
  /** Country name as ESPN writes it ("England", "Brazil"). */
  citizenship: string | null;
}

export interface EspnTeam {
  id: string;
  name: string;
  shortName: string;
  /** City / location label ("Birmingham City", "Manchester"). */
  location: string;
  /** Hex without '#', or null. */
  color: string | null;
  altColor: string | null;
  /** File name under data_process/espn/logos/, or null when the download failed. */
  logoFile: string | null;
  coach: string | null;
  athletes: EspnAthlete[];
}

export interface EspnLeague {
  /** Our leagueData slug. */
  slug: string;
  /** ESPN league code ("eng.1"). */
  code: string;
  name: string;
  /** ESPN season label ("2026-27 English Premier League"). */
  season: string;
  teams: EspnTeam[];
}

export interface EspnSnapshot { fetchedAt: string; leagues: EspnLeague[] }

export interface LeagueMapEntry { slug: string; code: string }
```

- [ ] **Step 2: Teste que falha (`scripts/espn/normalize.test.ts`)**

```ts
import { describe, expect, test } from "bun:test";
import { clubKey, looseClubKey, playerKey } from "@/../scripts/espn/normalize";

describe("clubKey", () => {
  test("drops club-type tokens and accents", () => {
    expect(clubKey("AFC Bournemouth")).toBe("bournemouth");
    expect(clubKey("São Paulo FC")).toBe("sao paulo");
    expect(clubKey("Brighton & Hove Albion")).toBe("brighton hove albion");
  });
  test("keeps City / United in the strict key", () => {
    expect(clubKey("Manchester City")).toBe("manchester city");
  });
});

describe("looseClubKey", () => {
  test("also drops common suffixes", () => {
    expect(looseClubKey("Newcastle United")).toBe("newcastle");
    expect(looseClubKey("Tottenham Hotspur")).toBe("tottenham");
    expect(looseClubKey("Brighton & Hove Albion")).toBe("brighton hove");
  });
});

describe("playerKey", () => {
  test("transliterates and lowercases", () => {
    expect(playerKey("Martin Ødegaard")).toBe("martin odegaard");
    expect(playerKey("  Vinícius   Júnior ")).toBe("vinicius junior");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test scripts/espn/normalize.test.ts`
Esperado: FAIL, módulo `normalize` não existe.

- [ ] **Step 4: Criar `scripts/espn/normalize.ts`**

```ts
import { normName } from "@/../scripts/openfootball/ids";

/** Club-type tokens that never tell two clubs apart. */
const CLUB_NOISE = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "ca", "club", "sk", "fk", "bk", "if", "ssc", "sv", "as", "us",
  "sd", "ud", "rc", "rcd", "cr", "se", "ec", "the", "futbol", "football", "calcio", "clube",
]);
/** Suffixes dropped only by the loose key (a match on it must still be unique). */
const LOOSE_NOISE = new Set(["city", "united", "town", "wanderers", "rovers", "county", "albion", "hotspur"]);

const tokens = (s: string) => normName(s).split(" ").filter((t) => t.length > 0);

export function clubKey(name: string): string {
  return tokens(name).filter((t) => !CLUB_NOISE.has(t)).join(" ");
}

export function looseClubKey(name: string): string {
  return clubKey(name).split(" ").filter((t) => t && !LOOSE_NOISE.has(t)).join(" ");
}

export function playerKey(name: string): string {
  return normName(name);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test scripts/espn/normalize.test.ts`
Esperado: todos passam.

- [ ] **Step 6: Commit**

```bash
git add scripts/espn/types.ts scripts/espn/normalize.ts scripts/espn/normalize.test.ts
git commit -m "feat(espn): snapshot types and name normalization

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Correspondência de clubes

**Files:**
- Create: `scripts/espn/matchClubs.ts`
- Test: `scripts/espn/matchClubs.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { matchClubs, type EspnClubRef, type WorldClubRef } from "@/../scripts/espn/matchClubs";

const world: WorldClubRef[] = [
  { id: "33", name: "Manchester United", country: "England" },
  { id: "50", name: "Manchester City", country: "England" },
  { id: "47", name: "Tottenham", country: "England" },
  { id: "39", name: "Wolves", country: "England" },
  { id: "of_gb_coventry_city", name: "Coventry City", country: "England" },
  { id: "of_es_coventry", name: "Coventry City", country: "Spain" },
];
const team = (espnId: string, name: string, country = "England"): EspnClubRef => ({ espnId, name, shortName: name, country });

describe("matchClubs", () => {
  test("override, exact, loose and new", () => {
    const m = matchClubs(
      [team("1", "Manchester United"), team("2", "Tottenham Hotspur"), team("3", "Wolverhampton Wanderers"),
       team("4", "Coventry City"), team("5", "Hull City")],
      world, { "3": "39" },
    );
    expect(m.get("1")).toEqual({ squadId: "33", via: "exact" });
    expect(m.get("2")).toEqual({ squadId: "47", via: "loose" });
    expect(m.get("3")).toEqual({ squadId: "39", via: "override" });
    expect(m.get("4")).toEqual({ squadId: "of_gb_coventry_city", via: "exact" });
    expect(m.get("5")).toEqual({ squadId: null, via: "new" });
  });

  test("never matches across countries", () => {
    const m = matchClubs([team("9", "Coventry City", "Spain")], world, {});
    expect(m.get("9")!.squadId).toBe("of_es_coventry");
  });

  test("ambiguous loose key does not match", () => {
    const m = matchClubs([team("7", "Manchester")], world, {});
    expect(m.get("7")).toEqual({ squadId: null, via: "new" });
  });

  test("two ESPN clubs on the same squad throws", () => {
    expect(() => matchClubs([team("1", "Everton"), team("2", "Everton FC")], [{ id: "e", name: "Everton", country: "England" }], {}))
      .toThrow(/both match/);
  });

  test("override to an unknown squad throws", () => {
    expect(() => matchClubs([team("1", "X")], world, { "1": "nope" })).toThrow(/unknown squad/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/matchClubs.test.ts`
Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar `scripts/espn/matchClubs.ts`**

```ts
import { clubKey, looseClubKey } from "@/../scripts/espn/normalize";

export interface WorldClubRef { id: string; name: string; country: string }
export interface EspnClubRef { espnId: string; name: string; shortName: string; country: string }
export interface ClubMatch { squadId: string | null; via: "override" | "exact" | "loose" | "prefix" | "new" }

type Pass = { via: "exact" | "loose" | "prefix"; same: (espn: string, ours: string) => boolean };

const isPrefix = (a: string[], b: string[]) => a.length > 0 && a.length <= b.length && a.every((t, i) => b[i] === t);
const PASSES: Pass[] = [
  { via: "exact", same: (e, o) => clubKey(e) !== "" && clubKey(e) === clubKey(o) },
  { via: "loose", same: (e, o) => looseClubKey(e) !== "" && looseClubKey(e) === looseClubKey(o) },
  {
    via: "prefix",
    same: (e, o) => {
      const a = clubKey(e).split(" ").filter(Boolean);
      const b = clubKey(o).split(" ").filter(Boolean);
      return isPrefix(a, b) || isPrefix(b, a);
    },
  },
];

/**
 * ESPN club → squadId, per country. Order: override, then exact / loose / prefix passes (each pass
 * over every still-unmatched team; a hit must be unique among the unclaimed clubs of the country),
 * then "new". Throws when an override names an unknown squad or two teams hit the same squad in a pass.
 */
export function matchClubs(teams: EspnClubRef[], world: WorldClubRef[], overrides: Record<string, string>): Map<string, ClubMatch> {
  const byId = new Map(world.map((c) => [c.id, c]));
  const claimed = new Set<string>();
  const out = new Map<string, ClubMatch>();
  const sorted = [...teams].sort((a, b) => a.espnId.localeCompare(b.espnId, "en", { numeric: true }));

  for (const t of sorted) {
    const o = overrides[t.espnId];
    if (o === undefined) continue;
    if (!byId.has(o)) throw new Error(`matchClubs: override ${t.espnId} → unknown squad ${o}`);
    if (claimed.has(o)) throw new Error(`matchClubs: override ${t.espnId} → ${o} already claimed`);
    claimed.add(o);
    out.set(t.espnId, { squadId: o, via: "override" });
  }

  for (const pass of PASSES) {
    const hits = new Map<string, string>(); // espnId → squadId
    for (const t of sorted) {
      if (out.has(t.espnId)) continue;
      const cands = world.filter((c) => c.country === t.country && !claimed.has(c.id)
        && (pass.same(t.name, c.name) || pass.same(t.shortName, c.name)));
      if (cands.length === 1) hits.set(t.espnId, cands[0]!.id);
    }
    const bySquad = new Map<string, string>();
    for (const [espnId, squadId] of hits) {
      const prev = bySquad.get(squadId);
      if (prev) throw new Error(`matchClubs: ESPN ${prev} and ${espnId} both match ${squadId} (${pass.via}) — add an override`);
      bySquad.set(squadId, espnId);
    }
    for (const [espnId, squadId] of hits) {
      claimed.add(squadId);
      out.set(espnId, { squadId, via: pass.via });
    }
  }

  for (const t of sorted) if (!out.has(t.espnId)) out.set(t.espnId, { squadId: null, via: "new" });
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/espn/matchClubs.test.ts`
Esperado: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn/matchClubs.ts scripts/espn/matchClubs.test.ts
git commit -m "feat(espn): club matching (override, exact, loose, prefix, new)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Correspondência de jogadores

**Files:**
- Create: `scripts/espn/matchPlayers.ts`
- Test: `scripts/espn/matchPlayers.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { espnRole, matchPlayers, type AthleteRef, type WorldPlayerRef } from "@/../scripts/espn/matchPlayers";

const wp = (id: string, name: string, age: number, role: WorldPlayerRef["role"], squadId = "s1", fullName?: string): WorldPlayerRef =>
  ({ id, name, fullName, age, role, squadId });
const ath = (espnId: string, name: string, age: number | null, role: AthleteRef["role"], teamSquadId: string | null = "s1", fullName = name): AthleteRef =>
  ({ espnId, displayName: name, fullName, age, role, teamSquadId });

describe("espnRole", () => {
  test("maps G/D/M/F", () => {
    expect(espnRole("G")).toBe("GK");
    expect(espnRole("F")).toBe("Forward");
    expect(espnRole(null)).toBeNull();
  });
});

describe("matchPlayers", () => {
  const world = [
    wp("p1", "Bukayo Saka", 23, "Forward"),
    wp("p2", "Martin Ødegaard", 26, "Midfielder", "s2"),
    wp("p3", "João Silva", 20, "Defender", "s3"),
    wp("p4", "João Silva", 22, "Defender", "s4"),
    wp("p5", "Kepa", 30, "GK", "s5", "Kepa Arrizabalaga Revuelta"),
  ];

  test("matches by name + age window + role, anywhere in the world", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 25, "Forward"), ath("a2", "Martin Odegaard", 28, "Midfielder")], world, {});
    expect(m.get("a1")).toBe("p1");
    expect(m.get("a2")).toBe("p2");
  });

  test("rejects an impossible age", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 30, "Forward")], world, {});
    expect(m.has("a1")).toBe(false);
  });

  test("rejects GK vs outfield, accepts an adjacent line", () => {
    expect(matchPlayers([ath("a1", "Bukayo Saka", 25, "GK")], world, {}).has("a1")).toBe(false);
    expect(matchPlayers([ath("a1", "Bukayo Saka", 25, "Midfielder")], world, {}).get("a1")).toBe("p1");
  });

  test("uses fullName and picks the age closest to +2", () => {
    const m = matchPlayers([ath("a1", "Kepa", 32, "GK", "s9", "Kepa Arrizabalaga"), ath("a2", "Joao Silva", 24, "Defender", "x")], world, {});
    expect(m.get("a1")).toBe("p5");
    expect(m.get("a2")).toBe("p4");
  });

  test("a world player is claimed once", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 25, "Forward"), ath("a2", "Bukayo Saka", 25, "Forward")], world, {});
    expect(m.get("a1")).toBe("p1");
    expect(m.has("a2")).toBe(false);
  });

  test("override wins and must exist", () => {
    expect(matchPlayers([ath("a1", "Someone Else", 25, "Forward")], world, { a1: "p1" }).get("a1")).toBe("p1");
    expect(() => matchPlayers([ath("a1", "X", 25, "Forward")], world, { a1: "zz" })).toThrow(/unknown player/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/matchPlayers.test.ts`
Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar `scripts/espn/matchPlayers.ts`**

```ts
import { playerKey } from "@/../scripts/espn/normalize";
import type { EspnPos } from "@/../scripts/espn/types";
import type { MainRole } from "@/../scripts/openfootball/roster";

export interface WorldPlayerRef { id: string; name: string; fullName?: string; age: number; role: MainRole; squadId: string }
export interface AthleteRef {
  espnId: string; displayName: string; fullName: string; age: number | null; role: MainRole | null;
  /** squadId the athlete's ESPN club matched to (tie-break), or null for a new club. */
  teamSquadId: string | null;
}

export const MIN_AGE_GAP = 0;
export const MAX_AGE_GAP = 3;
/** The world is two seasons behind the snapshot. */
export const EXPECTED_AGE_GAP = 2;

export function espnRole(p: EspnPos | null): MainRole | null {
  return p === "G" ? "GK" : p === "D" ? "Defender" : p === "M" ? "Midfielder" : p === "F" ? "Forward" : null;
}

const LINE: Record<MainRole, number> = { GK: 0, Defender: 1, Midfielder: 2, Forward: 3 };
function roleDistance(a: MainRole, b: MainRole): number | null {
  if (a === b) return 0;
  if (a === "GK" || b === "GK") return null;
  return Math.abs(LINE[a] - LINE[b]) === 1 ? 1 : null;
}

/**
 * ESPN athlete → world player id. Athletes are processed in the given order (the caller sorts them);
 * each world player is claimed at most once. Candidate: same normalized name (display or full, against
 * name or fullName), ESPN age − world age in [MIN_AGE_GAP, MAX_AGE_GAP] (skipped when ESPN has no age),
 * and the same or an adjacent line (never GK ↔ outfield). Ranking: same line, age gap closest to
 * EXPECTED_AGE_GAP, already at the athlete's club, id. Overrides (espnId → playerId) come first.
 */
export function matchPlayers(athletes: AthleteRef[], world: WorldPlayerRef[], overrides: Record<string, string>): Map<string, string> {
  const byId = new Map(world.map((p) => [p.id, p]));
  const byKey = new Map<string, WorldPlayerRef[]>();
  for (const p of world) {
    for (const k of new Set([playerKey(p.name), p.fullName ? playerKey(p.fullName) : ""])) {
      if (!k) continue;
      byKey.set(k, [...(byKey.get(k) ?? []), p]);
    }
  }
  const claimed = new Set<string>();
  const out = new Map<string, string>();

  for (const a of athletes) {
    const o = overrides[a.espnId];
    if (o === undefined) continue;
    if (!byId.has(o)) throw new Error(`matchPlayers: override ${a.espnId} → unknown player ${o}`);
    claimed.add(o);
    out.set(a.espnId, o);
  }

  for (const a of athletes) {
    if (out.has(a.espnId)) continue;
    const pool = new Set<WorldPlayerRef>();
    for (const k of [playerKey(a.displayName), playerKey(a.fullName)]) for (const p of byKey.get(k) ?? []) pool.add(p);
    const ranked = [...pool]
      .filter((p) => !claimed.has(p.id))
      .map((p) => {
        const gap = a.age === null ? EXPECTED_AGE_GAP : a.age - p.age;
        const rd = a.role === null ? 0 : roleDistance(a.role, p.role);
        return { p, gap, rd };
      })
      .filter((c) => c.rd !== null && c.gap >= MIN_AGE_GAP && c.gap <= MAX_AGE_GAP)
      .sort((x, y) =>
        x.rd! - y.rd!
        || Math.abs(x.gap - EXPECTED_AGE_GAP) - Math.abs(y.gap - EXPECTED_AGE_GAP)
        || Number(x.p.squadId !== a.teamSquadId) - Number(y.p.squadId !== a.teamSquadId)
        || x.p.id.localeCompare(y.p.id));
    const best = ranked[0];
    if (best) { claimed.add(best.p.id); out.set(a.espnId, best.p.id); }
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/espn/matchPlayers.test.ts`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn/matchPlayers.ts scripts/espn/matchPlayers.test.ts
git commit -m "feat(espn): player matching across the whole world

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Composição das ligas

**Files:**
- Create: `scripts/espn/lineup.ts`
- Test: `scripts/espn/lineup.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { planLineup, type LeagueRef } from "@/../scripts/espn/lineup";

describe("planLineup", () => {
  test("England: moves between covered leagues; a club with no lower league leaves the world", () => {
    const leagues: LeagueRef[] = [
      { slug: "premier_league", country: "England", tier: 1, members: ["33", "39", "47"] },
      { slug: "of_championship", country: "England", tier: 2, members: ["cov", "hull", "bir"] },
    ];
    const applied = new Map([
      ["premier_league", ["33", "47", "cov"]],
      ["of_championship", ["39", "hull", "es_1"]],
    ]);
    const r = planLineup(leagues, applied);
    expect(r.members.get("premier_league")).toEqual(["33", "47", "cov"]);
    expect(r.members.get("of_championship")).toEqual(["39", "es_1", "hull"]);
    expect(r.moves).toEqual([
      { squadId: "39", from: "premier_league", to: "of_championship" },
      { squadId: "cov", from: "of_championship", to: "premier_league" },
    ]);
    expect(r.removed).toEqual(["bir"]);
  });

  test("Brazil: displaced club drops to the highest uncovered level", () => {
    const leagues: LeagueRef[] = [
      { slug: "a", country: "Brazil", tier: 1, members: ["a1", "a2"] },
      { slug: "b", country: "Brazil", tier: 2, members: ["b1", "b2"] },
      { slug: "c", country: "Brazil", tier: 3, members: ["c1", "c2"] },
    ];
    const applied = new Map([["a", ["a1", "b1"]], ["b", ["a2", "c1"]]]);
    const r = planLineup(leagues, applied);
    expect(r.members.get("c")).toEqual(["b2", "c2"]);
    expect(r.removed).toEqual([]);
    expect(r.moves.map((m) => `${m.squadId}:${m.from}>${m.to}`)).toEqual(["a2:a>b", "b1:b>a", "b2:b>c", "c1:c>b"]);
  });

  test("among several groups on the lower level, the smallest one takes the club", () => {
    const leagues: LeagueRef[] = [
      { slug: "top", country: "X", tier: 1, members: ["t1", "t2"] },
      { slug: "g1", country: "X", tier: 2, members: ["x", "y", "z"] },
      { slug: "g2", country: "X", tier: 2, members: ["w"] },
    ];
    const r = planLineup(leagues, new Map([["top", ["t1"]]]));
    expect(r.members.get("g2")).toEqual(["t2", "w"]);
  });

  test("a club listed by two covered leagues throws", () => {
    const leagues: LeagueRef[] = [
      { slug: "a", country: "X", tier: 1, members: [] },
      { slug: "b", country: "X", tier: 2, members: [] },
    ];
    expect(() => planLineup(leagues, new Map([["a", ["k"]], ["b", ["k"]]]))).toThrow(/two leagues/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/lineup.test.ts`
Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar `scripts/espn/lineup.ts`**

```ts
export interface LeagueRef { slug: string; country: string; tier: number; members: string[] }
export interface ClubMove { squadId: string; from: string; to: string }
export interface LineupResult { members: Map<string, string[]>; moves: ClubMove[]; removed: string[] }

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/**
 * New membership of every league. `applied` holds the ESPN member list (squadIds, new clubs included)
 * of each covered league. Covered leagues get exactly that list. A club that leaves a covered league
 * without appearing in another one drops to the highest non-covered level below it in its country
 * (the group with fewest clubs, then slug); with no such level it leaves the world. Non-covered leagues
 * lose the clubs claimed by covered leagues and receive the dropped ones. Lists come out sorted by id.
 */
export function planLineup(leagues: LeagueRef[], applied: Map<string, string[]>): LineupResult {
  const leagueOf = new Map<string, string>();
  for (const l of leagues) for (const s of l.members) leagueOf.set(s, l.slug);

  const assigned = new Map<string, string>();
  for (const [slug, ids] of applied) {
    for (const id of ids) {
      const prev = assigned.get(id);
      if (prev) throw new Error(`planLineup: ${id} listed in two leagues (${prev}, ${slug})`);
      assigned.set(id, slug);
    }
  }

  const members = new Map<string, string[]>();
  for (const l of leagues) members.set(l.slug, applied.get(l.slug) ?? l.members.filter((s) => !assigned.has(s)));

  const removed: string[] = [];
  for (const l of [...leagues].sort((a, b) => a.tier - b.tier || byId(a.slug, b.slug))) {
    if (!applied.has(l.slug)) continue;
    for (const s of [...l.members].sort(byId)) {
      if (assigned.has(s)) continue;
      const lower = leagues.filter((x) => x.country === l.country && x.tier > l.tier && !applied.has(x.slug));
      if (lower.length === 0) { removed.push(s); continue; }
      const tier = Math.min(...lower.map((x) => x.tier));
      const dest = lower.filter((x) => x.tier === tier)
        .sort((a, b) => members.get(a.slug)!.length - members.get(b.slug)!.length || byId(a.slug, b.slug))[0]!;
      members.get(dest.slug)!.push(s);
    }
  }

  const moves: ClubMove[] = [];
  for (const [slug, ids] of members) {
    ids.sort(byId);
    for (const s of ids) {
      const from = leagueOf.get(s);
      if (from && from !== slug) moves.push({ squadId: s, from, to: slug });
    }
  }
  moves.sort((a, b) => byId(a.squadId, b.squadId));
  return { members, moves, removed: removed.sort(byId) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/espn/lineup.test.ts`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn/lineup.ts scripts/espn/lineup.test.ts
git commit -m "feat(espn): league membership plan (moves, drops, removals)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Curva de idade

**Files:**
- Create: `scripts/espn/aging.ts`
- Test: `scripts/espn/aging.test.ts`

Nota: o número de anos aplicados é a diferença real de idade (idade ESPN − idade no mundo), limitada a 0..2. Normalmente dá 2, como no spec.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { ageDelta, agePlayerStats } from "@/../scripts/espn/aging";
import type { PlayerStatsRecord } from "@/types/playerTypes";

const base: PlayerStatsRecord = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 1,
};
const outfield: Record<string, number> = { passing: 1, vision: 1, finishing: 1, dribbling: 1, speed: 1, acceleration: 1, tackling: 1, pressing: 1, stamina: 1, heading: 1, strength: 1 };
const sum = (s: PlayerStatsRecord) => Object.values(s).reduce((a, b) => a + b, 0);

describe("ageDelta", () => {
  test("bands", () => {
    expect(ageDelta(19)).toBe(0.6);
    expect(ageDelta(24)).toBe(0.3);
    expect(ageDelta(27)).toBe(0.1);
    expect(ageDelta(29)).toBe(0);
    expect(ageDelta(31)).toBe(-0.2);
    expect(ageDelta(33)).toBe(-0.4);
    expect(ageDelta(36)).toBe(-0.6);
  });
});

describe("agePlayerStats", () => {
  test("zero years leaves the stats unchanged", () => {
    expect(agePlayerStats("p", base, 25, 25, outfield)).toEqual(base);
  });
  test("deterministic", () => {
    expect(agePlayerStats("p", base, 19, 21, outfield)).toEqual(agePlayerStats("p", base, 19, 21, outfield));
  });
  test("a young player grows, a veteran declines", () => {
    expect(sum(agePlayerStats("y", base, 19, 21, outfield))).toBeGreaterThan(sum(base));
    expect(sum(agePlayerStats("v", base, 33, 35, outfield))).toBeLessThan(sum(base));
  });
  test("decline hits physical attributes harder", () => {
    const after = agePlayerStats("v", { ...base, speed: 8, acceleration: 8, stamina: 8, passing: 8, vision: 8, tackling: 8 }, 34, 36, outfield);
    const phys = 24 - (after.speed + after.acceleration + after.stamina);
    const tech = 24 - (after.passing + after.vision + after.tackling);
    expect(phys).toBeGreaterThan(tech);
  });
  test("soft cap: a 10 stays 10 and never exceeds it", () => {
    const after = agePlayerStats("c", { ...base, finishing: 10 }, 18, 20, outfield);
    expect(after.finishing).toBe(10);
  });
  test("stats with zero role weight do not move", () => {
    const after = agePlayerStats("g", base, 18, 20, outfield);
    expect(after.reflex).toBe(1);
    expect(after.jump).toBe(1);
  });
  test("caps the gap at two years", () => {
    expect(agePlayerStats("p", base, 18, 23, outfield)).toEqual(agePlayerStats("p", base, 18, 20, outfield));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/aging.test.ts`
Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar `scripts/espn/aging.ts`**

```ts
import { unitHash } from "@/../scripts/openfootball/ids";
import { STAT_KEYS } from "@/../scripts/openfootball/derive";
import type { PlayerStatsRecord } from "@/types/playerTypes";

/** Change of the mean role attribute per year, by age during that year. */
const AGE_DELTA: Array<[maxAge: number, delta: number]> = [
  [21, 0.6], [25, 0.3], [27, 0.1], [29, 0], [31, -0.2], [34, -0.4], [Infinity, -0.6],
];
export const MAX_YEARS = 2;
const PHYSICAL = new Set(["speed", "acceleration", "stamina"]);

export function ageDelta(age: number): number {
  return AGE_DELTA.find(([max]) => age <= max)![1];
}

/**
 * Ages `stats` from `fromAge` to `toAge` (at most MAX_YEARS years). Each year the total
 * `ageDelta × (attributes with weight > 0)` is split over those attributes by `weights`
 * (the attrWeights of the player's best specific role). Growth is damped by `1 − (v/10)²`;
 * decline weighs speed, acceleration and stamina double. Fractions are rounded with a
 * per-player, per-attribute hash, so the result is deterministic.
 */
export function agePlayerStats(
  playerId: string, stats: PlayerStatsRecord, fromAge: number, toAge: number, weights: Record<string, number>,
): PlayerStatsRecord {
  const years = Math.max(0, Math.min(MAX_YEARS, toAge - fromAge));
  if (years === 0) return { ...stats };
  const keys = STAT_KEYS.filter((k) => (weights[k] ?? 0) > 0);
  const x: Record<string, number> = { ...stats };
  for (let y = 0; y < years; y++) {
    const d = ageDelta(fromAge + y);
    if (d === 0 || keys.length === 0) continue;
    const w = keys.map((k) => weights[k]! * (d < 0 && PHYSICAL.has(k) ? 2 : 1));
    const wSum = w.reduce((a, b) => a + b, 0);
    const total = d * keys.length;
    keys.forEach((k, i) => {
      const share = (total * w[i]!) / wSum;
      x[k] = d > 0 ? x[k]! + share * (1 - (x[k]! / 10) ** 2) : x[k]! + share;
    });
  }
  const out = {} as PlayerStatsRecord;
  for (const k of STAT_KEYS) {
    const v = Math.max(0, Math.min(10, x[k]!));
    const f = Math.floor(v);
    out[k] = Math.min(10, f + (unitHash(`${playerId}:${k}:age`) < v - f ? 1 : 0));
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/espn/aging.test.ts`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn/aging.ts scripts/espn/aging.test.ts
git commit -m "feat(espn): deterministic two-year age curve

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Jogadores novos, jovens e corte do elenco

**Files:**
- Create: `scripts/espn/estimate.ts`
- Test: `scripts/espn/estimate.test.ts`

Nota: os jogadores do mundo guardam o papel principal em `positions[0]` ("Defender", "Midfielder"…). Os jogadores novos seguem esse formato, e não a posição detalhada.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, expect, test } from "bun:test";
import { ageAdjust, estimateStats, fillSquad, lineMedians, makePlayer, trimSquad } from "@/../scripts/espn/estimate";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const st = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});
const pl = (id: string, role: string, v: number, age = 25): RosterPlayer => ({
  id, name: id, age, squadId: "s", preferredFoot: "right", positions: [role], stats: st(v),
  profile: { archetype: "x", summary: "x" },
});
const overall = (p: RosterPlayer) => p.stats.passing;

describe("lineMedians", () => {
  test("per-attribute median by line", () => {
    const m = lineMedians([pl("a", "Defender", 2), pl("b", "Defender", 4), pl("c", "Defender", 9), pl("d", "Forward", 6)]);
    expect(m.Defender!.tackling).toBe(4);
    expect(m.Forward!.passing).toBe(6);
    expect(m.GK).toBeUndefined();
  });
});

describe("ageAdjust", () => {
  test("bands", () => {
    expect(ageAdjust(19)).toBe(-1);
    expect(ageAdjust(22)).toBe(-0.5);
    expect(ageAdjust(27)).toBe(0);
    expect(ageAdjust(33)).toBe(-0.3);
  });
});

describe("estimateStats", () => {
  test("deterministic, near the base, within 0..10", () => {
    const a = estimateStats("es_1", 27, st(5), 0);
    expect(a).toEqual(estimateStats("es_1", 27, st(5), 0));
    for (const v of Object.values(a)) { expect(v).toBeGreaterThanOrEqual(4); expect(v).toBeLessThanOrEqual(6); }
    const changed = Object.values(a).filter((v) => v !== 5).length;
    expect(changed).toBeLessThanOrEqual(4);
  });
  test("young players come in lower", () => {
    const young = estimateStats("es_2", 18, st(5), 0);
    expect(Object.values(young).reduce((s, v) => s + v, 0)).toBeLessThan(65);
  });
});

describe("makePlayer", () => {
  test("main-role position, foot and profile", () => {
    const p = makePlayer({ id: "es_9", name: "Novo", age: 24, role: "Midfielder", squadId: "s", nationality: "Brazil", stats: st(5) }, 5);
    expect(p.positions).toEqual(["Midfielder"]);
    expect(["left", "right"]).toContain(p.preferredFoot);
    expect(p.profile.summary).toMatch(/midfielder/);
    expect(p.nationality).toBe("Brazil");
  });
});

describe("trimSquad", () => {
  test("keeps role minimums, then the best, up to max", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => pl(`g${i}`, "GK", 1 + i)),
      ...Array.from({ length: 30 }, (_, i) => pl(`f${i}`, "Forward", 9)),
    ];
    const out = trimSquad(players, 30, overall);
    expect(out).toHaveLength(30);
    expect(out.filter((p) => p.positions[0] === "GK").map((p) => p.id).sort()).toEqual(["g2", "g3", "g4"]);
  });
});

describe("fillSquad", () => {
  test("tops up every line minimum and the squad minimum with youth", () => {
    const out = fillSquad("s", [pl("a", "Forward", 5)], { first: ["Ana"], last: ["Lima"] }, "Brazil", () => st(4), overall);
    const count = (r: string) => out.filter((p) => p.positions[0] === r).length;
    expect(count("GK")).toBe(3);
    expect(count("Defender")).toBeGreaterThanOrEqual(7);
    expect(count("Midfielder")).toBeGreaterThanOrEqual(7);
    expect(count("Forward")).toBeGreaterThanOrEqual(4);
    expect(out.length).toBeGreaterThanOrEqual(18);
    const youth = out.filter((p) => p.id.startsWith("es_youth_s_"));
    expect(youth.every((p) => p.age >= 17 && p.age <= 19)).toBe(true);
    expect(new Set(out.map((p) => p.id)).size).toBe(out.length);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/estimate.test.ts`
Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar `scripts/espn/estimate.ts`**

```ts
import { unitHash } from "@/../scripts/openfootball/ids";
import { STAT_KEYS, playerProfile } from "@/../scripts/openfootball/derive";
import { MAX_SQUAD, MIN_BY_ROLE, MIN_SQUAD, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export const LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];
/** Attributes that get ±1 of deterministic noise on an estimated player. */
export const NOISE_ATTRS = 4;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Per-attribute median of each line present in `players`. */
export function lineMedians(players: RosterPlayer[]): Partial<Record<MainRole, PlayerStatsRecord>> {
  const out: Partial<Record<MainRole, PlayerStatsRecord>> = {};
  for (const line of LINES) {
    const ps = players.filter((p) => getMainRole(p.positions[0] ?? "") === line);
    if (ps.length === 0) continue;
    const s = {} as PlayerStatsRecord;
    for (const k of STAT_KEYS) s[k] = median(ps.map((p) => p.stats[k]));
    out[line] = s;
  }
  return out;
}

export function ageAdjust(age: number): number {
  return age <= 20 ? -1 : age <= 23 ? -0.5 : age <= 31 ? 0 : -0.3;
}

/** base + ageAdjust(age) + shift on every attribute, ±1 on NOISE_ATTRS hash-picked attributes, rounded to 0..10. */
export function estimateStats(id: string, age: number, base: PlayerStatsRecord, shift: number): PlayerStatsRecord {
  const noisy = [...STAT_KEYS].sort((a, b) => unitHash(`${id}:pick:${a}`) - unitHash(`${id}:pick:${b}`)).slice(0, NOISE_ATTRS);
  const out = {} as PlayerStatsRecord;
  for (const k of STAT_KEYS) {
    const noise = noisy.includes(k) ? (unitHash(`${id}:sign:${k}`) < 0.5 ? -1 : 1) : 0;
    out[k] = Math.max(0, Math.min(10, Math.round(base[k] + ageAdjust(age) + shift + noise)));
  }
  return out;
}

const adjectiveFor = (overall: number) => (overall >= 5.5 ? "Elite" : overall >= 4.5 ? "Solid" : overall >= 3.5 ? "Capable" : "Developing");

export interface NewPlayerInput {
  id: string; name: string; fullName?: string; age: number; role: MainRole; squadId: string;
  nationality: string | null; stats: PlayerStatsRecord;
}

/** RosterPlayer for an estimated player; `overall` (0..10) only picks the profile adjective. */
export function makePlayer(a: NewPlayerInput, overall: number): RosterPlayer & { fullName?: string } {
  const p: RosterPlayer & { fullName?: string } = {
    id: a.id, name: a.name, age: a.age, squadId: a.squadId,
    preferredFoot: unitHash(`${a.id}:foot`) < 0.75 ? "right" : "left",
    positions: [a.role], stats: a.stats,
    profile: playerProfile(a.role, a.stats, adjectiveFor(overall)),
  };
  if (a.fullName && a.fullName !== a.name) p.fullName = a.fullName;
  if (a.nationality) p.nationality = a.nationality;
  return p;
}

const lineOf = (p: RosterPlayer) => getMainRole(p.positions[0] ?? "");

/** Keeps each line's minimum (best by `overall`), then the best remaining players, up to `max`. */
export function trimSquad<P extends RosterPlayer>(players: P[], max: number, overall: (p: P) => number): P[] {
  if (players.length <= max) return players;
  const rank = (a: P, b: P) => overall(b) - overall(a) || a.id.localeCompare(b.id);
  const chosen = new Set<P>();
  for (const line of LINES) players.filter((p) => lineOf(p) === line).sort(rank).slice(0, MIN_BY_ROLE[line]).forEach((p) => chosen.add(p));
  for (const p of [...players].sort(rank)) { if (chosen.size >= max) break; chosen.add(p); }
  return players.filter((p) => chosen.has(p));
}

/**
 * Adds youth (17–19, id `es_youth_<squadId>_<n>`) until every line reaches MIN_BY_ROLE and the squad
 * reaches MIN_SQUAD. `baseFor(line)` gives the stats base of a youth of that line. Then trims to MAX_SQUAD.
 */
export function fillSquad<P extends RosterPlayer>(
  squadId: string, players: P[], pool: NamePool, country: string,
  baseFor: (line: MainRole) => PlayerStatsRecord, overall: (p: RosterPlayer) => number,
): RosterPlayer[] {
  const out: RosterPlayer[] = [...players];
  let n = 0;
  const addYouth = (line: MainRole) => {
    const id = `es_youth_${squadId}_${n++}`;
    const first = pool.first[Math.floor(unitHash(`${id}:f`) * pool.first.length)] ?? "Juan";
    const last = pool.last[Math.floor(unitHash(`${id}:l`) * pool.last.length)] ?? "Silva";
    const age = 17 + Math.floor(unitHash(`${id}:a`) * 3);
    const stats = estimateStats(id, age, baseFor(line), 0);
    const draft = makePlayer({ id, name: `${first} ${last}`, age, role: line, squadId, nationality: country, stats }, 0);
    out.push(makePlayer({ id, name: draft.name, age, role: line, squadId, nationality: country, stats }, overall(draft)));
  };
  for (const line of LINES) {
    const have = out.filter((p) => lineOf(p) === line).length;
    for (let i = have; i < MIN_BY_ROLE[line]; i++) addYouth(line);
  }
  const PAD: MainRole[] = ["Defender", "Midfielder", "Forward", "Midfielder"];
  for (let i = 0; out.length < MIN_SQUAD; i++) addYouth(PAD[i % PAD.length]!);
  return trimSquad(out, MAX_SQUAD, overall);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun test scripts/espn/estimate.test.ts`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add scripts/espn/estimate.ts scripts/espn/estimate.test.ts
git commit -m "feat(espn): estimated players, youth fill and squad trim

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Índice de escudos (importador e front)

**Files:**
- Create: `scripts/espn/logos.ts`, `src/Domain/world/logos.ts`
- Modify: `src/GameInterface/Components/ClubLogo.tsx:7-20`
- Test: `scripts/espn/logos.test.ts`, `src/Domain/world/logos.test.ts`

O índice mapeia `squadId → "{pasta}/{stem}"`, e o front monta `/api/logos/{pasta}/{stem}`. Os escudos da ESPN ficam em `logos/espn/{squadId}.png`. A rota atual já serve PNG, então o servidor não muda. O índice deixa de depender da liga de catálogo, e por isso um clube nativo que mudou de liga continua achando o próprio SVG.

- [ ] **Step 1: Testes que falham**

`scripts/espn/logos.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildLogoIndex } from "@/../scripts/espn/logos";

describe("buildLogoIndex", () => {
  test("native file first (by slug, then id), then ESPN, else absent", () => {
    const idx = buildLogoIndex(
      [
        { id: "33", slug: "manchester_united", nativeLeague: "premier_league" },
        { id: "127", slug: "flamengo", nativeLeague: "brazil_serie_a" },
        { id: "of_gb_coventry_city", slug: "of_gb_coventry_city", nativeLeague: null },
        { id: "of_x", slug: "of_x", nativeLeague: null },
      ],
      new Set(["premier_league/manchester_united", "brazil_serie_a/127"]),
      new Set(["33", "of_gb_coventry_city"]),
    );
    expect(idx).toEqual({
      "33": "premier_league/manchester_united",
      "127": "brazil_serie_a/127",
      "of_gb_coventry_city": "espn/of_gb_coventry_city",
    });
  });
});
```

`src/Domain/world/logos.test.ts`:

```ts
import { expect, test } from "bun:test";
import { logoUrlFromIndex } from "@/Domain/world/logos";

test("logoUrlFromIndex", () => {
  const idx = { "33": "premier_league/manchester_united", es_1: "espn/es_1" };
  expect(logoUrlFromIndex(idx, "33")).toBe("/api/logos/premier_league/manchester_united");
  expect(logoUrlFromIndex(idx, "es_1")).toBe("/api/logos/espn/es_1");
  expect(logoUrlFromIndex(idx, "nope")).toBeUndefined();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun test scripts/espn/logos.test.ts src/Domain/world/logos.test.ts`
Esperado: FAIL, módulos não existem.

- [ ] **Step 3: Implementar `scripts/espn/logos.ts`**

```ts
export const ESPN_LOGO_DIR = "espn";

export interface LogoSquadRef {
  id: string;
  slug: string;
  /** Native league folder the club came from (its logos/ folder), or null for of_* / new clubs. */
  nativeLeague: string | null;
}

/**
 * squadId → "{folder}/{stem}" for every club with a crest. A native file (logos/{nativeLeague}/{slug|id})
 * wins over the ESPN crest (logos/espn/{id}.png); clubs with neither are left out.
 * `nativeFiles` holds "folder/stem" entries without extension; `espnIds` the squads with a downloaded crest.
 */
export function buildLogoIndex(squads: LogoSquadRef[], nativeFiles: Set<string>, espnIds: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of [...squads].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) {
    const native = s.nativeLeague
      ? [`${s.nativeLeague}/${s.slug}`, `${s.nativeLeague}/${s.id}`].find((k) => nativeFiles.has(k))
      : undefined;
    if (native) out[s.id] = native;
    else if (espnIds.has(s.id)) out[s.id] = `${ESPN_LOGO_DIR}/${s.id}`;
  }
  return out;
}
```

- [ ] **Step 4: Implementar `src/Domain/world/logos.ts`**

```ts
/** squadId → "{folder}/{stem}" (generated by scripts/importEspn.ts as logoIndex.json). */
export type LogoIndex = Record<string, string>;

/** Crest URL for a squad, or undefined when the club has no crest file (the UI then draws a shield). */
export function logoUrlFromIndex(index: LogoIndex, squadId: string): string | undefined {
  const path = index[squadId];
  return path ? `/api/logos/${path}` : undefined;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test scripts/espn/logos.test.ts src/Domain/world/logos.test.ts`
Esperado: 2 pass.

- [ ] **Step 6: `squadLogoUrl` usa o índice**

Crie um índice vazio para o código compilar até a primeira regeneração, nos dois lugares:

```bash
echo '{}' > src/example_data/logoIndex.json
cp src/example_data/logoIndex.json src/Data/logoIndex.json
```

Em `src/GameInterface/Components/ClubLogo.tsx`, acrescente os imports e troque o comentário e a função `squadLogoUrl`:

```ts
import LOGO_INDEX from "@/Data/logoIndex.json";
import { logoUrlFromIndex } from "@/Domain/world/logos";
```

```ts
/**
 * Crest URL for a squad from the generated logo index (native SVG/PNG or the ESPN crest).
 * Returns undefined when the club has no crest, so the UI draws the colour shield without a request.
 * `leagueSlug` / `clubSlug` are kept for the existing call sites and no longer used.
 */
export function squadLogoUrl(squadId: string, _leagueSlug?: string, _clubSlug?: string): string | undefined {
  return logoUrlFromIndex(LOGO_INDEX as Record<string, string>, squadId);
}
```

- [ ] **Step 7: Typecheck**

Run: `bunx tsc --noEmit -p .`
Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add scripts/espn/logos.ts scripts/espn/logos.test.ts src/Domain/world/logos.ts src/Domain/world/logos.test.ts src/GameInterface/Components/ClubLogo.tsx src/example_data/logoIndex.json
git commit -m "feat(logos): crest lookup through a generated logo index

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `applyEspn` (orquestração pura)

**Files:**
- Create: `scripts/espn/apply.ts`, `scripts/espn/fixtures.ts`
- Test: `scripts/espn/apply.test.ts`

- [ ] **Step 1: Criar `scripts/espn/fixtures.ts`**

Mundo mínimo: Inglaterra com duas ligas de 3 clubes, e um snapshot em que o Coventry sobe, o Wolves cai, o Birmingham sai do mundo e entra um clube novo.

```ts
import type { EspnAthlete, EspnSnapshot, EspnTeam } from "@/../scripts/espn/types";
import type { World } from "@/../scripts/espn/apply";
import type { SquadFile } from "@/../scripts/world/types";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const st = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});
const ROLES = ["GK", "Defender", "Defender", "Midfielder", "Midfielder", "Forward"] as const;

function squad(id: string, name: string, level: number): SquadFile {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}_p${i}`, name: `${name} Player ${i}`, age: 20 + i, squadId: id, preferredFoot: "right",
    positions: [role], stats: st(level), profile: { archetype: "x", summary: "x" }, nationality: "England",
  }));
  return {
    id, slug: id, name, colors: ["#111111", "#ffffff"], country: "England",
    venue: { name: `${name} Park`, city: null, capacity: 20000 + level * 1000, surface: "grass" },
    coach: { id: 1, name: "Coach" },
    finances: { broadcasting: level * 1e6, commercial: level * 1e6, total: 2 * level * 1e6, budget: level * 1e6, followers: level * 1e5 },
    players,
  };
}

export function fixtureWorld(): World {
  const pl = [squad("33", "Manchester United", 6), squad("39", "Wolves", 5), squad("47", "Tottenham", 6)];
  const ch = [squad("of_cov", "Coventry City", 4), squad("of_hull", "Hull City", 4), squad("of_bir", "Birmingham City", 3)];
  const row = (s: SquadFile) => ({ squadId: s.id, slug: s.slug, name: s.name, colors: s.colors, country: "England" });
  return {
    leagues: [
      { slug: "premier_league", name: "Premier League", country: "England", iso2: "GB", season: "2024-25",
        zones: [{ id: "ucl", label: "Champions League", color: "blue", from: 1, to: 1 }, { id: "rel", label: "Relegation", color: "red", fromEnd: 1 }],
        standings: pl.map(row) },
      { slug: "of_championship", name: "Championship", country: "England", iso2: "GB", season: "2024-25",
        zones: [{ id: "prom", label: "Promotion", color: "green", from: 1, to: 1 }], standings: ch.map(row), source: "open-football" },
    ],
    squads: new Map([["premier_league", pl], ["of_championship", ch]]),
    schedules: [
      { slug: "premier_league", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6, 0], baseWeekOffset: 0 },
      { slug: "of_championship", seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, matchDays: [6, 0], baseWeekOffset: 1 },
    ],
    pyramids: { England: { country: "England", levels: [
      { tier: 1, groups: [{ leagueSlug: "premier_league", promote: 0, relegate: 1 }] },
      { tier: 2, groups: [{ leagueSlug: "of_championship", promote: 1, relegate: 0 }] },
    ] } },
  };
}

const ath = (id: string, name: string, age: number, position: EspnAthlete["position"]): EspnAthlete =>
  ({ id, displayName: name, fullName: name, age, position, citizenship: "England" });
const team = (id: string, name: string, athletes: EspnAthlete[]): EspnTeam =>
  ({ id, name, shortName: name, location: name, color: "aa0000", altColor: "ffffff", logoFile: `${id}.png`, coach: "New Coach", athletes });

export function fixtureSnapshot(): EspnSnapshot {
  return {
    fetchedAt: "2026-09-25",
    leagues: [
      { slug: "premier_league", code: "eng.1", name: "Premier League", season: "2026-27", teams: [
        team("360", "Manchester United", [ath("a1", "Manchester United Player 0", 22, "G"), ath("a2", "Wolves Player 5", 27, "F"), ath("a3", "Brand New", 24, "M")]),
        team("367", "Tottenham Hotspur", [ath("a4", "Tottenham Player 1", 23, "D")]),
        team("370", "Coventry City", [ath("a5", "Coventry City Player 3", 25, "M")]),
      ] },
      { slug: "of_championship", code: "eng.2", name: "Championship", season: "2026-27", teams: [
        team("380", "Wolverhampton Wanderers", [ath("a6", "Wolves Player 0", 22, "G")]),
        team("306", "Hull City", [ath("a7", "Hull City Player 2", 23, "D")]),
        team("999", "Wrexham", [ath("a8", "Paul Mullin", 31, "F")]),
      ] },
    ],
  };
}
```

- [ ] **Step 2: Teste que falha (`scripts/espn/apply.test.ts`)**

```ts
import { describe, expect, test } from "bun:test";
import { applyEspn } from "@/../scripts/espn/apply";
import { fixtureSnapshot, fixtureWorld } from "@/../scripts/espn/fixtures";
import { MIN_BY_ROLE, MIN_SQUAD } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { RosterPlayer } from "@/types/playerTypes";

const allWeights = () => ({ passing: 1, vision: 1, finishing: 1, dribbling: 1, speed: 1, acceleration: 1, tackling: 1, pressing: 1, stamina: 1, heading: 1, strength: 1, reflex: 1, jump: 1 });
const overall = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0) / 13;
const opts = {
  leagueMap: [{ slug: "premier_league", code: "eng.1" }, { slug: "of_championship", code: "eng.2" }],
  clubOverrides: { "380": "39" }, playerOverrides: {}, boundaries: {},
  roleWeights: allWeights, overall,
};

describe("applyEspn (fixture)", () => {
  const r = applyEspn(fixtureWorld(), fixtureSnapshot(), opts);
  const members = (slug: string) => r.world.leagues.find((l) => l.slug === slug)!.standings.map((s) => s.squadId);
  const squad = (id: string) => [...r.world.squads.values()].flat().find((s) => s.id === id)!;

  test("league membership follows ESPN", () => {
    expect(members("premier_league")).toEqual(["33", "47", "of_cov"]);
    expect(members("of_championship")).toEqual(["39", "es_999", "of_hull"]);
    expect(r.report.removedClubs).toEqual(["of_bir"]);
  });

  test("a matched player keeps his id, moves club and ages", () => {
    const utd = squad("33");
    const wolvesStriker = utd.players.find((p) => p.id === "39_p5")!;
    expect(wolvesStriker.squadId).toBe("33");
    expect(wolvesStriker.age).toBe(27);
    expect(squad("39").players.some((p) => p.id === "39_p5")).toBe(false);
    const gk = utd.players.find((p) => p.id === "33_p0")!;
    expect(gk.age).toBe(22);
    expect(Object.values(gk.stats).reduce((a, b) => a + b, 0)).toBeGreaterThan(13 * 6);
  });

  test("new player and new club", () => {
    expect(squad("33").players.some((p) => p.id === "es_a3" && p.positions[0] === "Midfielder")).toBe(true);
    const wrexham = squad("es_999");
    expect(wrexham.name).toBe("Wrexham");
    expect(wrexham.colors).toEqual(["#aa0000", "#ffffff"]);
    expect(wrexham.coach!.name).toBe("New Coach");
    expect(wrexham.finances!.budget).toBeGreaterThan(0);
    expect(wrexham.source).toBe("espn");
  });

  test("every squad meets the minimums and ids are unique", () => {
    const ids = new Set<string>();
    for (const s of [...r.world.squads.values()].flat()) {
      expect(s.players.length).toBeGreaterThanOrEqual(MIN_SQUAD);
      for (const line of ["GK", "Defender", "Midfielder", "Forward"] as const)
        expect(s.players.filter((p) => getMainRole(p.positions[0]!) === line).length).toBeGreaterThanOrEqual(MIN_BY_ROLE[line]);
      for (const p of s.players) { expect(ids.has(p.id)).toBe(false); ids.add(p.id); expect(p.squadId).toBe(s.id); }
    }
  });

  test("season, pyramid zones and schedules", () => {
    expect(r.world.leagues.every((l) => l.season === "2026-27")).toBe(true);
    const ch = r.world.leagues.find((l) => l.slug === "of_championship")!;
    expect(ch.zones!.find((z) => z.id === "prom")).toEqual({ id: "prom", label: "Promotion", color: "green", from: 1, to: 1 });
    expect(r.world.leagues.find((l) => l.slug === "premier_league")!.zones!.some((z) => z.id === "ucl")).toBe(true);
  });

  test("ESPN crests and native leagues are reported", () => {
    expect(r.espnLogoOf.get("es_999")).toBe("999.png");
    expect(r.nativeLeagueOf.get("39")).toBe("premier_league");
  });

  test("deterministic", () => {
    const again = applyEspn(fixtureWorld(), fixtureSnapshot(), opts);
    expect(JSON.stringify([...again.world.squads])).toBe(JSON.stringify([...r.world.squads]));
  });

  test("refuses a world that was already converted", () => {
    const w = fixtureWorld();
    w.leagues[0]!.season = "2026-27";
    expect(() => applyEspn(w, fixtureSnapshot(), opts)).toThrow(/already/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test scripts/espn/apply.test.ts`
Esperado: FAIL, módulo `apply` não existe.

- [ ] **Step 4: Implementar `scripts/espn/apply.ts`**

```ts
import { agePlayerStats } from "@/../scripts/espn/aging";
import { estimateStats, fillSquad, lineMedians, makePlayer, trimSquad } from "@/../scripts/espn/estimate";
import { planLineup, type LeagueRef } from "@/../scripts/espn/lineup";
import { matchClubs } from "@/../scripts/espn/matchClubs";
import { espnRole, matchPlayers, type AthleteRef } from "@/../scripts/espn/matchPlayers";
import type { EspnSnapshot, EspnTeam, LeagueMapEntry } from "@/../scripts/espn/types";
import { unitHash } from "@/../scripts/openfootball/ids";
import { coachName } from "@/../scripts/openfootball/derive";
import { buildPyramid, pyramidGroupOf, zonesFromPyramid, type BoundaryOverrides } from "@/../scripts/openfootball/pyramid";
import { MAX_SQUAD, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import type { LeagueEntry, SquadFile, StandingRow } from "@/../scripts/world/types";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Pyramids } from "@/types/pyramidTypes";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export interface World {
  leagues: LeagueEntry[];
  /** League slug → squads (file stem = squad id). */
  squads: Map<string, SquadFile[]>;
  schedules: LeagueScheduleConfig[];
  pyramids: Pyramids;
}

export interface ApplyOptions {
  leagueMap: LeagueMapEntry[];
  clubOverrides: Record<string, string>;
  playerOverrides: Record<string, string>;
  boundaries: BoundaryOverrides;
  /** attrWeights used by the age curve for this player. */
  roleWeights: (p: RosterPlayer) => Record<string, number>;
  /** Player overall on the 0..10 scale. */
  overall: (p: RosterPlayer) => number;
}

export interface EspnReport {
  appliedLeagues: string[];
  skippedLeagues: string[];
  clubsBy: Record<string, number>;
  newClubs: Array<{ id: string; name: string; league: string }>;
  movedClubs: Array<{ squadId: string; from: string; to: string }>;
  removedClubs: string[];
  playersByLeague: Array<{ league: string; matched: number; created: number }>;
  youthAdded: number;
  overallByAge: Array<{ band: string; before: number; after: number }>;
}

export interface ApplyResult {
  world: World;
  report: EspnReport;
  /** squadId → ESPN crest file name (data_process/espn/logos/). */
  espnLogoOf: Map<string, string>;
  /** squadId → native league folder the club came from (only clubs that lived in a native league). */
  nativeLeagueOf: Map<string, string>;
}

export const NEW_CLUB_SHIFT = -0.3;
export const MIN_MATCHED_FOR_CLUB_BASE = 5;
export const MIN_LINE_FOR_CLUB_BASE = 3;
export const NATIVE_LEAGUES = new Set(["premier_league", "bundesliga", "la_liga", "serie_a", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]);
const AGE_BANDS: Array<[string, number, number]> = [["≤21", 0, 21], ["22–25", 22, 25], ["26–29", 26, 29], ["30–33", 30, 33], ["34+", 34, 99]];

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const clone = <T>(x: T): T => structuredClone(x);
const lineOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const hex = (c: string | null, fallback: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : fallback);

/** "2024-25" → "2026-27", "2025" → "2027". */
export function bumpSeason(season: string): string {
  const cross = /^(\d{4})-(\d{2})$/.exec(season);
  if (cross) { const y = Number(cross[1]) + 2; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
  if (/^\d{4}$/.test(season)) return String(Number(season) + 2);
  throw new Error(`bumpSeason: unexpected season label ${season}`);
}

function pyramidTier(pyr: Pyramids, slug: string): number {
  for (const p of Object.values(pyr)) for (const lv of p.levels) if (lv.groups.some((g) => g.leagueSlug === slug)) return lv.tier;
  return 1;
}

function namePools(players: RosterPlayer[]): Map<string, NamePool> {
  const pools = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const p of players) {
    const parts = p.name.trim().split(/\s+/);
    if (parts.length < 2 || !p.nationality) continue;
    const e = pools.get(p.nationality) ?? { first: new Set(), last: new Set() };
    e.first.add(parts[0]!); e.last.add(parts[parts.length - 1]!);
    pools.set(p.nationality, e);
  }
  return new Map([...pools].map(([k, v]) => [k, { first: [...v.first].sort(), last: [...v.last].sort() }]));
}

export function applyEspn(input: World, snap: EspnSnapshot, opts: ApplyOptions): ApplyResult {
  if (input.leagues.some((l) => /^202[6-9]/.test(l.season)))
    throw new Error("applyEspn: the world is already on 2026+ — run importOpenFootball first");
  const world: World = clone({ ...input, squads: new Map([...input.squads].map(([k, v]) => [k, v])) });

  // ── Index the input world ────────────────────────────────────────────────
  const leagueBySlug = new Map(world.leagues.map((l) => [l.slug, l]));
  const squadById = new Map<string, SquadFile>();
  const leagueOfSquad = new Map<string, string>();
  for (const [slug, ss] of world.squads) for (const s of ss) { squadById.set(s.id, s); leagueOfSquad.set(s.id, slug); }
  const nativeLeagueOf = new Map([...leagueOfSquad].filter(([, l]) => NATIVE_LEAGUES.has(l)));
  const playerById = new Map<string, RosterPlayer & { fullName?: string }>();
  for (const s of squadById.values()) for (const p of s.players) playerById.set(p.id, p);
  const overallBefore = [...playerById.values()].map((p) => ({ age: p.age, ovr: opts.overall(p) }));

  // ── Applied leagues ──────────────────────────────────────────────────────
  const snapBySlug = new Map(snap.leagues.map((l) => [l.slug, l]));
  const applied = opts.leagueMap.filter((m) => (snapBySlug.get(m.slug)?.teams.length ?? 0) > 0 && leagueBySlug.has(m.slug));
  const skipped = opts.leagueMap.filter((m) => !applied.includes(m)).map((m) => m.slug);
  const teamsOf = (slug: string) => [...snapBySlug.get(slug)!.teams].sort((a, b) => byId(a.id, b.id));
  const teamLeague = new Map<string, string>();
  for (const m of applied) for (const t of teamsOf(m.slug)) {
    if (teamLeague.has(t.id)) throw new Error(`applyEspn: ESPN team ${t.id} in two leagues`);
    teamLeague.set(t.id, m.slug);
  }

  // ── Clubs ────────────────────────────────────────────────────────────────
  const clubMatch = matchClubs(
    applied.flatMap((m) => teamsOf(m.slug).map((t) => ({ espnId: t.id, name: t.name, shortName: t.shortName, country: leagueBySlug.get(m.slug)!.country }))),
    [...squadById.values()].map((s) => ({ id: s.id, name: s.name, country: leagueBySlug.get(leagueOfSquad.get(s.id)!)!.country })),
    opts.clubOverrides,
  );
  const squadIdOfTeam = (t: EspnTeam) => clubMatch.get(t.id)!.squadId ?? `es_${t.id}`;
  const clubsBy: Record<string, number> = {};
  for (const m of clubMatch.values()) clubsBy[m.via] = (clubsBy[m.via] ?? 0) + 1;

  // ── Players ──────────────────────────────────────────────────────────────
  const athletes: AthleteRef[] = [];
  for (const m of applied) for (const t of teamsOf(m.slug)) for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id)))
    athletes.push({ espnId: a.id, displayName: a.displayName, fullName: a.fullName, age: a.age, role: espnRole(a.position), teamSquadId: clubMatch.get(t.id)!.squadId, teamCountry: leagueBySlug.get(m.slug)!.country });
  const playerMatch = matchPlayers(
    athletes,
    [...playerById.values()].map((p) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age, role: lineOf(p), squadId: p.squadId, country: leagueBySlug.get(leagueOfSquad.get(p.squadId)!)!.country })),
    opts.playerOverrides,
  );
  const claimedPlayers = new Set(playerMatch.values());

  // ── Membership ───────────────────────────────────────────────────────────
  const leagueRefs: LeagueRef[] = world.leagues.map((l) => ({
    slug: l.slug, country: l.country, tier: pyramidTier(world.pyramids, l.slug),
    members: (world.squads.get(l.slug) ?? []).map((s) => s.id),
  }));
  const lineup = planLineup(leagueRefs, new Map(applied.map((m) => [m.slug, teamsOf(m.slug).map(squadIdOfTeam)])));

  // ── Rebuild applied clubs ────────────────────────────────────────────────
  const built = new Map<string, SquadFile>();
  const espnLogoOf = new Map<string, string>();
  const newClubIds = new Set<string>();
  const matchedIn = new Map<string, RosterPlayer[]>(); // squadId → matched players (after aging)
  const playersByLeague: EspnReport["playersByLeague"] = [];
  const pending: Array<{ squadId: string; league: string; a: EspnTeam["athletes"][number] }> = [];

  for (const m of applied) {
    let matched = 0;
    let created = 0;
    for (const t of teamsOf(m.slug)) {
      const sid = squadIdOfTeam(t);
      const existing = squadById.get(sid);
      const base: SquadFile = existing ? clone(existing) : {
        id: sid, slug: sid, name: t.name, colors: [hex(t.color, "#555555"), hex(t.altColor, "#ffffff")],
        country: leagueBySlug.get(m.slug)!.country, source: "espn", players: [],
      };
      if (!existing) newClubIds.add(sid);
      if (t.coach) base.coach = { ...(base.coach ?? { id: Math.floor(unitHash(sid) * 1e9) }), name: t.coach };
      if (t.logoFile) espnLogoOf.set(sid, t.logoFile);
      base.players = [];
      const aged: RosterPlayer[] = [];
      for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id))) {
        const pid = playerMatch.get(a.id);
        if (!pid) { pending.push({ squadId: sid, league: m.slug, a }); created++; continue; }
        const src = playerById.get(pid)!;
        const p = clone(src);
        const newAge = a.age ?? src.age;
        p.stats = agePlayerStats(p.id, src.stats, src.age, newAge, opts.roleWeights(src));
        p.age = newAge;
        p.squadId = sid;
        if (a.citizenship) p.nationality = a.citizenship;
        const er = espnRole(a.position);
        if (er && er !== lineOf(src)) p.positions = [er];
        delete p.overallAvg;
        base.players.push(p);
        aged.push(p);
        matched++;
      }
      matchedIn.set(sid, aged);
      built.set(sid, base);
    }
    playersByLeague.push({ league: m.slug, matched, created });
  }

  // ── Non-covered clubs: keep their data, minus the players claimed by covered clubs ──
  const finalMembers = lineup.members;
  const removed = new Set(lineup.removed);
  for (const ids of finalMembers.values()) {
    for (const id of ids) {
      if (built.has(id)) continue;
      const s = clone(squadById.get(id)!);
      s.players = s.players.filter((p) => !claimedPlayers.has(p.id));
      built.set(id, s);
    }
  }

  // ── Bases for estimated players ──────────────────────────────────────────
  const leagueOfFinal = new Map<string, string>();
  for (const [slug, ids] of finalMembers) for (const id of ids) leagueOfFinal.set(id, slug);
  const allMatched = [...matchedIn.values()].flat();
  const worldBase = lineMedians(allMatched.length ? allMatched : [...playerById.values()]);
  const leagueBase = new Map<string, ReturnType<typeof lineMedians>>();
  for (const [slug, ids] of finalMembers) leagueBase.set(slug, lineMedians(ids.flatMap((id) => matchedIn.get(id) ?? built.get(id)!.players)));
  const fallbackStats = (line: MainRole): PlayerStatsRecord => worldBase[line] ?? worldBase.Midfielder!;
  const baseFor = (sid: string, line: MainRole): { stats: PlayerStatsRecord; shift: number } => {
    const league = leagueOfFinal.get(sid)!;
    const own = matchedIn.get(sid) ?? built.get(sid)!.players;
    const useClub = !newClubIds.has(sid) || own.length >= MIN_MATCHED_FOR_CLUB_BASE;
    const ownLine = own.filter((p) => lineOf(p) === line);
    if (useClub && ownLine.length >= MIN_LINE_FOR_CLUB_BASE) return { stats: lineMedians(ownLine)[line]!, shift: 0 };
    const lb = leagueBase.get(league)?.[line] ?? fallbackStats(line);
    return { stats: lb, shift: newClubIds.has(sid) && !useClub ? NEW_CLUB_SHIFT : 0 };
  };

  for (const { squadId, a } of pending) {
    const line = espnRole(a.position) ?? "Midfielder";
    const { stats: b, shift } = baseFor(squadId, line);
    const id = `es_${a.id}`;
    const age = a.age ?? 25;
    const stats = estimateStats(id, age, b, shift);
    const draft = makePlayer({ id, name: a.displayName, fullName: a.fullName, age, role: line, squadId, nationality: a.citizenship, stats }, 0);
    built.get(squadId)!.players.push(makePlayer({ id, name: a.displayName, fullName: a.fullName, age, role: line, squadId, nationality: a.citizenship, stats }, opts.overall(draft)));
  }

  // ── New club metadata ────────────────────────────────────────────────────
  for (const sid of newClubIds) {
    const s = built.get(sid)!;
    const peers = (finalMembers.get(leagueOfFinal.get(sid)!) ?? []).filter((id) => !newClubIds.has(id)).map((id) => built.get(id)!);
    const med = (f: (x: SquadFile) => number | undefined) => Math.round(median(peers.map(f).filter((v): v is number => typeof v === "number")));
    const broadcasting = med((x) => x.finances?.broadcasting);
    const commercial = med((x) => x.finances?.commercial);
    s.finances = { broadcasting, commercial, total: broadcasting + commercial, budget: med((x) => x.finances?.budget), followers: med((x) => x.finances?.followers) };
    const team = [...teamLeague.keys()].find((tid) => `es_${tid}` === sid)!;
    const t = teamsOf(teamLeague.get(team)!).find((x) => x.id === team)!;
    s.venue = { name: `${s.name} Stadium`, city: t.location || null, capacity: med((x) => x.venue?.capacity) || 10000, surface: "grass" };
    if (!s.coach) s.coach = { id: Math.floor(unitHash(sid) * 1e9), name: coachName(sid, { first: [], last: [] }) };
  }

  // ── Squad sizes ──────────────────────────────────────────────────────────
  const pools = namePools([...playerById.values()]);
  const EMPTY: NamePool = { first: [], last: [] };
  let youthAdded = 0;
  for (const [id, s] of built) {
    if (removed.has(id)) continue;
    const country = s.country ?? leagueBySlug.get(leagueOfFinal.get(id)!)!.country;
    const trimmed = trimSquad(s.players, MAX_SQUAD, opts.overall);
    const filled = fillSquad(id, trimmed, pools.get(country) ?? EMPTY, country, (line) => baseFor(id, line).stats, opts.overall);
    youthAdded += filled.filter((p) => p.id.startsWith(`es_youth_${id}_`)).length;
    s.players = filled as SquadFile["players"];
  }

  // ── Assemble leagues ─────────────────────────────────────────────────────
  const oldRow = new Map<string, StandingRow>();
  for (const l of world.leagues) for (const r of l.standings) oldRow.set(r.squadId, r);
  const squadsOut = new Map<string, SquadFile[]>();
  for (const l of world.leagues) {
    const ids = finalMembers.get(l.slug) ?? [];
    squadsOut.set(l.slug, ids.map((id) => built.get(id)!));
    l.standings = ids.map((id) => {
      const s = built.get(id)!;
      const prev = oldRow.get(id);
      const row: StandingRow = { squadId: id, slug: s.slug, name: s.name, colors: s.colors, country: s.country ?? l.country };
      if (prev?.logo) row.logo = prev.logo;
      return row;
    });
    l.season = bumpSeason(l.season);
  }

  // ── Pyramids, zones, schedules ───────────────────────────────────────────
  const pyramids = buildPyramid(
    world.leagues.map((l) => ({ slug: l.slug, country: l.country, clubs: l.standings.length, tier: pyramidTier(world.pyramids, l.slug) })),
    { boundaries: opts.boundaries },
  );
  for (const l of world.leagues) {
    const g = pyramidGroupOf(pyramids, l.slug);
    if (g) l.zones = zonesFromPyramid(g, l.zones ?? []);
  }
  const sizeOf = new Map(world.leagues.map((l) => [l.slug, l.standings.length]));
  for (const sc of world.schedules) {
    const clubs = sizeOf.get(sc.slug);
    if (clubs === undefined) continue;
    const rounds = 2 * (clubs - 1 + (clubs % 2));
    sc.matchDays = rounds > 40 ? [3, 6, 0] : sc.matchDays.length === 3 ? [6, 0] : sc.matchDays;
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const after = [...built.entries()].filter(([id]) => !removed.has(id)).flatMap(([, s]) => s.players).map((p) => ({ age: p.age, ovr: opts.overall(p) }));
  const band = (xs: Array<{ age: number; ovr: number }>, lo: number, hi: number) => {
    const b = xs.filter((x) => x.age >= lo && x.age <= hi);
    return b.length ? b.reduce((s, x) => s + x.ovr, 0) / b.length : 0;
  };
  const report: EspnReport = {
    appliedLeagues: applied.map((m) => m.slug),
    skippedLeagues: skipped,
    clubsBy,
    newClubs: [...newClubIds].sort(byId).map((id) => ({ id, name: built.get(id)!.name, league: leagueOfFinal.get(id)! })),
    movedClubs: lineup.moves,
    removedClubs: lineup.removed,
    playersByLeague,
    youthAdded,
    overallByAge: AGE_BANDS.map(([label, lo, hi]) => ({ band: label, before: band(overallBefore, lo, hi), after: band(after, lo, hi) })),
  };

  return { world: { ...world, squads: squadsOut, pyramids }, report, espnLogoOf, nativeLeagueOf };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test scripts/espn`
Esperado: todos passam (os de `apply` e os módulos anteriores).

- [ ] **Step 6: Commit**

```bash
git add scripts/espn/apply.ts scripts/espn/apply.test.ts scripts/espn/fixtures.ts
git commit -m "feat(espn): pure applyEspn overlay (clubs, players, lineup, aging, estimates, pyramids)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `fetchEspn.ts` e configuração

**Files:**
- Create: `data_process/espn/leagueMap.json`, `data_process/espn/clubOverrides.json`, `data_process/espn/playerOverrides.json`
- Create: `scripts/fetchEspn.ts`

- [ ] **Step 1: Configuração**

`data_process/espn/leagueMap.json`:

```json
[
  { "slug": "premier_league", "code": "eng.1" },
  { "slug": "of_championship", "code": "eng.2" },
  { "slug": "la_liga", "code": "esp.1" },
  { "slug": "of_spanish_second_division", "code": "esp.2" },
  { "slug": "bundesliga", "code": "ger.1" },
  { "slug": "serie_a", "code": "ita.1" },
  { "slug": "of_italian_serie_b", "code": "ita.2" },
  { "slug": "ligue_1", "code": "fra.1" },
  { "slug": "of_ligue_2", "code": "fra.2" },
  { "slug": "brazil_serie_a", "code": "bra.1" },
  { "slug": "brazil_serie_b", "code": "bra.2" },
  { "slug": "of_argentine_premier_division", "code": "arg.1" },
  { "slug": "of_a_league", "code": "aus.1" },
  { "slug": "of_austrian_bundesliga", "code": "aut.1" },
  { "slug": "of_belgian_pro_league", "code": "bel.1" },
  { "slug": "of_chilean_primera_division", "code": "chi.1" },
  { "slug": "of_colombian_first_division", "code": "col.1" },
  { "slug": "of_danish_superliga", "code": "den.1" },
  { "slug": "of_greek_super_league", "code": "gre.1" },
  { "slug": "of_j_league", "code": "jpn.1" },
  { "slug": "of_liga_mx", "code": "mex.1" },
  { "slug": "of_eredivisie", "code": "ned.1" },
  { "slug": "of_eliteserien", "code": "nor.1" },
  { "slug": "of_paraguayan_primera_division", "code": "par.1" },
  { "slug": "of_peruvian_primera_division", "code": "per.1" },
  { "slug": "of_portuguese_primeira_liga", "code": "por.1" },
  { "slug": "of_russian_premier_league", "code": "rus.1" },
  { "slug": "of_saudi_professional_league", "code": "ksa.1" },
  { "slug": "of_south_african_psl", "code": "rsa.1" },
  { "slug": "of_allsvenskan", "code": "swe.1" },
  { "slug": "of_turkish_super_league", "code": "tur.1" },
  { "slug": "of_major_league_soccer", "code": "usa.1" },
  { "slug": "of_uruguayan_first_division", "code": "uru.1" },
  { "slug": "of_venezuelan_primera_division", "code": "ven.1" }
]
```

`data_process/espn/clubOverrides.json` e `data_process/espn/playerOverrides.json`: `{}` (preenchidos na Task 13).

- [ ] **Step 2: Criar `scripts/fetchEspn.ts`**

```ts
/**
 * Downloads the ESPN snapshot used by importEspn.ts (the only step that touches the network).
 *
 *   bun scripts/fetchEspn.ts
 *
 * For every league in data_process/espn/leagueMap.json: clubs (site API /teams), squads (/teams/{id}/roster)
 * and crests (128 px through the ESPN image resizer, dark variant first). Writes
 * data_process/espn/snapshot.json and data_process/espn/logos/{teamId}.png. Uses curl: Bun's fetch fails
 * against ESPN on Windows.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EspnAthlete, EspnLeague, EspnPos, EspnSnapshot, EspnTeam, LeagueMapEntry } from "@/../scripts/espn/types";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIR = join(ROOT, "data_process", "espn");
const LOGOS = join(DIR, "logos");
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CONCURRENCY = 8;

async function curlJson(url: string): Promise<any> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", url], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(p.stdout).text();
    if ((await p.exited) === 0 && text) return JSON.parse(text);
  }
  throw new Error(`curl failed: ${url}`);
}

async function curlFile(url: string, out: string): Promise<boolean> {
  const p = Bun.spawn(["curl", "-s", "-f", "--max-time", "30", "-o", out, url], { stdout: "ignore", stderr: "ignore" });
  return (await p.exited) === 0 && existsSync(out);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); }
  }));
  return out;
}

const POS = new Set(["G", "D", "M", "F"]);
function athlete(a: any): EspnAthlete {
  const pos = a.position?.abbreviation;
  return {
    id: String(a.id),
    displayName: String(a.displayName ?? a.fullName ?? ""),
    fullName: String(a.fullName ?? a.displayName ?? ""),
    age: typeof a.age === "number" ? a.age : null,
    position: POS.has(pos) ? (pos as EspnPos) : null,
    citizenship: typeof a.citizenship === "string" ? a.citizenship : null,
  };
}

function logoUrl(t: any): string | null {
  const logos: Array<{ href: string; rel: string[] }> = t.logos ?? [];
  const pick = logos.find((l) => l.rel.includes("dark")) ?? logos.find((l) => l.rel.includes("default")) ?? logos[0];
  if (!pick) return null;
  return `https://a.espncdn.com/combiner/i?img=${new URL(pick.href).pathname}&w=128&h=128`;
}

async function fetchTeam(code: string, t: any): Promise<EspnTeam> {
  const roster = await curlJson(`${API}/${code}/teams/${t.id}/roster`);
  const coach = roster.coach?.[0];
  const url = logoUrl(t);
  const file = `${t.id}.png`;
  const ok = url ? await curlFile(url, join(LOGOS, file)) : false;
  return {
    id: String(t.id),
    name: String(t.displayName),
    shortName: String(t.shortDisplayName ?? t.displayName),
    location: String(t.location ?? ""),
    color: t.color ?? null,
    altColor: t.alternateColor ?? null,
    logoFile: ok ? file : null,
    coach: coach ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() || null : null,
    athletes: (roster.athletes ?? []).map(athlete).sort((a: EspnAthlete, b: EspnAthlete) => a.id.localeCompare(b.id, "en", { numeric: true })),
  };
}

const map = JSON.parse(readFileSync(join(DIR, "leagueMap.json"), "utf-8")) as LeagueMapEntry[];
rmSync(LOGOS, { recursive: true, force: true });
mkdirSync(LOGOS, { recursive: true });

const leagues: EspnLeague[] = [];
for (const m of map) {
  const j = await curlJson(`${API}/${m.code}/teams`);
  const lg = j.sports?.[0]?.leagues?.[0];
  const raw = (lg?.teams ?? []).map((x: any) => x.team);
  const teams = await pool(raw, CONCURRENCY, (t) => fetchTeam(m.code, t));
  teams.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const season = String(lg?.season?.displayName ?? lg?.season?.year ?? "");
  leagues.push({ slug: m.slug, code: m.code, name: String(lg?.name ?? m.code), season, teams });
  const players = teams.reduce((s, t) => s + t.athletes.length, 0);
  const logos = teams.filter((t) => t.logoFile).length;
  console.log(`${m.slug.padEnd(34)} ${m.code.padEnd(6)} clubs ${String(teams.length).padStart(3)}  players ${String(players).padStart(4)}  crests ${logos}`);
}

const snap: EspnSnapshot = { fetchedAt: new Date().toISOString().slice(0, 10), leagues };
writeFileSync(join(DIR, "snapshot.json"), `${JSON.stringify(snap, null, 1)}\n`);
console.log(`snapshot ${snap.fetchedAt}: ${leagues.length} leagues`);
```

- [ ] **Step 3: Rodar o download**

Run: `bun scripts/fetchEspn.ts`
Esperado: uma linha por liga com clubes, jogadores e escudos (ex.: `premier_league eng.1 clubs 20 players ~550 crests 20`), e no fim `snapshot 2026-09-25: 34 leagues`. Leva alguns minutos.

Confira o tamanho: `du -sh data_process/espn/logos data_process/espn/snapshot.json` (esperado: escudos ~7 MB; snapshot alguns MB).

- [ ] **Step 4: Commit**

```bash
git add scripts/fetchEspn.ts data_process/espn
git commit -m "feat(espn): fetch script, league map and first snapshot (2026-09-25)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `importEspn.ts` (IO, integridade, relatório)

**Files:**
- Create: `scripts/importEspn.ts`

- [ ] **Step 1: Criar o script**

```ts
/**
 * Applies the ESPN snapshot on top of the world produced by importOpenFootball.ts.
 *
 *   bun scripts/importOpenFootball.ts && bun scripts/importEspn.ts
 *
 * Reads data_process/espn/{snapshot,leagueMap,clubOverrides,playerOverrides}.json and src/example_data,
 * runs applyEspn (scripts/espn/apply.ts) and rewrites squads/, leagueData.json, leagueSchedules.json,
 * pyramids.json, databases.json, logoIndex.json and logos/espn/. Fails when the world is already on 2026+.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEspn, type World } from "@/../scripts/espn/apply";
import { ESPN_LOGO_DIR, buildLogoIndex } from "@/../scripts/espn/logos";
import type { EspnSnapshot, LeagueMapEntry } from "@/../scripts/espn/types";
import { formatSchedules } from "@/../scripts/openfootball/leagues";
import { MIN_BY_ROLE, MIN_SQUAD } from "@/../scripts/openfootball/roster";
import type { BoundaryOverrides } from "@/../scripts/openfootball/pyramid";
import { checkWorldIntegrity } from "@/../scripts/world/integrity";
import type { LeagueEntry, SquadFile } from "@/../scripts/world/types";
import ROLES from "@/example_data/roles.json";
import { Player } from "@/Domain/Player";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Pyramids } from "@/types/pyramidTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ESPN = join(ROOT, "data_process", "espn");
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const LOGOS = join(DATA, "logos");

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf-8")) as T;
const writeJson = (p: string, v: unknown, indent: number) => writeFileSync(p, `${JSON.stringify(v, null, indent)}\n`);

// ── Load ────────────────────────────────────────────────────────────────────
const snap = readJson<EspnSnapshot>(join(ESPN, "snapshot.json"));
const leagueMap = readJson<LeagueMapEntry[]>(join(ESPN, "leagueMap.json"));
const clubOverrides = readJson<Record<string, string>>(join(ESPN, "clubOverrides.json"));
const playerOverrides = readJson<Record<string, string>>(join(ESPN, "playerOverrides.json"));
const { boundaries } = readJson<{ boundaries?: BoundaryOverrides }>(join(ROOT, "data_process", "openfootball", "pyramidOverrides.json"));
for (const m of leagueMap) if (!snap.leagues.some((l) => l.slug === m.slug)) throw new Error(`snapshot has no league ${m.slug} — run fetchEspn.ts`);

const leagues = readJson<LeagueEntry[]>(join(DATA, "leagueData.json"));
const squads = new Map<string, SquadFile[]>();
for (const l of leagues) {
  const dir = join(SQUADS, l.slug);
  squads.set(l.slug, readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => readJson<SquadFile>(join(dir, f))));
}
const world: World = {
  leagues,
  squads,
  schedules: readJson<LeagueScheduleConfig[]>(join(DATA, "leagueSchedules.json")),
  pyramids: readJson<Pyramids>(join(DATA, "pyramids.json")),
};

// ── Apply ───────────────────────────────────────────────────────────────────
const R = ROLES as Record<string, { attrWeights?: Record<string, number> }>;
const { world: out, report, espnLogoOf, nativeLeagueOf } = applyEspn(world, snap, {
  leagueMap, clubOverrides, playerOverrides, boundaries: boundaries ?? {},
  roleWeights: (p) => R[Player.bestSpecificRole(p.stats, p.positions[0] ?? "CM")]?.attrWeights ?? {},
  overall: (p) => Player.computeOverallAvg(p),
});

// ── Write ───────────────────────────────────────────────────────────────────
for (const d of readdirSync(SQUADS)) rmSync(join(SQUADS, d), { recursive: true, force: true });
for (const [slug, ss] of out.squads) {
  mkdirSync(join(SQUADS, slug), { recursive: true });
  for (const s of ss) writeFileSync(join(SQUADS, slug, `${s.id}.json`), JSON.stringify(s));
}
writeJson(join(DATA, "leagueData.json"), out.leagues, 2);
writeFileSync(join(DATA, "leagueSchedules.json"), formatSchedules(out.schedules));
writeJson(join(DATA, "pyramids.json"), out.pyramids, 2);

// Crests: logos/espn/{squadId}.png for clubs without a native crest, plus the index.
const nativeFiles = new Set<string>();
for (const d of readdirSync(LOGOS)) {
  if (d === ESPN_LOGO_DIR) continue;
  for (const f of readdirSync(join(LOGOS, d))) nativeFiles.add(`${d}/${f.replace(/\.(svg|png)$/i, "")}`);
}
const allSquads = [...out.squads.values()].flat();
const index = buildLogoIndex(
  allSquads.map((s) => ({ id: s.id, slug: s.slug, nativeLeague: nativeLeagueOf.get(s.id) ?? null })),
  nativeFiles,
  new Set([...espnLogoOf.keys()].filter((id) => existsSync(join(ESPN, "logos", espnLogoOf.get(id)!)))),
);
rmSync(join(LOGOS, ESPN_LOGO_DIR), { recursive: true, force: true });
mkdirSync(join(LOGOS, ESPN_LOGO_DIR), { recursive: true });
for (const [id, path] of Object.entries(index))
  if (path.startsWith(`${ESPN_LOGO_DIR}/`)) copyFileSync(join(ESPN, "logos", espnLogoOf.get(id)!), join(LOGOS, ESPN_LOGO_DIR, `${id}.png`));
writeJson(join(DATA, "logoIndex.json"), index, 0);

// ── Integrity ───────────────────────────────────────────────────────────────
const countries = readJson<Record<string, { flag?: unknown; continent?: unknown }>>(join(DATA, "countries.json"));
const totals = checkWorldIntegrity({
  leagueData: out.leagues, schedules: out.schedules, countries, pyramids: out.pyramids, squadsDir: SQUADS,
  mayHaveHandZones: (l) => l.source !== "open-football",
});
for (const s of allSquads) {
  if (s.players.length < MIN_SQUAD) throw new Error(`integrity: ${s.id} has ${s.players.length} players`);
  for (const line of ["GK", "Defender", "Midfielder", "Forward"] as const) {
    const n = s.players.filter((p) => getMainRole(p.positions[0] ?? "") === line).length;
    if (n < MIN_BY_ROLE[line]) throw new Error(`integrity: ${s.id} has ${n} ${line}`);
  }
}

// ── databases.json ──────────────────────────────────────────────────────────
const dbPath = join(DATA, "databases.json");
const databases = readJson<Array<Record<string, unknown>>>(dbPath);
const official = databases.find((d) => d.id === "official-2024");
if (!official) throw new Error("databases.json: official-2024 missing");
Object.assign(official, {
  name: "Official 2026/27",
  startDate: "July 1, 2026",
  lastUpdated: snap.fetchedAt,
  leagues: out.leagues.length,
  playableLeagues: out.leagues.filter((l) => out.schedules.some((s) => s.slug === l.slug)).length,
  players: totals.players,
});
writeJson(dbPath, databases, 2);

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`── ESPN import (snapshot ${snap.fetchedAt}) ──`);
console.log(`leagues applied ${report.appliedLeagues.length}, skipped ${report.skippedLeagues.length}${report.skippedLeagues.length ? ` (${report.skippedLeagues.join(", ")})` : ""}`);
console.log(`clubs by match: ${JSON.stringify(report.clubsBy)}`);
console.log(`new clubs (${report.newClubs.length}) — check each one against the world and add clubOverrides when it already exists:`);
for (const c of report.newClubs) console.log(`  ${c.id.padEnd(12)} ${c.name.padEnd(32)} → ${c.league}`);
console.log(`moved clubs (${report.movedClubs.length}):`);
for (const m of report.movedClubs) console.log(`  ${m.squadId.padEnd(28)} ${m.from} → ${m.to}`);
console.log(`removed clubs (${report.removedClubs.length}): ${report.removedClubs.join(", ")}`);
console.log("players matched / created per league (low match rate = check playerOverrides):");
for (const p of report.playersByLeague) {
  const rate = p.matched / Math.max(1, p.matched + p.created);
  console.log(`  ${p.league.padEnd(34)} ${String(p.matched).padStart(4)} / ${String(p.created).padStart(4)}  ${(rate * 100).toFixed(0)}%${rate < 0.5 ? "  ⚠" : ""}`);
}
console.log(`youth added: ${report.youthAdded}`);
console.log("mean overall by age (before → after):");
for (const b of report.overallByAge) console.log(`  ${b.band.padEnd(6)} ${b.before.toFixed(2)} → ${b.after.toFixed(2)}`);
console.log(`world: ${out.leagues.length} leagues, ${totals.squads} squads, ${totals.players} players, ${Object.keys(index).length} crests`);
console.log("integrity checks passed");
```

- [ ] **Step 2: Rodar a cadeia**

```bash
bun scripts/importOpenFootball.ts | tail -1
bun scripts/importEspn.ts
```

Esperado: termina com `integrity checks passed`. Guarde a saída (vai ser usada na Task 13).

- [ ] **Step 3: Conferir a idempotência da cadeia**

```bash
worldHash() { find src/example_data -type f -not -path "*/startKits/*" | sort | xargs cat | sha1sum; }
A=$(worldHash)
bun scripts/importOpenFootball.ts > /dev/null && bun scripts/importEspn.ts > /dev/null
B=$(worldHash)
[ "$A" = "$B" ] && echo "idempotent" || echo "DIFFERENT"
bun scripts/importEspn.ts 2>&1 | tail -1
```

Esperado: `idempotent`, e a última linha é o erro `applyEspn: the world is already on 2026+ — run importOpenFootball first`.

- [ ] **Step 4: Commit (só o script; os dados entram na Task 13)**

```bash
git add scripts/importEspn.ts
git commit -m "feat(espn): importEspn writes the 2026/27 world, crests and report

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Revisar correspondências e gerar o mundo

**Files:**
- Modify: `data_process/espn/clubOverrides.json`, `data_process/espn/playerOverrides.json`
- Modify (gerados): `src/example_data/**`

- [ ] **Step 1: Revisar os clubes novos**

Para cada linha em "new clubs" do relatório, procure o clube no mundo de 2024/25 do mesmo país:

```bash
git show main:src/example_data/leagueData.json | bun -e 'const ld=JSON.parse(await Bun.stdin.text()); const q=process.argv[1].toLowerCase(); for (const l of ld) for (const s of l.standings) if (s.name.toLowerCase().includes(q)) console.log(l.slug, s.squadId, s.name)' "wolv"
```

Se ele existir, acrescente em `clubOverrides.json` `"<espnTeamId>": "<squadId>"` (o espnTeamId é o número depois de `es_`). Casos esperados: Wolverhampton → Wolves, "Brighton & Hove Albion" se não casar, e clubes brasileiros ou argentinos com nome oficial longo ("Club de Regatas Vasco da Gama", "Club Atlético River Plate"). Um clube que de fato não existia no mundo (promovido de uma liga que o jogo não tem) fica como novo.

- [ ] **Step 2: Revisar ligas com poucos jogadores reconhecidos**

Para cada liga marcada com ⚠ (menos de 50%), olhe 10 jogadores criados que deveriam existir, por exemplo:

```bash
bun -e 'const s=JSON.parse(await Bun.file("data_process/espn/snapshot.json").text()); const l=s.leagues.find(x=>x.slug===process.argv[1]); for (const t of l.teams.slice(0,2)) for (const a of t.athletes.slice(0,10)) console.log(t.name, a.id, a.displayName, a.age, a.position)' of_j_league
```

Diferenças sistemáticas de grafia (ex.: nomes japoneses invertidos) justificam override só para os jogadores importantes. Não tente cobrir todos: o jogador não reconhecido vira um novato com o nível do clube, que é o comportamento previsto.

- [ ] **Step 3: Regenerar com os overrides**

```bash
bun scripts/importOpenFootball.ts | tail -1 && bun scripts/importEspn.ts
```

Esperado: `new clubs` só com clubes que de fato não existiam; `integrity checks passed`. Na tabela "mean overall by age", a média geral por faixa não pode variar mais que ±0,5 entre antes e depois (se variar, reveja a tabela `AGE_DELTA` antes de seguir).

- [ ] **Step 4: Commit dos dados gerados**

```bash
git add data_process/espn/clubOverrides.json data_process/espn/playerOverrides.json src/example_data
git commit -m "data: 2026/27 world from the ESPN snapshot

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Nome da database e anos fixos

**Files:**
- Modify: `src/i18n/locales/en.json:208-210`, `src/i18n/locales/pt-BR.json:195-197`
- Modify: `src/backend/startKits.ts:11`, `scripts/generateStartKits.ts:5`, `src/backend/SaveService.ts:30`

- [ ] **Step 1: i18n**

Em `en.json`, dentro de `"official-2024"`: `"name": "Official 2026/27"`. Em `pt-BR.json`: `"name": "Oficial 2026/27"`. Se houver `description` citando 2024, atualize igual.

- [ ] **Step 2: Comentários com data**

- `src/backend/startKits.ts:11`: `2025-02-05` → `2027-02-05`
- `scripts/generateStartKits.ts:5`: `(2025-02-05)` → `(2027-02-05)`
- `src/backend/SaveService.ts:30`: `"Official 2024/25"` → `"Official 2026/27"`

- [ ] **Step 3: Conferir que nada mais fixa o ano**

Run: `grep -rnE "2024-25|2025-02-05|2024/25" src scripts --include=*.ts --include=*.tsx | grep -v "\.test\.\|example_data\|src/Data"`
Esperado: nenhuma linha (as de teste podem ficar).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/pt-BR.json src/backend/startKits.ts scripts/generateStartKits.ts src/backend/SaveService.ts
git commit -m "chore: database and comments move to the 2026/27 season

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Runtime, startKits e verificação

- [ ] **Step 1: Sincronizar o runtime e checar tipos e testes**

```bash
cp -R src/example_data/. src/Data/
bunx tsc --noEmit -p .
bun test
```

Esperado: typecheck limpo, todos os testes passam.

- [ ] **Step 2: Regenerar os startKits**

```bash
bun run kits:generate 5
rm -f src/example_data/startKits/*
cp src/Data/startKits/* src/example_data/startKits/
```

Esperado: 5 kits simulados até `2027-02-05` (~4 min).

- [ ] **Step 3: Smokes**

```bash
bun scripts/membership-smoke.ts
bun scripts/season-rollover-smoke.ts
```

Esperado: os dois passam (o segundo leva ~15 min).

- [ ] **Step 4: Volume de gols**

```bash
mkdir -p "$TEMP/qs"
for l in premier_league of_championship brazil_serie_a of_j_league; do
  bun scripts/quicksim-spread.ts collect $l 100 2 "$TEMP/qs/$l.json" &
done; wait
bun scripts/quicksim-spread.ts analyze "$TEMP/qs" | head -40
```

Esperado: erro do quickSim contra o motor dentro de ±15% por liga. Anote os números no commit; recalibrar o quickSim, se preciso, é outro item.

- [ ] **Step 5: Conferir no navegador**

Suba o app (`bun --hot src/index.ts`), crie uma carreira na Championship e confira:
- data de início 05/02/2027;
- a tabela com 24 clubes, incluindo o Wolves;
- os escudos aparecendo nas telas de liga, finanças e resumo do dia;
- um clube sem escudo (liga não coberta) mostrando o brasão de cores sem erro no console.

- [ ] **Step 6: Commit**

```bash
git add src/example_data/startKits
git commit -m "data: start kits regenerated for the 2026/27 world

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Documentação

**Files:**
- Create: `.claude/rules/data/espn-import.md`
- Modify: `.claude/rules/data/openfootball-import.md`, `.claude/rules/ui-world.md`

- [ ] **Step 1: Criar `.claude/rules/data/espn-import.md`**

```markdown
# Importador de elencos da ESPN (mundo 2026/27)

Spec: `docs/superpowers/specs/2026-09-25-espn-roster-import-design.md`.

## Fontes

| Caminho | O que é |
|---|---|
| `data_process/native/` | Fonte dos 8 elencos nativos e das entradas nativas de leagueData, leagueSchedules e countries. **Edite aqui**, nunca em `src/example_data` |
| `data_process/espn/snapshot.json` | Snapshot da API pública da ESPN (clubes, elencos, técnicos). Gerado por `fetchEspn.ts` |
| `data_process/espn/logos/` | Escudos de 128 px por id de clube da ESPN |
| `data_process/espn/leagueMap.json` | Nosso slug ↔ código ESPN (34 ligas) |
| `data_process/espn/clubOverrides.json` | `espnTeamId → squadId` quando o nome não casa |
| `data_process/espn/playerOverrides.json` | `espnAthleteId → playerId` |

`src/example_data/squads`, `leagueData.json`, `leagueSchedules.json`, `pyramids.json`, `logoIndex.json`
e `logos/espn/` são saída. Não edite à mão.

## Regenerar

```bash
bun scripts/fetchEspn.ts            # só para atualizar o snapshot (rede, curl)
bun scripts/importOpenFootball.ts   # mundo 2024/25 a partir das fontes
bun scripts/importEspn.ts           # overlay 2026/27
cp -R src/example_data/. src/Data/
bun run kits:generate 5
rm -f src/example_data/startKits/* && cp src/Data/startKits/* src/example_data/startKits/
```

O `importEspn` recusa um mundo que já está em 2026+: rode sempre a cadeia inteira.

## Módulos (`scripts/espn/`)

| Módulo | Faz |
|---|---|
| `normalize` | Chaves de nome (clube estrita/solta, jogador) |
| `matchClubs` | Override → exato → solto → prefixo → novo (`es_<espnId>`), sempre dentro do país |
| `matchPlayers` | Nome + idade ESPN − idade do mundo em 0..3 + mesma linha ou vizinha; mundo inteiro |
| `lineup` | Composição nova; quem sai de liga coberta desce para a divisão não coberta mais alta do país ou sai do mundo |
| `aging` | Até 2 anos de curva de idade (Δ por ano por faixa, `attrWeights` do papel, teto suave, declínio físico ×2) |
| `estimate` | Novatos pela mediana da linha (clube, senão liga; clube novo −0,3), jovens, corte a 30 |
| `logos` | Índice `squadId → pasta/stem` (nativo primeiro, depois ESPN) |
| `apply` | `applyEspn`: junta tudo, reconstrói pirâmide/zonas, avança a temporada (+2 anos) |

## Escudos no front

`squadLogoUrl` lê `logoIndex.json` (`src/Domain/world/logos.ts`). Clube fora do índice não faz
requisição e o `ClubLogo` desenha o brasão pelas cores.

## Limites

- Ligas de ano civil: a ESPN está na temporada 2026 em andamento, então a 2027 do jogo começa com a
  composição de 2026. Um `fetchEspn` depois da virada corrige.
- API não oficial: sem garantia de formato. O `fetchEspn` falha alto se o formato mudar.
```

- [ ] **Step 2: Apontar o doc do open-football para o novo fluxo**

Em `.claude/rules/data/openfootball-import.md`, na seção "Como regenerar", troque o bloco de comandos por uma frase e um link:

```markdown
A cadeia completa (open-football + ESPN + startKits) está em `.claude/rules/data/espn-import.md`.
Os elencos nativos vêm de `data_process/native/`; `src/example_data/squads` é só saída.
```

E em "Limitações conhecidas", troque o item "Sem escudos" por: `**Escudos.** Os clubes cobertos pela ESPN têm escudo em `logos/espn/`; os demais `of_*` usam o brasão de cores.`

- [ ] **Step 3: Atualizar `.claude/rules/ui-world.md`**

Na seção "Escudos", troque o primeiro parágrafo por:

```markdown
`squadLogoUrl(squadId)` consulta `logoIndex.json` (gerado pelo `importEspn`, helper puro em
`src/Domain/world/logos.ts`): `squadId → "{pasta}/{stem}"`, com o SVG/PNG nativo primeiro e o escudo
da ESPN (`logos/espn/{squadId}.png`) depois. Clube fora do índice não gera requisição.
```

- [ ] **Step 3b: Atualizar `.claude/rules/game/membership.md`**

Na seção "Frontend", troque o item "Escudos pela liga de origem" por: `**Escudos pelo índice.** `squadLogoUrl(squadId)` lê `logoIndex.json` (ver `ui-world.md`); a liga de catálogo não entra mais na URL do escudo.` Acrescente `.claude/rules/game/membership.md` ao `git add` do Step 5.

- [ ] **Step 4: Atualizar a memória do backlog**

Em `C:\Users\Administrator\.claude\projects\C--projects-fmproject\memory\pending-next-steps.md`, troque o item 2 por: `2. (feito 2026-09-25) Elencos 2026/27 pela ESPN — ver .claude/rules/data/espn-import.md.`

- [ ] **Step 5: Commit**

```bash
git add .claude/rules/data/espn-import.md .claude/rules/data/openfootball-import.md .claude/rules/ui-world.md
git commit -m "docs(rules): ESPN import pipeline and crest index

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
