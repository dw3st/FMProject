# Inscrição por competição (Etapa 37) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada clube tem uma lista de inscritos por competição (liga, copa nacional, continental) com limite de estrangeiros e mínimo de formados no clube/país pelas regras reais simplificadas; a lista só muda com a janela aberta; a IA e o clube do jogador inscrevem sozinhos (o jogador ajusta à mão); um não inscrito nunca joga (troca automática com aviso, motor e quickSim); aba "Inscritos" no Elenco.

**Architecture:** lógica pura em `src/Domain/registration/` (nações, formados, regras, escolha automática, validação, prazo, limite por jogo); as listas ficam no squad (`Squad.registrations`); `src/backend/registrationWorld.ts` é a única E/S (competições do clube, temporada de cada uma, garantir listas, passo do clube do jogador de manhã, atualização da IA depois do mercado). A escalação recebe o conjunto de inscritos (`lineupHelpers`, `matchSimulationLineups`, `matches`), `match-setup` devolve os inscritos dos dois lados, e o `MatchScreen` filtra como já filtra o indisponível.

**Tech Stack:** Bun + TypeScript, React 19 + Tailwind.

Spec: `docs/superpowers/specs/2026-10-09-competition-registration-design.md`. Regras que valem em toda tarefa:
- Imports sempre `@/`; nada de PowerShell `Set-Content`; `core.autocrlf=true` — conferir `git diff --stat` (nenhum
  arquivo convertido inteiro). `src/GameInterface/changelog/changelog.ts` é **CRLF**: editar só com a ferramenta Edit e
  conferir que continua 100% CRLF (`file` / contagem de `\r\n`). Commits em português terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca commitar `src/Data` nem saves; protótipo, sem migração.
- Worktree `C:/Projects/FMProject-registration`, branch `feat/competition-registration` (já com `src/Data` e `bun install`).
- Antes de cada commit: `bunx tsc --noEmit -p .` limpo e os testes da tarefa passando. Tela nova/alterada: `bun run ui:audit` sem violação.
- Os torneios de base (`u21_*`, `u19_*`, `isYouthCompSlug`) **nunca** têm lista nem filtro.

---

### Task 1: Tipos, nações e constantes

**Files:** Create `src/types/registrationTypes.ts`, `src/Domain/registration/nations.ts`, `src/Domain/registration/registrationConfig.ts`, `src/Domain/registration/nations.test.ts`. Modify `src/types/playerTypes.ts` (`Squad.registrations?`, `RosterPlayer.academyOf?`).

- [ ] **Step 1: Teste**

```ts
import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import { NATION_CONFED, inGroup, normalizeNation } from "@/Domain/registration/nations";
import { REGISTRATION_RULES, RULE_BY_CONTINENT, RULE_BY_COUNTRY, MIN_REGISTERED } from "@/Domain/registration/registrationConfig";

describe("nations", () => {
  test("aliases", () => {
    expect(normalizeNation("Czechia")).toBe("Czech Republic");
    expect(normalizeNation("United States")).toBe("USA");
    expect(normalizeNation("Türkiye")).toBe("Turkey");
    expect(normalizeNation(null)).toBeNull();
  });
  test("every nationality of the world has a confederation", () => {
    const root = "src/example_data/squads";
    const missing = new Set<string>();
    for (const lg of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, lg))) {
      const s = JSON.parse(fs.readFileSync(path.join(root, lg, f), "utf8"));
      for (const p of s.players) {
        const n = normalizeNation(p.nationality);
        if (n && !NATION_CONFED[n]) missing.add(n);
      }
    }
    expect([...missing]).toEqual([]);
  });
  test("groups", () => {
    expect(inGroup("Spain", "EU")).toBe(true);
    expect(inGroup("Brazil", "ibero")).toBe(true);
    expect(inGroup("Senegal", "acp")).toBe(true);
    expect(inGroup("Japan", "acp")).toBe(false);
  });
  test("rules exist", () => {
    expect(REGISTRATION_RULES.premier_league.maxList).toBe(25);
    expect(REGISTRATION_RULES.brazil.maxForeignMatchday).toBe(9);
    expect(RULE_BY_COUNTRY.England).toBe("premier_league");
    for (const c of ["Europe", "South America", "North America", "Asia", "Africa", "Oceania"]) expect(RULE_BY_CONTINENT[c]).toBeDefined();
    expect(MIN_REGISTERED).toBe(18);
  });
});
```

- [ ] **Step 2: Rodar** — `bun test src/Domain/registration/nations.test.ts` → FAIL.

- [ ] **Step 3: Implementação**

`src/types/registrationTypes.ts`:

```ts
export type ForeignKind = "nationality" | "nonEU";
export type NationGroup = "EU" | "ibero" | "acp";
export type Confed = "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";

export interface RegistrationRule {
  id: string;
  maxList: number | null;
  free?: { maxAge: number; formedOnly: boolean };
  minFormed?: number;
  maxForeign?: number;
  maxForeignMatchday?: number;
  foreign: ForeignKind;
  exempt?: NationGroup[];
  domestic?: string[];
}

export interface RegistrationList {
  season: string;
  ids: string[];
  updatedOn: string;
  sig: string;
  manual?: true;
  out?: string[];
  notified?: string[];
  exception?: true;
}

export type RegistrationCompKind = "league" | "cup" | "continental";

export interface RegistrationStatus {
  open: boolean;
  until?: string;
  opensOn?: string;
  /** Closed because the continental stage already started (not the window). */
  stageStarted?: boolean;
}

export type ReplacementReason = "injured" | "suspended" | "unregistered" | "foreignLimit";
```

`nations.ts`: `NATION_ALIAS` (`Czechia`, `United States`, `Türkiye`), `normalizeNation(n)`, `NATION_CONFED: Record<string, Confed>` com as 172 nações (gerar a lista com um `bun -e` sobre `src/example_data/squads` e preencher à mão; `Scotland`/`Wales`/`Northern Ireland`/`England` UEFA; `Curaçao`, `Guadeloupe`, `Martinique`, `French Guiana` CONCACAF; `Israel`, `Kazakhstan` UEFA; `Australia` AFC), `EU` (UE + EEE: Islândia, Noruega, Liechtenstein; Suíça **não**), `IBERO` (CONMEBOL + México, Costa Rica, Cuba, Rep. Dominicana, El Salvador, Guatemala, Honduras, Panamá, Porto Rico, Nicarágua), `ACP` (toda a CAF + Caribe da CONCACAF fora de `IBERO` + OFC), `inGroup(nation, group)`.

`registrationConfig.ts` — a tabela da spec §2 (`REGISTRATION_RULES` com ids `premier_league`, `la_liga`, `serie_a`, `bundesliga`, `ligue_1`, `brazil`, `argentina`, `saudi`, `mexico`, `mls`, `uefa`, `conmebol`, `europe`, `south_america`, `north_america`, `asia`, `africa`, `oceania`), `RULE_BY_COUNTRY` (England, Spain, Italy, Germany, France, Brazil, Argentina, Saudi Arabia, Mexico, USA), `RULE_BY_CONTINENT`, `RULE_BY_CONTINENTAL` (`ucl`/`uel` → `uefa`, `lib`/`sud` → `conmebol`), `MIN_REGISTERED = 18`, `LINE_MINIMUMS = { GK: 2, Defender: 5, Midfielder: 5, Forward: 3 }`, `DOMESTIC_EXTRA = { England: ["Wales"], USA: ["Canada"] }`, `CLOSING_NOTICE_DAYS = 3`, `FORMED_SEASONS = 3`, `FORMED_MAX_AGE = 21`. Comentário em cada regra com a regra real (spec §2).

`playerTypes.ts`: `Squad.registrations?: Record<string, RegistrationList>` e `RosterPlayer.academyOf?: string` (doc: clube cuja base formou o jogador; prospecto e renascido).

- [ ] **Step 4: Rodar** — teste passa; `bunx tsc --noEmit -p .`.
- [ ] **Step 5: Commit** — `feat(inscricao): tipos, nações e regras por competição`.

---

### Task 2: Formados, estrangeiros e livres (puro)

**Files:** Create `src/Domain/registration/formed.ts`, `formed.test.ts`. Modify `src/backend/scoutingRoutes.ts` (prospecto contratado grava `academyOf`), `src/backend/rebornRoutes.ts` ou `src/Domain/retirement/retirement.ts` (`generateReborn` grava `academyOf`).

- [ ] **Step 1: Teste** (casos mínimos)

```ts
import { describe, expect, test } from "bun:test";
import { clubTrained, nationTrained, isFormed, isForeign, isFree, type FormedCtx } from "@/Domain/registration/formed";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import type { RosterPlayer } from "@/types/playerTypes";

const ctx: FormedCtx = { seasonStartYear: 2027, countryOfLeague: (s) => (s.startsWith("premier") || s === "of_championship" ? "England" : "Spain") };
const p = (o: Partial<RosterPlayer>): RosterPlayer => ({ id: "x", name: "x", age: 24, squadId: "c1", preferredFoot: "right", positions: ["CM"], stats: {} as never, profile: {} as never, ...o });
const row = (season: string, squadId: string, league: string) => ({ season, squadId, clubName: "", league, apps: 1, goals: 0, assists: 0, avgRating: null, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] });

describe("formed", () => {
  test("academy ids and academyOf", () => {
    expect(clubTrained(p({ id: "youth_c1_2027_0" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "es_youth_c1_3" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "prospect_ab_1", academyOf: "c1" }), "c1", ctx)).toBe(true);
    expect(clubTrained(p({ id: "youth_c2_2027_0" }), "c1", ctx)).toBe(false);
  });
  test("three seasons at the club up to 21", () => {
    const h = [row("2024-25", "c1", "premier_league"), row("2025-26", "c1", "premier_league"), row("2026-27", "c1", "premier_league")];
    expect(clubTrained(p({ age: 22, history: h }), "c1", ctx)).toBe(true);   // 19, 20, 21
    expect(clubTrained(p({ age: 25, history: h }), "c1", ctx)).toBe(false);  // 22, 23, 24
    // partials of the same season count once
    expect(clubTrained(p({ age: 20, history: [h[0]!, h[0]!, h[1]!] }), "c1", ctx)).toBe(false);
  });
  test("nation trained falls back to nationality", () => {
    expect(nationTrained(p({ nationality: "Wales" }), "England", ctx, ["Wales"])).toBe(true);
    expect(nationTrained(p({ nationality: "France" }), "England", ctx, ["Wales"])).toBe(false);
    expect(nationTrained(p({ nationality: null }), "England", ctx, [])).toBe(true);
  });
  test("foreign by rule", () => {
    expect(isForeign(p({ nationality: "Brazil" }), R.la_liga!, "Spain")).toBe(false);   // ibero
    expect(isForeign(p({ nationality: "Japan" }), R.la_liga!, "Spain")).toBe(true);
    expect(isForeign(p({ nationality: "France" }), R.la_liga!, "Spain")).toBe(false);   // EU
    expect(isForeign(p({ nationality: "Senegal" }), R.ligue_1!, "France")).toBe(false); // acp
    expect(isForeign(p({ nationality: "Argentina" }), R.brazil!, "Brazil")).toBe(true);
    expect(isForeign(p({ nationality: "United States" }), R.mls!, "USA")).toBe(false);
    expect(isForeign(p({ nationality: "Canada" }), R.mls!, "USA")).toBe(false);
  });
  test("free", () => {
    expect(isFree(p({ age: 21, nationality: "Spain" }), R.uefa!, "Spain", "c1", ctx)).toBe(true);
    expect(isFree(p({ age: 21, nationality: "Japan" }), R.uefa!, "Spain", "c1", ctx)).toBe(false); // formedOnly
    expect(isFree(p({ age: 21, nationality: "Japan" }), R.premier_league!, "England", "c1", ctx)).toBe(true);
    expect(isFree(p({ age: 22 }), R.premier_league!, "England", "c1", ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
export interface FormedCtx {
  /** Start year of the competition season being registered (2026 for "2026-27", 2027 for "2027"). */
  seasonStartYear: number;
  /** Country of a league slug ("" unknown). */
  countryOfLeague: (leagueSlug: string) => string;
}
const startYear = (season: string) => parseInt(season.slice(0, 4), 10);

/** Distinct seasons in `history` where the player was ≤ FORMED_MAX_AGE at a club accepted by `atClub`. */
function formativeSeasons(p: RosterPlayer, ctx: FormedCtx, atClub: (row: PlayerHistoryRow) => boolean): number {
  const seasons = new Set<string>();
  for (const r of p.history ?? []) {
    const ageThen = p.age - (ctx.seasonStartYear - startYear(r.season));
    if (ageThen <= FORMED_MAX_AGE && atClub(r)) seasons.add(r.season);
  }
  return seasons.size;
}
export function clubTrained(p, squadId, ctx) {
  if (p.id.startsWith(`youth_${squadId}_`) || p.id.startsWith(`es_youth_${squadId}_`) || p.academyOf === squadId) return true;
  return formativeSeasons(p, ctx, (r) => r.squadId === squadId) >= FORMED_SEASONS;
}
export function nationTrained(p, country, ctx, extra: string[]) { ... } // nação doméstica (ou ausente) || formativeSeasons em ligas do país ≥ 3
export function isFormed(p, rule, country, squadId, ctx) { return clubTrained(...) || nationTrained(...); }
export function isForeign(p, rule, country): boolean { ... } // spec §1.1; nação ausente = doméstico
export function isFree(p, rule, country, squadId, ctx): boolean { return !!rule.free && p.age <= rule.free.maxAge && (!rule.free.formedOnly || isFormed(...)); }
```

`domestic(rule, country)` = `[country, ...(rule.domestic ?? []), ...(DOMESTIC_EXTRA[country] ?? [])]`. Nada lê `nationality` sem `normalizeNation`.

`academyOf`: o prospecto contratado (`POST .../scouting/prospects/:id/sign`) e o renascido aceito (`generateReborn`) ganham `academyOf: squad.id`; os testes existentes dessas rotas continuam passando (acrescentar uma asserção do campo).

- [ ] **Step 4: Rodar** — `bun test src/Domain/registration src/backend/scouting.routes.test.ts src/backend/reborn.routes.test.ts src/Domain/retirement`.
- [ ] **Step 5: Commit** — `feat(inscricao): formados no clube/país, estrangeiros e livres`.

---

### Task 3: Escolha automática, validação, contadores e limite por jogo (puro)

**Files:** Create `src/Domain/registration/rules.ts`, `rules.test.ts`.

- [ ] **Step 1: Teste**

Casos (montar elencos sintéticos com `overallAvg` fixo e `positions[0]` de linha):
1. `ruleFor`: `ucl` → `uefa`; `cup_england` com a liga `of_championship` → `premier_league` (regra da liga do clube); `la_liga` → `la_liga`; liga `of_eredivisie` (Holanda) → `europe`; `of_j_league` → `asia`; país desconhecido → `europe`.
2. Premier: elenco de 30 com 4 formados e 2 sub-21 → 21 contados (17 não formados + 4 formados) + 2 livres; os excluídos são os piores não formados; `countsOf` diz `{ counted: 21, max: 25, formed: 4, minFormed: 8, lostSlots: 4, free: 2 }`.
3. La Liga: 6 japoneses bons → só 3 entram; brasileiros e senegaleses não contam.
4. Mínimos de linha: um elenco com o 3º goleiro mais fraco que todos → os 2 melhores goleiros entram mesmo abaixo do corte.
5. Piso: elenco de 20 com 15 estrangeiros e regra `maxForeign 5` → 18 inscritos, `exception: true`.
6. Determinismo: mesma entrada → mesma lista; desempate por id.
7. `validateList`: lista com 26 contados → `listFull`; 4 extracomunitários na La Liga → `foreign`; 18 não formados na Premier → `formed`; `exception` aceita qualquer coisa até 18.
8. `canAdd(list, player, ...)` → `{ ok: true }` / `{ ok: false, reason: "listFull" | "foreign" | "formed" }`.
9. `registeredSet(squad, slug, rule, ctx)` = ids da lista ainda no elenco ∪ livres; lista ausente → `null`.
10. `matchdayPool` (Brasil, 9): XI com 10 estrangeiros → o pior estrangeiro do XI sai pelo melhor reserva doméstico da mesma linha (motivo `foreignLimit`); banco com os estrangeiros que cabem (total XI + banco ≤ 9); com ≤ 9 estrangeiros devolve a entrada sem mudança (mesmo objeto).

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação** (assinaturas)

```ts
export interface RegCtx extends FormedCtx { country: string; squadId: string }
export function ruleFor(competition: string, clubLeague: string, country: string, continent: string | undefined): RegistrationRule;
export function autoRegister(players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): { ids: string[]; exception: boolean };
export function validateList(ids: string[], players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx, exception?: boolean): RegViolation[];
export function canAdd(ids: string[], player: RosterPlayer, players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): { ok: true } | { ok: false; reason: "listFull" | "foreign" | "formed" };
export function countsOf(ids: string[], players: RosterPlayer[], rule: RegistrationRule, ctx: RegCtx): RegCounts;
export function registeredSet(squad: Squad, competition: string, rule: RegistrationRule, ctx: RegCtx): Set<string> | null;
export function rosterSig(players: RosterPlayer[]): string; // ids ordenados, hash FNV (seedFrom)
export function matchdayPool(slots: FormationSlot[], lineup: string[], players: RosterPlayer[], rule: RegistrationRule, country: string): { lineup: string[]; bench: RosterPlayer[]; replaced: { out: string; in: string; reason: "foreignLimit" }[] };
```

`autoRegister`: candidatos ordenados por `overallAvg ?? computeOverallAvg` desc, id asc; livres entram todos (se o limite de estrangeiros deixar); passada 1 pelos `LINE_MINIMUMS` (por `getMainRole(positions[0])`); passada 2 pelos melhores. Um jogador cabe se: livre, ou `contados < maxList`, e (`formado` ou `nãoFormados < maxList − minFormed`), e (não estrangeiro ou `estrangeiros < maxForeign`). Depois o piso `MIN_REGISTERED` ignorando as regras. Os limites `null`/ausentes = sem limite.

- [ ] **Step 4: Rodar** — `bun test src/Domain/registration`.
- [ ] **Step 5: Commit** — `feat(inscricao): inscrição automática, validação e limite por jogo`.

---

### Task 4: Prazo de inscrição (puro)

**Files:** Create `src/Domain/registration/deadlines.ts`, `deadlines.test.ts`.

- [ ] **Step 1: Teste**

1. Liga/copa: `registrationStatus({ kind: "league", window })` repete a janela (`open`, `until`, `opensOn`).
2. Continental, janela aberta, antes do 1º jogo de grupo → aberto, `until = min(window.until, véspera do 1º jogo)`.
3. Continental, janela aberta, grupos em andamento → fechado com `stageStarted`.
4. Continental, janela aberta, grupos acabados e oitavas sorteadas sem a ida jogada → aberto até a véspera da ida.
5. Continental, janela fechada → fechado, `opensOn` da janela.
6. Final/semis em andamento → fechado sem `opensOn` (não reabre na temporada).

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**

```ts
export interface ContinentalGate {
  /** First group match date and r16 first-leg date (stage dates from `meta.continental.stages`). */
  groupStart: string;
  groupEnd: string;          // last group round date
  knockoutStart: string;     // r16 leg 1 date
}
export function registrationStatus(args: { kind: RegistrationCompKind; window: WindowStatus; date: string; continental?: ContinentalGate }): RegistrationStatus;
```

Liga/copa: o status da janela. Continental: aberto se a janela está aberta e (`date < groupStart` ou `groupEnd < date < knockoutStart`); `until` = o menor entre o fim da janela e a véspera do início da fase; fechado depois do início das oitavas.

- [ ] **Step 4: Rodar** · **Step 5: Commit** — `feat(inscricao): prazo de inscrição pelas janelas e fases`.

---

### Task 5: Escalação só com inscritos (Domain)

**Files:** Modify `src/Domain/lineupHelpers.ts`, `src/Domain/advanceDay/matchSimulationLineups.ts`, `src/Domain/advanceDay/matches.ts`, `src/Domain/tactics/lineupPresets.ts` (só o tipo do motivo); tests `src/Domain/lineupHelpers.test.ts`, `src/Domain/advanceDay/matchSimulationLineups.test.ts`, `src/Domain/advanceDay/matches.test.ts`.

- [ ] **Step 1: Testes**
1. `replaceUnavailableStarters(slots, lineup, players, date, registered)`: titular fora de `registered` → trocado pelo melhor reserva **inscrito** da linha, `reason: "unregistered"`; um reserva não inscrito nunca entra; `registered` ausente = comportamento de hoje (teste antigo continua).
2. `autoFillLineupWithFitness(slots, players, date, registered)`: nunca devolve não inscrito.
3. `resolveUserLineup(..., { registered, rule, country })`: XI salvo com um não inscrito → troca `unregistered` em `injuredReplaced`; regra do Brasil com 10 estrangeiros no XI → troca `foreignLimit`; rotação sugerida só com inscritos.
4. `computeMatchSimulationLineups(fixture, home, away, ..., registration)` com `registration = { home?: MatchRegistration; away?: MatchRegistration }` (`{ ids: Set<string>; rule; country }`): XIs dos dois lados ⊂ inscritos; sem `registration` = igual a hoje (teste existente).
5. `buildQuickMatchEvent`/`buildMatchEvent` com `sim.registered`: nenhum jogador fora do conjunto aparece em `playerStats` (o banco do motor é filtrado, `eligibleHome`), e o banco do Brasil tem ≤ 9 estrangeiros somados ao XI.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
- `eligiblePool(players, date, registered?)` filtra também por `registered`; `autoFillLineup`, `autoFillLineupWithFitness`, `suggestRotation` ganham o parâmetro opcional `registered?: Set<string>` no fim.
- `InjuredReplacement.reason`: `ReplacementReason` (`registrationTypes.ts`); `replaceUnavailableStarters` troca quem `isUnavailable || !registered.has(id)`; motivo `injured` > `suspended` > `unregistered`.
- `MatchRegistration = { ids: Set<string>; rule: RegistrationRule; country: string }` em `matchSimulationLineups.ts`; `resolveUserLineup` aplica `matchdayPool` quando `rule.maxForeignMatchday` existe (as trocas entram em `injuredReplaced`); o lado da IA usa `autoLineupForFormationWithFitness(squad, formation, date, ids)` e, com `maxForeignMatchday`, o pool já limitado aos melhores estrangeiros que cabem antes do auto-preenchimento.
- O retorno ganha `registered: { home?: Set<string>; away?: Set<string> }` e `benchLimit` (ids do banco do Brasil); `buildMatchEvent`/`buildQuickMatchEvent` usam `eligibleHome/Away` = disponível ∩ inscrito ∩ (XI ∪ banco permitido).
- `lineupPresets.ts`: só acompanhar o tipo do motivo (presets não olham inscrição).

- [ ] **Step 4: Rodar** — `bun test src/Domain/lineupHelpers.test.ts src/Domain/advanceDay src/Domain/tactics`.
- [ ] **Step 5: Commit** — `feat(inscricao): escalação só com inscritos, motor e quickSim`.

---

### Task 6: E/S das listas (`registrationWorld`)

**Files:** Create `src/backend/registrationWorld.ts`, `src/backend/registrationWorld.test.ts`.

- [ ] **Step 1: Teste** (save de teste pelo mesmo caminho dos testes de `continentalWorld`/`youthCompWorld`, `FileSystemDAL` temporário)
1. `clubCompetitions(saveService, saveId, squadId)` → liga do índice, `cup_<país>` se a copa existe, a continental em que está nos grupos; nunca slugs de base.
2. `competitionSeason(slug)` → rótulo da liga (`seasonLabel` do `activeLeagues`), da copa e da continental (ano da meta).
3. `ensureList(squad, slug, ctx)` sem lista → lista automática gravada com `season`, `sig`; com lista velha → refeita mesmo com prazo fechado; com lista atual e prazo fechado → igual (congelada), mesmo depois de uma contratação (o novo fica fora).
4. `refreshAiRegistrations(squads, ctx)` com prazo aberto: só refaz quem mudou de elenco (`sig`) ou não tem lista; devolve os squads alterados; com prazo fechado nada muda.
5. `humanRegistrationDay` com prazo aberto: sem `manual`, refaz; com `manual`, acrescenta o recém-chegado que cabe, não repõe `out`, gera **um** aviso `not_fit` para quem não cabe; com prazo fechado, um aviso `waiting` com `opensOn`; inbox `closing` 3 dias antes do fim.
6. `matchRegistration(squad, slug, ctx)` → `MatchRegistration` (garante a lista se ausente; devolve o squad atualizado para gravar).

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
- Contexto do dia (`RegistrationDayCtx`, um por avanço/rota, memoizado): `WindowContext` (`loadWindowContext`), catálogo (`getLeagueData`), `countries.json` (continente), metas das copas e das 4 continentais (lidas uma vez), `seasonStartYear` por competição, `countryOfLeague`.
- `statusFor(squadId, slug)`: `registrationStatus` com a janela do clube (`ofSquad`; clube do jogador: `human()`) e, na continental, o `ContinentalGate` das `stages` da meta (`group.dates[0]`, `group.dates.at(-1)`, `r16.dates[0]`).
- Funções puras do Domain para decidir; aqui só ler/gravar `squad.registrations` (gravado com o squad, `saveSquadById`). Mensagens devolvidas, não gravadas (o chamador as adia).

- [ ] **Step 4: Rodar** · **Step 5: Commit** — `feat(inscricao): listas por clube e competição no save`.

---

### Task 7: Avanço do dia

**Files:** Modify `src/backend/advanceDay.ts`; Create `src/backend/registration.advanceDay.test.ts`.

- [ ] **Step 1: Teste** (avanço real de poucos dias, como `board.advanceDay.test.ts`)
1. Um dia de rodada: nenhum jogador fora das listas em `playerStats` (motor) nem no XI do quickSim (`StoredDayLog.registrationViolations` = 0, contador novo: XI ou estatística com não inscrito).
2. Um titular do clube do jogador tirado da lista à mão → o jogo do dia o troca (`userInjuredReplaced` com `unregistered`) e a inbox não muda nada de lesão.
3. Contratação da IA no último dia da janela → no dia seguinte (fechado) o jogador está na lista dela.
4. Gravação ao vivo (`playedMatchOverride`) com um não inscrito → `{ ok: false, status: 400, error: "unregistered player in recording" }`.
5. Virada do país: as listas da liga ficam velhas e são refeitas no primeiro dia da janela de pré-temporada.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
- Início do dia (antes dos jogos, depois de ler a meta): `humanRegistrationDay` para o clube do jogador (se houver), gravando o squad e empilhando mensagens em `registrationMessages`.
- No laço de partidas (liga, copa, continental; **não** base): `matchRegistration` dos dois clubes antes de `computeMatchSimulationLineups(..., registration)`; o squad com a lista nova entra em `squadWrites`; o contador de violação vai para o day log.
- Validação do `playedMatchOverride` ao lado da de mata-mata: todo id de `playerStats`/`playerEnergy` do clube do jogador e do adversário tem de estar no conjunto de inscritos daquela competição.
- Depois do mercado e do tick de livres (bloco que já tem `allSquadsMarket`): `refreshAiRegistrations` para os clubes da IA com prazo aberto em alguma competição; grava só os alterados. Pulado com `marketFrozen` (a pré-simulação do kit usa a inscrição inicial no jogo).
- Mensagens `registration` gravadas depois do `clearInbox`, como as demais adiadas.

- [ ] **Step 4: Rodar** — `bun test src/backend/registration.advanceDay.test.ts src/backend/board.advanceDay.test.ts src/backend/advanceDay.doubleBooking.test.ts src/backend/fitness.congestion.test.ts`.
- [ ] **Step 5: Commit** — `feat(inscricao): listas no avanço do dia e recusa de gravação com não inscrito`.

---

### Task 8: Rotas, `match-setup` e partida ao vivo

**Files:** Create `src/backend/registrationRoutes.ts`, `src/backend/registration.routes.test.ts`. Modify `src/backend/routes.ts` (espalhar `registrationRoutes` como `staffRoutes`/`moraleRoutes`), `src/backend/routes.ts` (`match-setup`), `src/backend/saves.ts` (rota de rotação: `resolveUserLineup` com inscritos), `src/GameInterface/MatchScreen.tsx`, `src/backend/jobWorld.ts`.

- [ ] **Step 1: Teste**
1. `GET /api/saves/:id/registration` → competições do clube com `rule`, `status`, `counts`, `rows` (`registered`, `foreign`, `clubTrained`, `nationTrained`, `free`, `canAdd`, `reason`); dono do save; sem clube 409 `noClub`.
2. `PUT .../registration/:competition { ids }` com prazo fechado → 409 `registrationClosed { opensOn }`; com jogador de fora → 400 `notYourPlayer`; quebrando a regra → 400 `ruleViolation { kind }`; competição que o clube não joga → 404 `notInCompetition`; válido → 200, `manual: true`, `out` = os tirados.
3. `POST .../auto` → lista automática, `manual` some.
4. `match-setup` com a lista sem um titular → `injuredReplaced` com `reason: "unregistered"`, `registered.mine`/`registered.opp` (arrays de ids) e o XI provável do adversário ⊂ inscritos.
5. `takeOverClub`: as listas da IA viram do jogador (sem `manual`); `releaseHumanClub`: `manual`/`out`/`notified` somem.

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementação**
- Rotas com `requireSaveOwner`, escrita em `withSaveLock` + `BufferingSaveDAL` (como as de comissão/moral), meta por último.
- `match-setup`: `registrationDayCtx` + `matchRegistration` do clube e do adversário para `matchFixture.competition`; passa a `resolveUserLineup` e `autoLineupForFormationWithFitness`; devolve `registered` e o banco permitido (Brasil). Não grava listas (só lê/calcula; a gravação fica com o avanço).
- `MatchScreen.tsx`: `myEligiblePlayers`/adversário filtram também por `data.registered` (e pelo banco permitido) — o motor recebe só inscritos.
- `saves.ts` (rotação): passa o conjunto de inscritos da competição do jogo do dia.

- [ ] **Step 4: Rodar** — `bun test src/backend/registration.routes.test.ts src/backend/matchSetup.crowd.test.ts src/backend/continentalWorld.test.ts src/backend/jobs.test.ts`.
- [ ] **Step 5: Commit** — `feat(inscricao): rotas de inscritos e partida ao vivo só com inscritos`.

---

### Task 9: Inbox `registration`

**Files:** Modify `src/types/inboxTypes.ts` (`RegistrationInboxMessage`, kinds `auto_list` · `not_fit` · `waiting` · `closing` · `exception`), `src/Domain/inbox/inboxTopics.ts` (`registration` → `competitions`), `src/Domain/inbox/inboxEvents.ts` (`buildRegistrationMessage`), `src/GameInterface/InboxScreen.tsx` (corpo, ícone `list-checks` via `Icons.tsx`), i18n `inbox.registration.*`. Test `src/Domain/inbox/registrationMessage.test.ts`.

- [ ] **Step 1: Teste** — cada kind monta assunto/prévia em inglês (fallback), ids estáveis por clube+competição+temporada+kind (+ jogador em `not_fit`/`waiting`), e o tópico é `competitions`.
- [ ] **Step 2–4:** implementar; `bun test src/Domain/inbox`.
- [ ] **Step 5: Commit** — `feat(inscricao): mensagens de inscrição na caixa de entrada`.

---

### Task 10: Telas (aba Inscritos, selos na escalação e na prévia)

**Files:** Create `src/GameInterface/Squad/RegistrationView.tsx`, `src/GameInterface/Squad/registrationApi.ts`. Modify `src/GameInterface/SquadScreen.tsx` (aba `registration`, `?tab=registration`), `src/GameInterface/FormationScreen.tsx`, `src/GameInterface/MatchPreviewScreen.tsx`, `src/GameInterface/Icons.tsx` (se precisar de ícone), `src/i18n/locales/en.json`, `pt-BR.json`.

- [ ] **Step 1:** `RegistrationView` (spec §7): `SegmentedTabs compact` com as competições (`competitionName`); linha de prazo (`text-sm text-muted-foreground`, "Aberta até…" / "Fechada — abre em…" / "Fase em andamento"); contadores como números de destaque (`font-display font-bold tabular-nums`) com rótulo; tabela com `TABLE_STYLE`/`TABLE_CELL` (posição com `getDetailedPositionColor`, nome, idade, `<Flag>`, selos em `Chip`-pílula de texto `text-sm`, nota, botão Incluir/Tirar `Button` secundário desligado com `title` do motivo); "Automático" (`Button` primário, confirmação via `Components/Modal.tsx` quando `manual`); erros 409/400 traduzidos. Sem `max-w mx-auto`.
- [ ] **Step 2:** `FormationScreen`: carrega `GET /registration` uma vez; para a competição do próximo jogo (`season.calendar`), selo "Não inscrito" (texto `text-sm`, `text-destructive`) no cartão/lista do jogador, com o nome da competição no `title`; o jogador continua escolhível.
- [ ] **Step 3:** `MatchPreviewScreen`: `reason` `unregistered` → `matchPreview.unregisteredReplaced` ("{{out}} não está inscrito; {{in}} entra"), `foreignLimit` → `matchPreview.foreignLimitReplaced`.
- [ ] **Step 4:** `bunx tsc --noEmit -p .`, `bun run ui:audit` (0 duras, 0 leves nos arquivos tocados), `bun test src/GameInterface`. Conferir no Chrome com `DEV_AUTO_LOGIN=1 bun run dev` (a partir de `C:\Projects\FMProject...` com a caixa real): aba abre, incluir/tirar, prazo fechado desliga os botões, prévia mostra a troca.
- [ ] **Step 5: Commit** — `feat(inscricao): aba Inscritos no Elenco e avisos na escalação e na prévia`.

---

### Task 11: Medição

**Files:** Create `scripts/registration-measure.ts`.

- [ ] **Step 1:** o script lê `src/Data/squads` (mundo inicial), aplica `ruleFor` + `autoRegister` com o código real para a liga de cada clube e, à parte, a regra `uefa` e a `conmebol` para todos, e imprime a tabela da spec §8 (clubes, elenco, lista, listas reduzidas por formados, exceções do piso, estrangeiros fora por clube, dos 11 melhores quantos fora). `--market`: roda `bun scripts/market-sim.ts 1` num mundo temporário com o refresh da IA ligado e conta, por tier, quantas contratações da IA ficaram fora da lista na janela seguinte (meta informativa: < 5%; acima, abrir issue — spec §8).
- [ ] **Step 2:** rodar, colar os números finais na spec §8 (substituindo o protótipo) e na regra (Task 13).
- [ ] **Step 3: Commit** — `chore(inscricao): medição das regras no mundo`.

---

### Task 12: Smoke

**Files:** Modify `scripts/season-rollover-smoke.ts` (seção "Inscrição").

- [ ] **Step 1:** implementar as 5 checagens da spec §10: foto das listas antes de cada dia de rodada (como a seção Lesões) × `playerStats` do log; soma de `registrationViolations` = 0; `validateList` de todo clube na virada e no fim (exceções e listas reduzidas impressas); `PUT` num dia fechado → 409 e num dia aberto → 200 com o tirado fora no dia seguinte; um livre contratado pelo jogador fora da janela não joga até a abertura e entra sozinho se couber; `match-setup` com o titular tirado da lista → troca `unregistered`.
- [ ] **Step 2:** `bun scripts/season-rollover-smoke.ts` (~15 min; uma corrida por vez — ver memória de OOM). Todas as seções passam.
- [ ] **Step 3: Commit** — `test(inscricao): seção Inscrição no smoke de temporada`.

---

### Task 13: Documentação, changelog e versão

**Files:** Create `.claude/rules/game/registration.md`. Modify `docs/ROADMAP.md`, `src/GameInterface/changelog/changelog.ts` (CRLF), `package.json`, `.claude/rules/game/transfer-windows.md` (linha "Inscrição"), `.claude/rules/game/injuries.md` e `discipline.md` (motivo `unregistered` em `replaceUnavailableStarters`), `.claude/rules/game/youth-competitions.md` (base sem inscrição).

- [ ] **Step 1:** `registration.md` no molde das outras regras: Regra, Arquivos, Definições (estrangeiro, formado, livres), tabela de regras, Prazo, Automática, Escalação, Telas/Rotas/Inbox, `/test`/`/lab` (sem efeito), Medição (números da Task 11), Testes e smoke, Limitações (formação antes da carreira desconhecida; sem dupla nacionalidade, isenções `ibero`/`acp`; Libertadores diverge do real; a IA compra sem olhar a inscrição; o banco do motor é o elenco inteiro inscrito, sem lista de 23 fora do Brasil).
- [ ] **Step 2:** `docs/ROADMAP.md`: etapa 37 → `37 ✅ · Inscrição por competição (#103, 4.15).` com "Decidido": inscrição automática com ajuste manual; não inscrito trocado automaticamente com aviso; regras reais simplificadas + padrão por continente; prazo pelas janelas (continental pelas fases); base sem inscrição; números medidos.
- [ ] **Step 3:** changelog (Edit, preservando CRLF): entrada `4.15` com a data, itens para o jogador (listas por competição com limites de estrangeiros e formados; prazo pelas janelas; inscrição automática que você ajusta na aba Inscritos do Elenco; não inscrito sai da escalação com aviso na prévia); tirar o item de inscrição de `upcoming` e manter os demais. Conferir: `grep -c $'\r$' src/GameInterface/changelog/changelog.ts` = número de linhas. `package.json` `"version": "4.15"`. `bun test src/GameInterface/changelog`.
- [ ] **Step 4:** verificação final: `bunx tsc --noEmit -p .`, `bun test`, `bun run ui:audit`, smoke (Task 12) — tudo verde.
- [ ] **Step 5: Commit** — `docs(inscricao): regra, roadmap e changelog 4.15` (fecha #103 no merge: `fixes #103`).
