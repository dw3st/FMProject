# Olheiros por país (Etapa 33) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada olheiro (chefe e de campo) conhece cada país de 0 a 100 — 90 no próprio, 40 no continente, 0 no resto, crescendo com as missões e caindo devagar fora do próprio país —, e esse conhecimento multiplica o ganho e a precisão dos relatórios das missões; as telas mostram o mapa-múndi do olheiro, o país forte e o conhecimento sobre o alvo da missão.

**Architecture:** modelo puro em `src/Domain/scouting/countryKnowledge.ts` (base pela nacionalidade, leitura com queda, crescimento, multiplicadores); `advanceScoutingWeek` recebe o conhecimento do líder por país e devolve os países visitados; `scoutingDay` grava o crescimento no `StaffMember` do clube do jogador. As rotas de olheiros e da comissão expõem os valores; o `WorldMap` do novo jogo ganha cor por país e vira o mapa do olheiro. A IA não tem olheiros: nada muda para ela. País moderado (40) = ritmo de hoje, exatamente.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-08-scout-countries-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — conferir `git diff --stat` (nenhum
  arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é CRLF: editar só com a ferramenta Edit e
  conferir 100% CRLF depois. Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-scoutcountry`, branch `feat/scout-countries` (já criada, com `src/Data` e `bun install`).
- A branch `feat/season-awards` (4.8) mexe em `scout-search` e no changelog: não tocar `scoutSearch.ts`/`scoutQuery.ts`.
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando.

---

### Task 1: Tipos e constantes

**Files:** Modify `src/types/staffTypes.ts`, `src/Domain/scouting/scoutingConfig.ts`.

- [ ] **Step 1: Tipos** — em `staffTypes.ts`:

```ts
/** What a scout knows of a country (`.claude/rules/game/scouting.md` → "Conhecimento por país"). */
export interface CountryKnowledgeEntry {
  /** 0..100, one decimal, value on `last`. */
  k: number;
  /** Last day a mission worked in this country (ISO). */
  last: string;
}
```

e em `StaffMember`:

```ts
  /** Scouts only: countries they learned on missions (sparse; absent = derived from the nationality). */
  countryKnowledge?: Record<string, CountryKnowledgeEntry>;
```

- [ ] **Step 2: Constantes** — em `SCOUTING`, uma seção nova:

```ts
  // ── Country knowledge of each scout (Etapa 33) ───────────────────────────
  COUNTRY: {
    NATIVE: 90,
    CONTINENT: 40,
    OTHER: 0,
    /** Knowledge at which the mission multipliers are exactly 1 (today's pace). */
    NEUTRAL: 40,
    /** `[k 0, k NEUTRAL, k 100]`. */
    GAIN_MULT: [0.75, 1.0, 1.2] as const,
    NOISE_MULT: [1.15, 1.0, 0.85] as const,
    /** Share of the gap to 100 learned per worked week. Continent: per country observed that week. */
    GROWTH: { country: 0.06, league: 0.06, youth: 0.06, player: 0.03, continent: 0.02 } as const,
    DECAY_GRACE_DAYS: 180,
    DECAY_PER_30_DAYS: 5,
    BANDS: { full: 70, moderate: 25 } as const,
  },
```

- [ ] **Step 3:** `bunx tsc --noEmit -p .` limpo. Commit `feat(olheiros): tipos e constantes do conhecimento por país`.

---

### Task 2: Modelo puro do conhecimento por país

**Files:** Create `src/Domain/scouting/countryKnowledge.ts`, `src/Domain/scouting/countryKnowledge.test.ts`.

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import {
  baseCountryKnowledge, countryBand, countryGainMult, countryKnowledgeOf, countryNoiseMult,
  growCountryKnowledge, pruneCountryKnowledge, strongCountry,
} from "@/Domain/scouting/countryKnowledge";

const scout = (extra: object = {}) => ({ nationality: "England", ...extra });

describe("country knowledge", () => {
  test("base from the nationality", () => {
    expect(baseCountryKnowledge("England", "England")).toBe(90);
    expect(baseCountryKnowledge("England", "Spain")).toBe(40);
    expect(baseCountryKnowledge("England", "Brazil")).toBe(0);
    expect(baseCountryKnowledge("", "Brazil")).toBe(0);
  });
  test("neutral is exactly 1", () => {
    expect(countryGainMult(40)).toBe(1);
    expect(countryNoiseMult(40)).toBe(1);
    expect(countryGainMult(0)).toBeCloseTo(0.75);
    expect(countryGainMult(90)).toBeCloseTo(1.1667, 3);
    expect(countryNoiseMult(100)).toBeCloseTo(0.85);
  });
  test("growth saturates and stamps the day", () => {
    const g = growCountryKnowledge(scout(), [{ country: "Brazil", rate: 0.06 }], "2027-03-01");
    expect(g.Brazil).toEqual({ k: 6, last: "2027-03-01" });
    let m = scout();
    for (let w = 0; w < 12; w++) m = { ...m, countryKnowledge: growCountryKnowledge(m, [{ country: "Spain", rate: 0.06 }], "2027-03-01") };
    expect(countryKnowledgeOf(m, "Spain", "2027-03-01")).toBeCloseTo(71.4, 0);
  });
  test("decays after 180 days down to the base; the own country never", () => {
    const m = scout({ countryKnowledge: { Spain: { k: 71, last: "2027-01-01" }, Brazil: { k: 52, last: "2027-01-01" }, England: { k: 100, last: "2027-01-01" } } });
    expect(countryKnowledgeOf(m, "Spain", "2027-06-30")).toBe(71);            // inside the grace
    expect(countryKnowledgeOf(m, "Spain", "2027-07-30")).toBeCloseTo(66, 0);  // 30 days past it
    expect(countryKnowledgeOf(m, "Spain", "2029-01-01")).toBe(40);            // floor: continent
    expect(countryKnowledgeOf(m, "Brazil", "2029-01-01")).toBe(0);            // floor: other
    expect(countryKnowledgeOf(m, "England", "2035-01-01")).toBe(100);         // never falls
  });
  test("bands, prune and strong country", () => {
    expect(countryBand(90)).toBe("full");
    expect(countryBand(40)).toBe("moderate");
    expect(countryBand(10)).toBe("none");
    const m = scout({ countryKnowledge: { Spain: { k: 40, last: "2026-01-01" }, Brazil: { k: 95, last: "2027-01-01" } } });
    expect(Object.keys(pruneCountryKnowledge(m, "2027-01-02"))).toEqual(["Brazil"]);
    expect(strongCountry(m, "2027-01-02")).toEqual({ country: "Brazil", k: 95 });
    expect(strongCountry(scout(), "2027-01-02")).toEqual({ country: "England", k: 90 });
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/scouting/countryKnowledge.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

```ts
import { SCOUTING } from "@/Domain/scouting/scoutingConfig";
import { clamp } from "@/Domain/math";
import { daysBetween } from "@/Domain/dates";
import type { CountryKnowledgeEntry, StaffMember, StaffRole } from "@/types/staffTypes";
import countriesRaw from "@/Data/countries.json";

/** Country knowledge of each scout (`.claude/rules/game/scouting.md` → "Conhecimento por país"). Pure. */

const C = SCOUTING.COUNTRY;
const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;
const continentOf = (country: string) => COUNTRIES[country]?.continent;

export type CountryBand = "full" | "moderate" | "none";
type Scout = Pick<StaffMember, "nationality" | "countryKnowledge">;

export const isScoutRole = (role: StaffRole) => role === "scout" || role === "fieldScout";

export function baseCountryKnowledge(nationality: string, country: string): number {
  if (!nationality || !country) return C.OTHER;
  if (country === nationality) return C.NATIVE;
  const a = continentOf(nationality);
  return a && a === continentOf(country) ? C.CONTINENT : C.OTHER;
}

/** Effective knowledge on `date`: the stored value decayed after the grace, never below the base; own country never falls. */
export function countryKnowledgeOf(scout: Scout, country: string, date: string): number {
  const base = baseCountryKnowledge(scout.nationality, country);
  const e = scout.countryKnowledge?.[country];
  if (!e) return base;
  if (country === scout.nationality) return Math.max(base, e.k);
  const idle = Math.max(0, daysBetween(e.last, date) - C.DECAY_GRACE_DAYS);
  return Math.round(Math.max(base, e.k - (C.DECAY_PER_30_DAYS * idle) / 30) * 10) / 10;
}

function curve(k: number, [atZero, atNeutral, atMax]: readonly [number, number, number]): number {
  const x = clamp(k, 0, 100);
  if (x <= C.NEUTRAL) return atZero + (atNeutral - atZero) * (x / C.NEUTRAL);
  return atNeutral + (atMax - atNeutral) * ((x - C.NEUTRAL) / (100 - C.NEUTRAL));
}
export const countryGainMult = (k: number) => curve(k, C.GAIN_MULT);
export const countryNoiseMult = (k: number) => curve(k, C.NOISE_MULT);

export const countryBand = (k: number): CountryBand => (k >= C.BANDS.full ? "full" : k >= C.BANDS.moderate ? "moderate" : "none");

/** One worked week: each visited country learns `rate` of its gap to 100 (from the effective value). */
export function growCountryKnowledge(scout: Scout, visits: { country: string; rate: number }[], date: string): Record<string, CountryKnowledgeEntry> {
  const out = { ...(scout.countryKnowledge ?? {}) };
  for (const v of visits) {
    if (!v.country || v.rate <= 0) continue;
    const cur = countryKnowledgeOf({ ...scout, countryKnowledge: out }, v.country, date);
    out[v.country] = { k: Math.round(Math.min(100, cur + (100 - cur) * v.rate) * 10) / 10, last: date };
  }
  return out;
}

/** Entries that decayed down to the base leave (nothing to remember). */
export function pruneCountryKnowledge(scout: Scout, date: string): Record<string, CountryKnowledgeEntry> {
  return Object.fromEntries(Object.entries(scout.countryKnowledge ?? {})
    .filter(([c]) => countryKnowledgeOf(scout, c, date) > baseCountryKnowledge(scout.nationality, c)));
}

/** Best country (tie: the nationality, then name). */
export function strongCountry(scout: Scout, date: string): { country: string; k: number } {
  let best = { country: scout.nationality, k: baseCountryKnowledge(scout.nationality, scout.nationality) };
  for (const c of Object.keys(scout.countryKnowledge ?? {}).sort()) {
    const k = countryKnowledgeOf(scout, c, date);
    if (k > best.k) best = { country: c, k };
  }
  return { country: best.country, k: Math.round(best.k) };
}

/** Effective knowledge of every game country (> 0), rounded. */
export function countryKnowledgeMap(scout: Scout, date: string, countries: string[] = Object.keys(COUNTRIES)): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of countries) { const k = Math.round(countryKnowledgeOf(scout, c, date)); if (k > 0) out[c] = k; }
  return out;
}

/** Mean knowledge over `countries` (a continent mission's countries). */
export function meanKnowledge(scout: Scout, countries: string[], date: string): number {
  if (countries.length === 0) return 0;
  return Math.round(countries.reduce((s, c) => s + countryKnowledgeOf(scout, c, date), 0) / countries.length);
}
```

(`curve` de `GAIN_MULT` em k 40 devolve exatamente `1.0`: garantir com `toBe(1)` no teste. Se o teste do decaimento
de 30 dias pedir arredondamento diferente, ajustar o teste — a fórmula é a da spec.)

- [ ] **Step 4:** testes passam; tsc limpo. Commit `feat(olheiros): modelo puro do conhecimento por país`.

---

### Task 3: Multiplicadores do país nas missões (puro)

**Files:** Modify `src/Domain/scouting/missions.ts`, `src/Domain/scouting/missions.test.ts`.

- [ ] **Step 1: Teste** (acrescentar em `missions.test.ts`, reaproveitando os construtores de pool/contexto que já existem
  no arquivo):
  - **Neutro idêntico:** `advanceScoutingWeek` com `countryK: () => 40` produz o mesmo `state` e as mesmas `news` que sem
    `countryK` (`toEqual`), com missão de país, de jogador e de continente.
  - **Ganho:** com o mesmo pool e a mesma semente, o conhecimento gravado de cada observado com `countryK: () => 90` é
    `≈ 1,167 ×` o ganho neutro (sobre o mesmo ponto de partida) e com `() => 0` é `0,75 ×`.
  - **Relatório:** `seenProfile(p, k, ctx, 0.85).noise === uncertaintyOf(k, chief) × 0.85`; `buildReport` com
    `noiseMult` menor tem faixa de nível mais estreita.
  - **Visitas:** `WeekResult.visits` traz, por missão trabalhada, `{ missionId, scoutId, countries: Record<país, observados> }`;
    missão de jogador sem alvo não aparece.
  - **Prospectos:** `addProspects(..., { ..., countryK: 90 })` grava `k` = neutro × 1,167.

- [ ] **Step 2: Implementação**
  - `seenProfile(player, k, ctx, noiseMult = 1)`: `noise = uncertaintyOf(k, ctx.chief.uncertainty) * noiseMult`.
  - `buildReport(entry, k, ctx, args: { missionId?; youthMission?; noiseMult?: number })` passa `args.noiseMult` ao
    `seenProfile`.
  - `MissionWeekInput.countryK?: (country: string) => number` (conhecimento do líder no início da semana; ausente = neutro).
  - Em `advanceScoutingWeek`, por observado: `const kc = input.countryK?.(e.country) ?? SCOUTING.COUNTRY.NEUTRAL;`
    ganho `× countryGainMult(kc)`; relatório com `noiseMult: countryNoiseMult(kc)`. Acumular
    `visits[mission.id].countries[e.country] += 1` (só países não vazios).
  - `WeekResult.visits: { missionId: string; scoutId: string; kind: ScoutTargetKind; countries: Record<string, number> }[]`.
  - `addProspects(state, prospects, ctx, { missionId, leaderRating, countryK?: number })`: `k` × `countryGainMult`,
    relatório com `countryNoiseMult`.
  - `recordRecommendations` não muda (não é missão).
  - Helper puro `countryVisits(visit): { country: string; rate: number }[]`: país/liga/jovens/jogador → a taxa da
    `GROWTH[kind]` para cada país visitado; continente → `GROWTH.continent` para cada país com ≥ 1 observado.

- [ ] **Step 3:** `bun test src/Domain/scouting` passa (os testes antigos inalterados: o neutro é a identidade).
  Commit `feat(olheiros): conhecimento do país multiplica ganho e precisão das missões`.

---

### Task 4: Avanço do dia grava o crescimento

**Files:** Modify `src/backend/scoutingWorld.ts`; Create `src/backend/scouting.countries.test.ts`.

- [ ] **Step 1: Teste** (mesmo padrão de `src/backend/scouting.routes.test.ts`: save de teste, comissão com chefe
  inglês e um olheiro de campo brasileiro contratado da lista, missões criadas pela rota):
  - Missão de país (Espanha) do chefe; avançar até a primeira segunda depois do início (`advanceOneDay` bufferizado,
    como nos outros testes de avanço) → `own.staff.members` chefe tem `countryKnowledge.Spain = { k: 43,6, last: segunda }`.
  - Missão de continente (América do Sul) do olheiro de campo: cada país com observado ganhou `+ (100 − 40) × 0,02`
    (Brasil, nacionalidade, sobe de 90 para 90,2 e não cai depois).
  - Chefe vago (demitido pela rota): a missão do chefe trabalha com multiplicadores 1, nada gravado e nenhum erro.
  - Nenhum clube da IA ganha `staff`/`countryKnowledge`.

- [ ] **Step 2: Implementação** (no bloco `if (monday)` de `scoutingDay`):
  - Mapa `leaders`: `"chief" → headOf(own, "scout")` (pode ser `undefined`), cada olheiro de campo por id.
  - Para cada missão: `countryK: leader ? (c) => countryKnowledgeOf(leader, c, date) : undefined` no `MissionWeekInput`;
    prospectos com `countryK: leader ? countryKnowledgeOf(leader, mission.target.country ?? "", date) : undefined`.
  - Depois de `advanceScoutingWeek`: para cada `visits` com líder, `countryKnowledge = pruneCountryKnowledge({ ...m,
    countryKnowledge: growCountryKnowledge(m, countryVisits(v), date) }, date)`. Reler o elenco
    (`service.getSquadById(saveId, ownClubId)`), trocar só os membros alterados e gravar uma vez
    (`service.saveSquadById`). Confirmar com `grep` que os blocos seguintes de `advanceDay.ts` (financeiro ~1505,
    contratos da comissão ~2462) relêem o elenco — já relêem hoje.
  - Missão de jovens também conta a visita do país (os prospectos não entram em `visits`, o pool de observados já entra).

- [ ] **Step 3:** `bun test src/backend/scouting.countries.test.ts src/backend/scouting.routes.test.ts src/backend/staff.advanceDay.test.ts`
  passa. Commit `feat(olheiros): missões ensinam o país ao olheiro`.

---

### Task 5: Rotas

**Files:** Modify `src/backend/scoutingRoutes.ts`, `src/backend/staffRoutes.ts`, `src/Domain/staff/staffPool.ts`
(`StaffPoolItem`), testes `src/backend/scouting.routes.test.ts`, `src/backend/staff.routes.test.ts`.

- [ ] **Step 1: Testes**
  - `GET /scouting`: cada olheiro com `nationality`, `strongCountry` (chefe vago: `null`), `countries` (só > 0; o país da
    nacionalidade = 90) e `continents` (média dos países com liga de nível 1 do continente — os mesmos de `missionLeagues`).
  - `GET /scouting/player/:id`: `country` = país da liga do clube; livre `""`.
  - `GET /staff`: olheiros com `strongCountry`; outras funções sem o campo.
  - `GET /staff/pool?role=fieldScout`: itens com `strongCountry`.
  - `GET /staff/:memberId/countries`: membro do clube → 60 países com `k`, `band`, `native`, `last`; membro da lista →
    idem (derivado); 404 `notFound` para id desconhecido; 400 `notAScout` para um treinador; outro usuário → 403/404 como
    as demais rotas do dono.

- [ ] **Step 2: Implementação**
  - `scoutsOf` ganha `member?: StaffMember` e o `GET /scouting` monta os campos com `strongCountry`,
    `countryKnowledgeMap`, e `continents` (por continente: `meanKnowledge(member, paísesQueAMissãoVisita, date)`; a lista
    de países vem de um helper novo `continentMissionCountries(continent)` em `scoutingWorld.ts`, extraído de
    `missionLeagues` para não duplicar).
  - `searchPool` acrescenta `strongCountry` aos itens de olheiro (precisa da data: passar `date` do `currentDate`).
  - `staffView` acrescenta `strongCountry` aos membros olheiros.
  - Rota nova em `staffRoutes.ts` (padrão das outras, `requireSaveOwner`, só GET): procura o id no `Squad.staff` do clube e
    depois na lista (`getStaffPool`); monta a resposta com `countriesRaw` (slug, name, flag, iso2, continent).

- [ ] **Step 3:** testes passam. Commit `feat(olheiros): rotas do conhecimento por país`.

---

### Task 6: Medição (obrigatória)

**Files:** Create `scripts/scout-country-measure.ts`; Modify a spec (seção "Medição", números reais).

- [ ] **Step 1:** Script puro (sem save): lê os elencos de `src/Data/squads/premier_league` (como os outros scripts de
  medição), monta `PoolEntry[]` com `country = "England"`, `ViewerContext` com `knowledgeOf` implícito 0, chefe 3★
  (`scoutMultipliersOf(5)`), líder nota 5; roda 12 semanas de `advanceScoutingWeek` com a mesma semente para
  `countryK = undefined`, `() => 0`, `() => 40`, `() => 90`. Imprime, nas semanas 4/8/12: k médio dos observados,
  observados com k ≥ 60, concordância da nota do relatório com a nota de `buildReport(entry, 100, ...)`; a trajetória do
  país (0 e 40, 12 semanas) e a queda de 71 em +180/+270/+365 dias.
- [ ] **Step 2:** Rodar `bun scripts/scout-country-measure.ts`. Conferir as metas da spec (§7): 40 = sem a etapa
  (idêntico); 90 ≤ +20%; 0 ≥ −25%; concordância 90 ≥ 40 ≥ 0. Se falhar, ajustar `GAIN_MULT`/`NOISE_MULT` e repetir.
- [ ] **Step 3:** Escrever a tabela medida na spec (seção nova "Medição (Tarefa 6)"). Commit
  `chore(olheiros): medição do ritmo por país`.

---

### Task 7: Mapa do olheiro

**Files:** Modify `src/GameInterface/NewGame/WorldMap.tsx`; Create `src/GameInterface/Scouting/ScoutCountriesPanel.tsx`,
`src/GameInterface/Scouting/ScoutCountriesModal.tsx`; Modify `src/GameInterface/Scouting/scoutingApi.ts`,
`src/i18n/locales/en.json`, `pt-BR.json`.

- [ ] **Step 1: `WorldMap`** — props opcionais `fillClassFor?: (c: CountryEntry) => string` (substitui o `fillFor`
  padrão quando presente; o realce do hover continua) e `onSelect?` (sem ele: sem `cursor-pointer` e sem clique;
  `opacity-40` só vale para `!playable` quando `onSelect` existe). `captionFor?: (c) => string` para a legenda
  ("Inglaterra · 90"). O novo jogo passa os mesmos props de hoje: nada muda lá (conferir `bun test src/GameInterface`).
- [ ] **Step 2: API** — `getScoutCountries(saveId, memberId)` → `GET /staff/:memberId/countries`.
- [ ] **Step 3: `ScoutCountriesPanel`** (`{ saveId, memberId }`): busca; título de seção "CONHECIMENTO POR PAÍS"
  (`font-display font-black uppercase text-xl`), legenda (três amostras: completo, moderado, nenhum, `text-sm`), grade
  `xl:grid-cols-[minmax(0,1fr)_280px] gap-6`: mapa só `hidden xl:block` (`fillClassFor` pela faixa: `fill-primary`,
  `fill-primary/45`, `fill-secondary`; contorno do país da nacionalidade com `stroke-foreground`), lista à direita (e
  sozinha abaixo de `xl`): países com k > 0, do maior ao menor, `Flag` 20px, nome por `countryDisplayName`,
  `KnowledgeBar` (≥ 64px) e o número `tabular-nums`, "Próprio país" e "Última missão: <data>" em `text-sm
  text-muted-foreground`. Carregando / erro com o texto padrão (`warnings.errors.loadFailed`).
- [ ] **Step 4: `ScoutCountriesModal`** (`Modal size="lg"`, título com o nome do olheiro) envolvendo o painel.
- [ ] **Step 5: i18n** `scoutCountries.{title, legendFull, legendModerate, legendNone, native, lastMission, strong,
  onTarget, pace, none, vacant}` em en e pt-BR.
- [ ] **Step 6:** `bun run ui:audit` limpo (0 duras, 0 leves); `bun test src/GameInterface`. Commit
  `feat(olheiros): mapa-múndi do conhecimento do olheiro`.

---

### Task 8: País forte e conhecimento sobre o alvo

**Files:** Create `src/GameInterface/Scouting/StrongCountry.tsx`; Modify `src/GameInterface/Staff/StaffDetailModal.tsx`,
`src/GameInterface/Staff/StaffCard.tsx`, `src/GameInterface/Transfers/StaffPoolTab.tsx`,
`src/GameInterface/Scouting/MissionsTab.tsx`, `src/GameInterface/Scouting/PlayerKnowledgePanel.tsx`,
`src/GameInterface/Staff/staffApi.ts` (tipos), `scoutingApi.ts` (tipos).

- [ ] **Step 1: `StrongCountry`** (`{ country, k }`): `Flag` 20px + nome + "· 90", `text-sm tabular-nums`.
- [ ] **Step 2: Equipe técnica** — `StaffCard` de olheiro mostra `StrongCountry` na linha do efeito;
  `StaffDetailModal` (modos clube e lista) de olheiro inclui `ScoutCountriesPanel` abaixo dos atributos.
- [ ] **Step 3: Aba Comissão** — coluna "Forte em" de um olheiro mostra `StrongCountry` em vez da especialidade.
- [ ] **Step 4: Central de Olheiros** — cartões da aba Missões: nome do olheiro vira botão (`<Button variant>` do kit,
  não link colorido) que abre `ScoutCountriesModal` (chefe vago: sem botão, "Sem olheiro-chefe"); `StrongCountry` no
  cartão.
- [ ] **Step 5: Nova missão** — abaixo do alvo, quando escolhido: "Conhecimento de <olheiro> em <alvo>" com
  `KnowledgeBar`, número, faixa e "ritmo ×1,17" (`countryGainMult` de `@/Domain/scouting/countryKnowledge`). País/jovens:
  `scout.countries[país] ?? 0`; liga: país da liga (catálogo de ligas que a tela já tem); continente:
  `scout.continents[continente] ?? 0`.
- [ ] **Step 6: Observar jogador** — `PlayerKnowledgePanel`: cada olheiro livre na escolha mostra o conhecimento do país
  (`country` da rota da ficha); livre (`""`): "—".
- [ ] **Step 7:** `bun run ui:audit` limpo; `bun test src/GameInterface`; conferir na tela (dev server pelo caminho
  `C:\Projects\FMProject-scoutcountry`, dev-login) Equipe técnica, aba Comissão, Central de Olheiros (cartão, mapa,
  nova missão) em `xl` e abaixo. Commit `feat(olheiros): país forte e conhecimento do alvo nas telas`.

---

### Task 9: Smoke

**Files:** Modify `scripts/season-rollover-smoke.ts` (seção "Olheiros").

- [ ] **Step 1:** Antes da missão de país estrangeiro do chefe, guardar `countryKnowledgeOf(chefe, país, data)`. No fim
  da missão: o efetivo subiu e `countryKnowledge[país].last` é uma segunda trabalhada.
- [ ] **Step 2:** No fim da corrida: o país da nacionalidade de cada olheiro do clube ≥ 90; nenhum clube da IA com
  `staff`/`countryKnowledge`.
- [ ] **Step 3:** Queda: para cada entrada com `last` mais de 210 dias antes do fim, o efetivo é menor que o gravado
  (e ≥ a base); sem nenhuma entrada assim, imprimir nota (a queda é coberta por `countryKnowledge.test.ts`).
- [ ] **Step 4:** Rodar `bun scripts/season-rollover-smoke.ts` (~15 min, sozinho — memória). Commit
  `test(olheiros): smoke do conhecimento por país`.

---

### Task 10: Regras, changelog, versão, verificação final

**Files:** Modify `.claude/rules/game/scouting.md`, `.claude/rules/game/staff.md`, `.claude/rules/ui-world.md`,
`docs/ROADMAP.md`, `src/GameInterface/changelog/changelog.ts`, `package.json`.

- [ ] **Step 1: Regras** — `scouting.md`: seção nova "Conhecimento por país (4.9)" (modelo, multiplicadores, onde age e
  onde não age, crescimento, queda, gravação no `StaffMember`, rotas, telas, medição) e a linha da tabela de arquivos.
  `staff.md`: olheiros com `countryKnowledge` (acompanha o profissional na lista), país forte nos cartões e na aba
  Comissão, rota `/staff/:memberId/countries`. `ui-world.md`: o `WorldMap` também é o mapa do olheiro (`fillClassFor`,
  `onSelect` opcional, bundle).
- [ ] **Step 2: Changelog** — entrada `4.9` no topo de `changelog` (data do merge), itens pt/en para o jogador (ex.
  "Cada olheiro conhece melhor alguns países: o dele, os vizinhos e os que visitou nas missões — e lá encontra mais e
  erra menos" / "Clique no olheiro para ver o mapa do que ele conhece"); tirar o item da Etapa 33 de `upcoming`
  e pôr as próximas etapas do ROADMAP. Editar só com Edit; conferir CRLF:
  `bun -e 'const s=await Bun.file("src/GameInterface/changelog/changelog.ts").text(); console.log(s.split("\n").length-1, (s.match(/\r\n/g)||[]).length)'`
  (os dois números iguais). Se a 4.8 já estiver no `main`, rebasear antes e manter as duas entradas.
- [ ] **Step 3:** `package.json` `"version": "4.9"`; `docs/ROADMAP.md` Etapa 33 ✅.
- [ ] **Step 4: Verificação** — `bunx tsc --noEmit -p .`; `bun test` (inteiro); `bun run ui:audit` (0/0); comparar o
  tamanho do bundle da página de Equipe técnica antes/depois (`bun build src/pages/staff/index.html --outdir <scratch>
  --minify` nos dois commits) e registrar no ponto aberto 2 da spec. `git diff --stat main` sem arquivo convertido
  inteiro.
- [ ] **Step 5:** Commit `docs(olheiros): regras, changelog 4.9 e roadmap da Etapa 33`.
