# Open World — Plano 4: telas para 83 ligas e 60 países

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar as telas utilizáveis com o mundo novo:
- Novo Jogo com busca e continentes;
- ligas identificadas pelo país;
- ligas seguidas;
- Olheiros sem baixar 16 MB;
- resumo do dia sem as 83 ligas;
- escudos sem enxurrada de 404.

**Architecture:** A lógica nova fica em helpers puros e testados (`src/Domain/world/`, `src/Domain/scout/`). As telas só consomem esses helpers. Olheiros passa a filtrar e paginar no servidor. Nomes de país em pt-BR vêm de `Intl.DisplayNames`, e as chaves i18n existentes têm prioridade.

**Tech Stack:** React 19, Tailwind v4, i18next, headlessui (`SelectCombobox`), Bun routes, `bun:test` (não há testes de React; toda lógica testável sai para helper puro).

**Spec:** `docs/superpowers/specs/2026-09-23-open-world-database-design.md`, seção 4.

**Desvio do spec:** "Ligas seguidas" fica como uma **estrela no cabeçalho da Classificação**, em vez de uma seção nas Configurações. Motivo: o `SettingsOverlay` não recebe sessão e só cuida de idioma/conta; a estrela fica onde o jogador escolhe a liga. A Task 10 atualiza o spec.

---

## Fatos do código

- **Wizard.** `NewGameWizard.tsx` tem 1542 linhas:
  - o país é escolhido em `CountrySelector` (843) e o clube em `ClubSelector` (1027);
  - o tipo local `CountryEntry` (36-43) não tem `continent`;
  - `countries.json` entra por import estático de `@/Data/countries.json`;
  - a ligação liga↔país é feita por `l.country === country.name`;
  - a busca (176-180) olha só o `name` em inglês;
  - a grade (902) tem 60 blocos sem agrupamento.
- **Abas de divisão.** Ficam em 1066-1082, com `flex-1 text-[10px]`. Quebram na Rússia (7 ligas) e na Itália (5).
- **`/api/club-profile` (`routes.ts:98-180`).**
  - Dá 404 nas 8 ligas originais: converte id → slug e lê `{slug}.json`, mas os arquivos são `{id}.json`. O helper `squadFileStemFromClubParam` (`backend/squadIdResolve.ts:34-42`) já resolve isso.
  - `reputationLabel` está fixo em inglês (157-163).
- **Classificação.**
  - `LeagueTableScreen.tsx:596-607` usa `SelectCombobox` com rótulo `l.name`. Existem 11 "Premier League", e a busca não acha por país.
  - A legenda das zonas (647-656) imprime o rótulo cru.
- **Resumo do dia (`DaySummaryModal`).**
  - Desenha um card por partida de **todas** as ligas do dia, com dois `ClubLogo` cada.
  - O título da competição é `competition.replace(/_/g, " ")`.
  - `formatCompetition` em `MatchPreviewScreen.tsx:60` e `MatchResultScreen.tsx:35` produz "Of Uae Pro League".
- **Escudos.**
  - `/api/logos` devolve 404 sem cache para os 1.071 clubes `of_*`.
  - O `ClubLogo` guarda o `failed` por instância, então repete o pedido a cada montagem.
- **Olheiros.**
  - `GET /api/saves/:id/all-squads` manda cerca de 16 MB, mais o `seasonLog`.
  - `ScoutTable` filtra e ordena no cliente (`ScoutTable.tsx:48-82`) e renderiza até cerca de 36 mil linhas.
  - O filtro de liga (`ScoutFilters.tsx:167-172`) é um `SelectListbox` de 84 opções, sem busca.
  - `backend/routes.ts` já importa de `@/GameInterface/positionHelpers`. `playerHelpers.ts` é puro (usa `@/Domain/Player`) e pode rodar no servidor.
- **Ligas seguidas.**
  - `SaveMeta.followedLeagues` existe e é lido por `resolveSimMode` (`Domain/advanceDay/simMode.ts`, `MAX_FOLLOWED_LEAGUES = 3`), mas nada grava o campo.
  - O `PUT /api/saves/:id` (`backend/saves.ts:102-136`) aceita só uma lista fechada de campos.
  - `GameSession` (`gameSession.ts:9-27`) não carrega o campo. O padrão de update do cliente é `updateSaveDevelopmentTraining` (`gameSession.ts:205-220`).
- **Ícones.**
  - A regra de frontend manda passar por `GameInterface/Icons.tsx`. Na prática as telas importam `lucide-react` direto, e o wizard já usa `Globe`, `Star`, `Search`, `Lock` e `MapPin`.
  - Neste plano, ícones novos entram em `Icons.tsx` (`star`, `star-filled`, `globe`) e são usados via `<Icon name=…>`. Não reescreva os imports existentes.
- **i18n.** `newGame.countries.{slug}.{name,headline}` existe só para 6 países, e o wizard sempre usa `defaultValue`. `bun run i18n:lint` acusa texto fixo em JSX.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/types/worldTypes.ts` | criar | `CountryEntry` compartilhado (com `continent`) |
| `src/Domain/world/labels.ts` (+ `.test.ts`) | criar | Nome de país traduzido, rótulo de liga, nome de competição, agrupar por continente, ordenar ligas por nível |
| `src/Domain/advanceDay/simMode.ts` (+ test) | modificar | `sanitizeFollowedLeagues` |
| `src/backend/saves.ts` | modificar | `PUT` aceita `followedLeagues` |
| `src/GameInterface/gameSession.ts` | modificar | Sessão carrega `followedLeagues`; `updateFollowedLeagues` |
| `src/backend/routes.ts` | modificar | Correção do club-profile; cache do 404 de escudo; rota `scout-search` |
| `src/backend/clubProfile.ts` (+ test) | criar | Resolução pura do arquivo do perfil |
| `src/GameInterface/Components/ClubLogo.tsx` | modificar | Pula `of_*`; memória global de URLs que falharam |
| `src/GameInterface/NewGameWizard.tsx` | modificar | Continentes, busca, seletor de divisão, cards |
| `src/GameInterface/LeagueTableScreen.tsx` | modificar | Rótulo com país, estrela de seguir, selo de simulada |
| `src/GameInterface/Components/DaySummaryModal.tsx` | modificar | Agrupa: sua liga e seguidas abertas; outras recolhidas |
| `src/GameInterface/MatchPreviewScreen.tsx`, `MatchResultScreen.tsx` | modificar | Nome da competição via `competitionName` |
| `src/Domain/scout/scoutQuery.ts` (+ test) | criar | Filtro, ordenação e paginação das linhas de Olheiros (puro) |
| `src/GameInterface/ScoutScreen.tsx`, `Scout/ScoutTable.tsx`, `Scout/ScoutFilters.tsx` | modificar | Consulta paginada no servidor; filtro de liga com busca |
| `src/GameInterface/Icons.tsx` | modificar | `star`, `star-filled`, `globe` |
| `src/i18n/locales/en.json`, `pt-BR.json` | modificar | Chaves novas |

---

### Task 1: Tipos e rótulos do mundo (puro)

**Files:**
- Create: `src/types/worldTypes.ts`, `src/Domain/world/labels.ts`
- Modify: `src/types/playerTypes.ts:173-180` (`LeagueData` ganha `iso2?: string; source?: string`)
- Test: `src/Domain/world/labels.test.ts`

- [ ] **Step 1: Tipos**

```ts
// src/types/worldTypes.ts
export type Continent = "Europe" | "South America" | "North America" | "Asia" | "Africa" | "Oceania" | "Other";

export interface CountryEntry {
  slug: string;
  name: string;
  flag: string;
  iso2: string;
  playable: boolean;
  headline: string;
  continent?: Continent;
  source?: string;
}
```

- [ ] **Step 2: Testes**

```ts
// src/Domain/world/labels.test.ts
import { describe, expect, test } from "bun:test";
import {
  CONTINENT_ORDER, competitionName, countryDisplayName, groupCountriesByContinent, leagueLabel, sortLeaguesForCountry,
} from "@/Domain/world/labels";
import type { CountryEntry } from "@/types/worldTypes";
import type { LeagueData } from "@/types/playerTypes";

const C = (name: string, iso2: string, continent: CountryEntry["continent"], slug = name.toLowerCase()): CountryEntry =>
  ({ slug, name, flag: iso2.toLowerCase(), iso2, playable: true, headline: "", continent });
const L = (slug: string, name: string, country: string): LeagueData =>
  ({ slug, name, country, season: "2024-25", standings: [] });

describe("countryDisplayName", () => {
  test("usa a tradução i18n quando existe", () => {
    const t = (key: string, o: { defaultValue: string }) => (key === "newGame.countries.england.name" ? "Inglaterra" : o.defaultValue);
    expect(countryDisplayName(C("England", "GB", "Europe", "england"), "pt-BR", t)).toBe("Inglaterra");
  });
  test("cai para Intl.DisplayNames pelo iso2", () => {
    const t = (_k: string, o: { defaultValue: string }) => o.defaultValue;
    expect(countryDisplayName(C("Germany", "DE", "Europe"), "pt-BR", t)).toBe("Alemanha");
    expect(countryDisplayName(C("Germany", "DE", "Europe"), "en", t)).toBe("Germany");
  });
  test("England continua England em en (iso GB seria United Kingdom)", () => {
    const t = (_k: string, o: { defaultValue: string }) => o.defaultValue;
    expect(countryDisplayName(C("England", "GB", "Europe", "england"), "en", t)).toBe("England");
  });
});

describe("leagueLabel / competitionName", () => {
  const leagues = [L("premier_league", "Premier League", "England"), L("of_armenian_premier_league", "Premier League", "Armenia")];
  test("rótulo inclui o país para desambiguar", () => {
    expect(leagueLabel(leagues[1]!, "Armênia")).toBe("Premier League · Armênia");
  });
  test("competitionName resolve pelo slug e cai para título legível", () => {
    expect(competitionName("of_armenian_premier_league", leagues)).toBe("Premier League");
    expect(competitionName("of_unknown_cup", leagues)).toBe("Unknown Cup");
    expect(competitionName("brazil_serie_a", leagues)).toBe("Brazil Serie A");
  });
});

describe("groupCountriesByContinent", () => {
  test("agrupa na ordem fixa de continentes e ordena por nome exibido", () => {
    const countries = [C("Uruguay", "UY", "South America"), C("Albania", "AL", "Europe"), C("Brazil", "BR", "South America"), C("Fiji", "FJ", undefined)];
    const groups = groupCountriesByContinent(countries, (c) => c.name);
    expect(groups.map((g) => g.continent)).toEqual(["Europe", "South America", "Other"]);
    expect(groups[1]!.countries.map((c) => c.name)).toEqual(["Brazil", "Uruguay"]);
    expect(CONTINENT_ORDER[0]).toBe("Europe");
  });
});

describe("sortLeaguesForCountry", () => {
  test("mantém a ordem do leagueData (nível), filtrando pelo país", () => {
    const ls = [L("a", "A", "Italy"), L("b", "B", "Spain"), L("c", "C", "Italy")];
    expect(sortLeaguesForCountry(ls, "Italy").map((l) => l.slug)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun test src/Domain/world/labels.test.ts`
Expected: FAIL (o módulo ainda não existe).

- [ ] **Step 4: Implementar**

```ts
// src/Domain/world/labels.ts
import type { LeagueData } from "@/types/playerTypes";
import type { Continent, CountryEntry } from "@/types/worldTypes";

export const CONTINENT_ORDER: Continent[] = ["Europe", "South America", "North America", "Asia", "Africa", "Oceania", "Other"];

type TFn = (key: string, opts: { defaultValue: string }) => string;

/** i18n key first (curated names/headlines), then Intl.DisplayNames by ISO, then the raw English name. */
export function countryDisplayName(country: CountryEntry, lang: string, t: TFn): string {
  let fallback = country.name;
  // GB maps to "United Kingdom" in Intl — the game's country is England; only translate non-GB codes.
  if (country.iso2 && country.iso2.toUpperCase() !== "GB") {
    try {
      fallback = new Intl.DisplayNames([lang], { type: "region" }).of(country.iso2.toUpperCase()) ?? country.name;
    } catch {
      fallback = country.name;
    }
  }
  return t(`newGame.countries.${country.slug}.name`, { defaultValue: fallback });
}

export function leagueLabel(league: LeagueData, countryName: string): string {
  return `${league.name} · ${countryName}`;
}

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function competitionName(slug: string, leagues: LeagueData[]): string {
  const hit = leagues.find((l) => l.slug === slug);
  if (hit) return hit.name;
  return titleCase(slug.replace(/^of_/, ""));
}

export interface ContinentGroup { continent: Continent; countries: CountryEntry[] }

export function groupCountriesByContinent(countries: CountryEntry[], displayName: (c: CountryEntry) => string): ContinentGroup[] {
  const buckets = new Map<Continent, CountryEntry[]>();
  for (const c of countries) {
    const k = c.continent ?? "Other";
    buckets.set(k, [...(buckets.get(k) ?? []), c]);
  }
  return CONTINENT_ORDER.filter((k) => buckets.has(k)).map((continent) => ({
    continent,
    countries: [...buckets.get(continent)!].sort((a, b) => displayName(a).localeCompare(displayName(b))),
  }));
}

/** leagueData is already written country → tier by the importer; keep that order. */
export function sortLeaguesForCountry(leagues: LeagueData[], countryName: string): LeagueData[] {
  return leagues.filter((l) => l.country === countryName);
}
```

Se o `Intl.DisplayNames` do Bun devolver outro texto para `DE` em pt-BR, ajuste o teste para o valor real do runtime e registre no relatório. O teste existe para provar que o fallback funciona, não para fixar a string exata.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun test src/Domain/world/labels.test.ts && bun run typecheck` (compare o typecheck com a baseline).
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/worldTypes.ts src/Domain/world/labels.ts src/Domain/world/labels.test.ts src/types/playerTypes.ts
git commit -m "feat(ui): world label helpers (country names, league labels, continents)"
```

---

### Task 2: Ligas seguidas — validação, API e sessão

**Files:**
- Modify: `src/Domain/advanceDay/simMode.ts` (+ `simMode.test.ts`)
- Modify: `src/backend/saves.ts:102-136`
- Modify: `src/GameInterface/gameSession.ts` (`GameSession`, `sessionFromSave`, novo `updateFollowedLeagues`)

- [ ] **Step 1: Testes do validador**

Acrescente ao `simMode.test.ts`:

```ts
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";

describe("sanitizeFollowedLeagues", () => {
  const valid = new Set(["a", "b", "c", "d", "own"]);
  test("remove inválidas, a própria liga e duplicatas; limita a 3", () => {
    expect(sanitizeFollowedLeagues(["a", "x", "own", "a", "b", "c", "d"], valid, "own")).toEqual(["a", "b", "c"]);
  });
  test("entrada que não é array vira []", () => {
    expect(sanitizeFollowedLeagues("a", valid, "own")).toEqual([]);
    expect(sanitizeFollowedLeagues([1, null, "b"], valid, "own")).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**, depois implementar em `simMode.ts`:

```ts
/** Cleans a client-supplied followedLeagues list: known slugs only, not the player's league, unique, max 3. */
export function sanitizeFollowedLeagues(input: unknown, validSlugs: Set<string>, ownLeague: string): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !validSlugs.has(v) || v === ownLeague || out.includes(v)) continue;
    out.push(v);
    if (out.length === MAX_FOLLOWED_LEAGUES) break;
  }
  return out;
}
```

- [ ] **Step 3: API**

Em `saves.ts`, dentro do `PUT`, antes dos defaults táticos:

```ts
      if (body.followedLeagues !== undefined) {
        const leagues = (await Bun.file(`${DATA_DIR}/leagueData.json`).json()) as Array<{ slug: string }>;
        patch.followedLeagues = sanitizeFollowedLeagues(
          body.followedLeagues,
          new Set(leagues.map((l) => l.slug)),
          existing.leagueSlug,
        );
      }
```

Use o `DATA_DIR`/loader que o arquivo ou o backend já usam para `leagueData.json`. Confira os imports; se existir um loader com cache (ex.: `getLeagueData` em `advanceDay.ts`), prefira ele.

- [ ] **Step 4: Sessão no cliente**

- Em `gameSession.ts`, adicione `followedLeagues?: string[]` a `GameSession` e copie o campo em `sessionFromSave`.
- Crie `updateFollowedLeagues(saveId, leagues)` seguindo o padrão de `updateSaveDevelopmentTraining` (PUT `/api/saves/${id}` com `{ followedLeagues }`). Ele atualiza a sessão guardada com o valor **devolvido pelo servidor**, já sanitizado, e devolve esse valor.

- [ ] **Step 5: Testes, typecheck e commit**

```bash
git add src/Domain/advanceDay/simMode.ts src/Domain/advanceDay/simMode.test.ts src/backend/saves.ts src/GameInterface/gameSession.ts
git commit -m "feat: followed leagues can be saved (validated, max 3)"
```

---

### Task 3: Escudos — sem 404 repetido

**Files:**
- Modify: `src/GameInterface/Components/ClubLogo.tsx`
- Modify: `src/backend/routes.ts:38-60` (`/api/logos`)

- [ ] **Step 1: Cliente**

- Em `ClubLogo.tsx`, crie `const failedLogoUrls = new Set<string>()` no módulo.
- Em `squadLogoUrl`/`clubLogoUrl`, se `leagueSlug.startsWith("of_")`, devolva `undefined`: essas ligas não têm arquivo de escudo. Ajuste o tipo de retorno para `string | undefined` e confira os chamadores com o typecheck; todos já aceitam `logoUrl?`.
- No `ClubLogo`, trate `failedLogoUrls.has(logoUrl)` como falha. No `onError`, adicione a URL ao set.
- Resultado: cada URL que falha é pedida uma vez por carregamento da página.

- [ ] **Step 2: Servidor**

No 404 de `/api/logos`, devolva `new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600" } })`.

- [ ] **Step 3: Checar**

Rode `bun run typecheck` contra a baseline. Manual: `bun run dev`, abra a Classificação de uma liga `of_*` e confira que não há pedidos a `/api/logos` para ela; o brasão com as cores aparece.

- [ ] **Step 4: Commit** `fix(ui): skip logo requests for crest-less leagues and remember failures`

---

### Task 4: Perfil do clube no wizard

**Files:**
- Create: `src/backend/clubProfile.ts`, `src/backend/clubProfile.test.ts`
- Modify: `src/backend/routes.ts:98-180`

- [ ] **Step 1: Helper puro com teste**

```ts
// src/backend/clubProfile.ts
import { squadFileStemFromClubParam } from "@/backend/squadIdResolve";

/** File stem for /api/club-profile: accepts squadId or slug; null when unknown. */
export function clubProfileStem(standings: Array<{ squadId: string; slug: string }>, clubParam: string): string | null {
  return squadFileStemFromClubParam(standings, clubParam);
}
```

Leia a assinatura real de `squadFileStemFromClubParam` e ajuste se ela receber outra coisa. Teste:
- `"33"` → `"33"` (arquivo por id);
- `"manchester_united"` → `"33"`;
- `"of_ae_al_ain"` → `"of_ae_al_ain"`;
- `"nope"` → `null`.

- [ ] **Step 2: Rota**

Substitua a conversão id → slug (105-119) por `clubProfileStem(standings, club)` e leia `squads/${league}/${stem}.json`. Com `null`, devolva 404. Carregue o `leagueData.json` com cache no módulo, em vez de fazer parse a cada pedido. Mantenha o formato da resposta. Traduza `reputationLabel` no **cliente**: o servidor continua mandando a chave em inglês e o wizard exibe `t(\`newGame.reputation.${reputation}\`, { defaultValue: reputationLabel })`. Adicione as 5 chaves `newGame.reputation.1..5` em en e pt-BR.

- [ ] **Step 3: Checar e commit**

Teste o helper, rode o typecheck e depois a verificação manual: no wizard, escolha a Inglaterra e um clube; o painel direito mostra estádio, força e jogadores-chave. Commit: `fix: club profile resolves squad files by id`.

---

### Task 5: Wizard — países por continente + busca

**Files:**
- Modify: `src/GameInterface/NewGameWizard.tsx` (`CountrySelector` 843-1025, filtro 176-180, tipo local 36-43)
- Modify: `src/GameInterface/Icons.tsx` (`globe`)
- Modify: `src/i18n/locales/en.json`, `pt-BR.json`

- [ ] **Step 1:** Troque o `CountryEntry` local pelo de `@/types/worldTypes`.

- [ ] **Step 2: Busca**

O filtro (176-180) passa a casar, sem acento e sem diferenciar maiúsculas, com:
- o nome exibido (`countryDisplayName`);
- o `name` em inglês;
- o nome do continente traduzido.

Extraia a normalização para um helper puro em `labels.ts`, `matchesCountryQuery(query, parts: string[])`, e teste-o: `"alem"` casa `"Alemanha"`; `"europa"` casa um país europeu; em pt-BR, `"sao"` casa `"São"`.

- [ ] **Step 3: Grade por continente**

Use `groupCountriesByContinent(filtrados, displayName)`. Cada grupo vira:
- um título `text-[11px] font-black uppercase tracking-widest text-white/40` com a contagem;
- uma grade compacta `grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3`, com blocos menores (bandeira `w-12 h-8`, nome `text-xs`).

Mantenha o selo "Ativo" e o estado selecionado. Remova o `title="Coming Soon"` fixo: use `t("newGame.soon")`, ou apague o atributo se todos os países forem jogáveis. Mantenha a lógica de `playable`.

- [ ] **Step 4: Painel direito**

Mostre o nome traduzido e a manchete. Para países sem chave i18n de manchete, a manchete genérica do importador (em inglês) é substituída em pt-BR por `t("newGame.genericHeadline", { country })`. Adicione a chave em en e pt-BR.

Os contadores "times/divisões" continuam.

- [ ] **Step 5: i18n**

Adicione ao namespace `newGame`, em en e pt-BR:
- `continents.{europe,south_america,north_america,asia,africa,oceania,other}`;
- `countriesCount` (`"{{count}} países"`);
- `genericHeadline`;
- as chaves de busca/placeholder que faltarem.

Rode `bun run i18n:lint`: nenhuma chave nova pode faltar, e nenhum texto fixo novo pode aparecer.

- [ ] **Step 6: Checar e commit**

Rode o typecheck. Manual: a busca "arg" acha a Argentina, e "áfrica" mostra o grupo África. Commit: `feat(ui): new game countries grouped by continent with localized search`.

---

### Task 6: Wizard — divisões e cards de clube

**Files:**
- Modify: `src/GameInterface/NewGameWizard.tsx` (`ClubSelector` 1027-1300)

- [ ] **Step 1: Seletor de divisão**

- Se o país tiver **até 3 ligas**, mantenha as abas atuais, mas com `truncate` e `title={l.name}` para não quebrar.
- Com **mais de 3**, use o `SelectCombobox` (`@/GameInterface/Components/SelectCombobox`) com `options = sortLeaguesForCountry(...).map(l => ({ value: l.slug, label: l.name }))`.
- A liga inicial continua sendo a primeira do país, que é a 1ª divisão.

- [ ] **Step 2: Cards de clube**

- Troque o `#${index+1} · ${activeLeague.name}` (1112), que não é posição real, pela força média do elenco.
- Não peça o perfil de todos os clubes. Calcule no cliente a partir do que a lista já tem; se a lista não tiver jogadores, mostre só o nome do clube.
- Remova o selo "TOP" do índice 0.

- [ ] **Step 3: Checar e commit**

Rode o typecheck e o `i18n:lint`. Manual: Rússia mostra um seletor com 7 divisões; Inglaterra mostra 2 abas. Commit: `feat(ui): division picker scales to many leagues per country`.

---

### Task 7: Classificação — liga com país, seguir e selo

**Files:**
- Modify: `src/GameInterface/LeagueTableScreen.tsx` (596-607, legenda 647-656)
- Modify: `src/GameInterface/Icons.tsx` (`star`, `star-filled`)
- Modify: `src/i18n/locales/*.json`

- [ ] **Step 1: Rótulos**

As opções do combobox passam a ser `leagueLabel(l, countryDisplayName(country de l))`. Assim a busca do combobox também acha por país ("armênia" → Premier League · Armênia). Carregue `countries.json` da mesma forma que o wizard.

- [ ] **Step 2: Seguir**

Ao lado do combobox, adicione um botão estrela:
- **Desabilitado** quando a liga é a do jogador, com dica "Sua liga".
- **Cheio** se a liga está em `session.followedLeagues`.
- **Clique:** alterna a liga na lista e chama `updateFollowedLeagues`, com UI otimista e reversão se der erro.
- **Limite:** se já houver 3 e a liga não estiver na lista, a estrela fica desabilitada, com dica `t("leagues.followLimit")`.

Leia a sessão como as outras telas (`useGameSave` ou `loadSession`; veja o que o componente já usa).

- [ ] **Step 3: Selo "simulada"**

Ao lado do nome, quando `resolveSimMode(slug, { leagueSlug: session.leagueSlug, followedLeagues })` for `"fast"`, mostre um selo pequeno com `t("leagues.simulatedBadge")` e uma dica que explica o que isso significa.

- [ ] **Step 4: Legenda de zonas**

Rótulo da zona via `t(\`leagues.zones.${z.id}\`, { defaultValue: z.label })`. Adicione `zones.{ucl,uel,uecl,rel,prom,lib,sud}` em en e pt-BR.

- [ ] **Step 5: Checar e commit**

Rode o typecheck e o `i18n:lint`. Manual: seguir a Eredivisie, avançar um dia e conferir que o detalhe de um jogo da Eredivisie mostra jogadores (motor completo); a estrela persiste depois de recarregar. Commit: `feat(ui): league selector shows country; follow up to 3 leagues`.

---

### Task 8: Resumo do dia e nomes de competição

**Files:**
- Modify: `src/GameInterface/Components/DaySummaryModal.tsx`
- Modify: `src/GameInterface/MatchPreviewScreen.tsx:60`, `src/GameInterface/MatchResultScreen.tsx:35`

- [ ] **Step 1: Helper puro com teste**

Em `labels.ts`:

```ts
export function partitionDayMatches<T extends { competition: string }>(
  matches: T[], ownLeague: string, followed: string[],
): { primary: T[]; others: T[] } {
  const keep = new Set([ownLeague, ...followed]);
  return { primary: matches.filter((m) => keep.has(m.competition)), others: matches.filter((m) => !keep.has(m.competition)) };
}
```

Teste com 3 partidas: a sua liga e uma seguida vão para `primary`; a terceira vai para `others`.

- [ ] **Step 2: Modal**

- As partidas `primary` são renderizadas como hoje, agrupadas por competição, com o título via `competitionName`.
- As `others` ficam num único bloco recolhido: `t("daySummary.otherLeagues", { count })`, com um botão que expande.
- Ao expandir, mostre **uma linha de texto por partida** (competição, times, placar), sem `ClubLogo`. Isso evita centenas de imagens.
- Troque o `lookupTeam` linear por um `Map` montado uma vez com `useMemo`.

- [ ] **Step 3: Pré e pós-jogo**

`formatCompetition` passa a usar `competitionName(slug, leagues)` com as ligas que a tela já carrega. Se a tela não tiver `leagues` à mão no ponto de uso, use o fallback de título, que tira o `of_`.

- [ ] **Step 4: Checar e commit**

Rode o teste, o typecheck e o `i18n:lint`. Manual: avançar um sábado e conferir que o resumo mostra a sua liga aberta e "Outras ligas (N jogos)" recolhido. Commit: `feat(ui): day summary focuses on your and followed leagues`.

---

### Task 9: Olheiros no servidor, paginado

**Files:**
- Create: `src/Domain/scout/scoutQuery.ts`, `src/Domain/scout/scoutQuery.test.ts`
- Modify: `src/backend/routes.ts` (nova rota `POST /api/saves/:saveId/scout-search`)
- Modify: `src/GameInterface/ScoutScreen.tsx`, `Scout/ScoutTable.tsx`, `Scout/ScoutFilters.tsx`

- [ ] **Step 1: Módulo puro**

Mova a lógica de filtro (`ScoutTable.tsx:48-68`) e de ordenação (70-82) para `scoutQuery.ts`, **sem mudar o comportamento**:

```ts
export interface ScoutQuery { filters: ScoutFilterState; sortKey: string; sortDir: "asc" | "desc"; page: number; pageSize: number }
export interface ScoutPage { rows: DisplayPlayer[]; total: number; page: number; pageSize: number }
export function filterScoutPlayers(players: DisplayPlayer[], filters: ScoutFilterState, sellListedIds: Set<string>): DisplayPlayer[];
export function sortScoutPlayers(players: DisplayPlayer[], sortKey: string, sortDir: "asc" | "desc"): DisplayPlayer[];
export function paginate<T>(rows: T[], page: number, pageSize: number): { rows: T[]; total: number; page: number; pageSize: number };
```

Importe `ScoutFilterState` de `@/GameInterface/Scout/scoutFilterState` e `getMainRole` de `@/GameInterface/positionHelpers`, que o backend já usa. Mova também `mapSquadsToScoutPlayers` (`ScoutScreen.tsx:35-52`) para cá.

Regras da paginação:
- `pageSize` limitado a `[10, 200]`;
- página fora do intervalo vai para a última página válida;
- página 0 com `total` 0 devolve `rows: []`.

- [ ] **Step 2: Testes**

- Cada filtro isolado: nome sem diferenciar maiúsculas, posição, faixas de idade, média e preço, liga, nacionalidade, faixa de atributo, só à venda.
- Ordenação de strings e de números nos dois sentidos.
- `paginate`: limites e página fora do intervalo.
- Um teste de paridade: uma lista de 50 jogadores filtrada com o código antigo, copiado no teste como referência, dá o mesmo resultado que o `filterScoutPlayers`.

- [ ] **Step 3: Rota**

`POST /api/saves/:saveId/scout-search`, com `requireSaveOwner` como em `all-squads`. O corpo é `ScoutQuery`.

O servidor:
1. carrega os elencos (`saveService.getAllSquads`) e a sell-list da mesma fonte que a tela usa hoje;
2. monta os `DisplayPlayer`, filtra, ordena e pagina;
3. devolve `{ ...ScoutPage, nationalities: string[] }`, com as nacionalidades de **todos** os jogadores, ordenadas, para o seletor.

Guarde num cache de módulo, por `saveId` e `currentDate` do meta, a lista montada de `DisplayPlayer` e as nacionalidades. Assim, repetir a busca no mesmo dia não relê 1.227 arquivos. Uma entrada por save; invalide quando o `currentDate` mudar.

**Mantenha** o `GET all-squads`, que outros lugares podem usar; a tela só deixa de chamá-lo.

- [ ] **Step 4: Tela**

- `ScoutScreen` deixa de baixar `all-squads`.
- A cada mudança de filtro já debounced (a tela já faz isso), ou de ordenação ou página, ela chama `scout-search` e guarda a resposta.
- A lista de ligas para o filtro vem de `/api/leagues`, que a tela já busca.
- Depois de uma transferência aceita, refaça a busca atual; hoje ela rebaixa tudo.

`ScoutTable`:
- recebe `rows`, `total`, `page` e `pageSize` prontos;
- remove os `useMemo` de filtro e ordenação;
- mostra `t("scout.table.foundPlayers", { count: total })`;
- ganha no rodapé "Anterior / Próxima" e "página X de Y" com `pageSize` 100;
- o clique no cabeçalho de ordenação sobe para a tela.

`ScoutFilters`: o filtro de liga troca o `SelectListbox` por `SelectCombobox`, com rótulo `leagueLabel(...)` e a opção "Todas as ligas" primeiro.

- [ ] **Step 5: Checar e commit**

Rode os testes e o typecheck.

Manual:
- abra Olheiros e confira na aba de rede que a primeira resposta tem menos de 200 KB;
- filtre por "Eredivisie", ordene por idade e navegue as páginas;
- a contagem total bate com o filtro.

Commit: `perf(scout): server-side filtered, paginated scout search`.

---

### Task 10: Documentação

- [ ] **Step 1:** No spec, seção 4, troque "Configurações: seção Ligas seguidas" por "Classificação: estrela de seguir (até 3)" e a razão.
- [ ] **Step 2:** Em `.claude/rules/data/openfootball-import.md`, retire a limitação do `ScoutScreen` e cite a rota `scout-search`.
- [ ] **Step 3:** Em `.claude/rules/tatics.md` ou num `.claude/rules/ui-world.md` novo (curto), registre os helpers de `src/Domain/world/labels.ts`: `countryDisplayName`, `leagueLabel`, `competitionName`, `partitionDayMatches`. Diga que as telas não devem montar rótulo de liga ou de país à mão.
- [ ] **Step 4:** Commit `docs: open world UI helpers and followed leagues`.

---

## Verificação final

- [ ] `bun test`: tudo passa, exceto o `budgetTierFromTransferBudget` que já falhava antes.
- [ ] `bun run typecheck`: nenhum erro novo em relação à baseline.
- [ ] `bun run i18n:lint`: nenhuma chave faltando; nenhum texto fixo novo.
- [ ] Manual em `bun run dev`:
  - wizard: busca e continentes, perfil de clube das ligas originais, seletor de divisão na Rússia;
  - Classificação: rótulo com país, estrela de seguir que persiste, selo de simulada;
  - resumo do dia recolhido;
  - Olheiros paginado e leve;
  - nenhum pedido a `/api/logos` para ligas `of_*`.
