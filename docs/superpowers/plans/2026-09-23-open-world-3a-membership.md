# Open World — Plano 3a: pertencimento por save (fundação da pirâmide)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a pasta `saves/{id}/squads/{liga}/` ser a fonte da verdade de "quem joga em qual liga". Com isso, mover um clube de liga (plano 3b) vira mover um arquivo. Nenhuma mudança de jogabilidade, exceto a correção do bug do crédito de TV no fim da temporada.

**Architecture:**
- **Índice por save.** `SquadIndex` é um índice puro montado a partir de `dal.listSquadFiles`, com os campos `squadId → {liga, stem, slug, nome, cores}`. Ele substitui toda leitura de `leagueData.standings` usada para saber quem está em uma liga ou onde está o arquivo de um clube.
- **Catálogo.** O `leagueData.json` fica só como catálogo estático: nome, cores e a **liga de origem para escudos**.
- **Mover arquivos.** O DAL ganha `deleteSquad`. O `BufferingSaveDAL` ganha tombstones e normaliza o `leagueSlug` na escrita.

**Tech Stack:** Bun + TypeScript, `bun:test`, React 19 (ajustes pontuais).

**Spec:** `docs/superpowers/specs/2026-09-23-open-world-database-design.md`, seção 3.

**Desvio do spec:** não haverá `leagueMembership.json`. A pasta do squad no save é a verdade, o que evita duas fontes que podem divergir. A Task 9 atualiza o spec.

---

## Fatos do código

**Arquivos de squad:**
- O stem de cada arquivo é igual ao `squadId`.
- Clubes nativos têm stem numérico e `slug` diferente (`premier_league/33.json`, com `slug: "manchester_united"`).
- Clubes `of_*` têm `slug === id`.

**Leitura de squads via leagueData:**
- `SaveService.getSquad/saveSquad/squadExists` resolvem slug → stem pelo `leagueData.standings` **global** (`SaveService.ts:24-44, 232-250`).
- Se um clube nativo mudar de liga, `getSquad(novaLiga, slug)` devolve null.
- Pelo mesmo motivo, `saveSquad(novaLiga, slug)` cria **um arquivo duplicado** `{slug}.json`.

**`advanceDay.ts` lê o `leagueData.standings` estático em vários pontos:**
- `playerSquadId` (172-174);
- times das partidas (183-209);
- loop de treino e descanso (319-341);
- `computeStandings` diário (377-387);
- times da transição (591-593, 636-640).

**Rotas:**
- `/api/saves/:id/squad/:league/:club` usa `getSquad`.
- `/import-squads` (`routes.ts:262-299`) copia arquivos que faltam no save. Depois de uma mudança de liga, isso **ressuscitaria** a cópia antiga.
- `/api/match-setup` (328-388) resolve o slug do adversário pelo mapa estático.

**`resolveSquadId`** (`SaveService.ts:264-282`) devolve `clubSlug: s.slug` em vez do stem.

**Buffer e DAL:**
- `ISaveDAL` não tem delete.
- O `BufferingSaveDAL` lista cada chave do store mais os edits e guarda o objeto escrito sem normalizar o `leagueSlug` (`:192-216`).

**`startKits.buildKitWorld`** usa `{league: s.leagueSlug, club: s.slug}` e `applyKit` usa `saveSquad(league, slug)` (`startKits.ts:53-60, 101-103`).

**Frontend:**
- `FinancesScreen.tsx:215-218` calcula a posição com o `leagueData.standings` estático.
- `MatchPreviewScreen.tsx:608-661` e `MatchResultScreen.tsx:323-381` resolvem o slug do adversário pelo mapa estático antes de buscar o squad.
- Os escudos usam a liga **atual** (`session.leagueSlug`, `activeSlug`), mas os arquivos de escudo estão em `Data/logos/{liga de origem}/`.

**Bug do crédito de TV** (`advanceDay.ts:556-558, 707-709`):
- O crédito só é aplicado se o `playerSquad` foi carregado antes, o que só acontece na segunda-feira ou em jogo em casa.
- Quando é aplicado, grava o `playerSquad` **anterior ao reset** por cima do squad resetado que a transição salvou em `:632`. Resultado: seu elenco não envelhece e mantém o `seasonLog`.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/backend/dal/ISaveDAL.ts` | modificar | `deleteSquad(saveId, league, club)` |
| `src/backend/dal/FileSystemDAL.ts` (+ test) | modificar | unlink do arquivo |
| `src/backend/dal/BufferingSaveDAL.ts` (+ test) | modificar | tombstones; `writeSquad` normaliza `leagueSlug`; `listLeagues` une as ligas bufferizadas |
| `src/backend/squadIndex.ts` (+ test) | criar | `buildSquadIndex(files)` puro: `byId`, `inLeague`, `resolve` |
| `src/backend/SaveService.ts` (+ test) | modificar | `getSquadIndex`, `getSquad`/`saveSquad`/`squadExists` via índice, `getSquadById`, `moveSquad`, `resolveSquadId` devolvendo o stem |
| `src/backend/advanceDay.ts` | modificar | listas de times vindas do índice; correção do crédito de TV |
| `src/backend/routes.ts` | modificar | rota de squad por id; `import-squads` pelo id; `match-setup` pelo índice |
| `src/backend/startKits.ts` | modificar | usa `listSquadFiles` (stem real) |
| `src/Domain/world/labels.ts` (+ test) | modificar | `catalogLeagueBySquadId(leagues)` |
| `src/GameInterface/{LeagueTableScreen,MatchPreviewScreen,MatchResultScreen,MatchScreen,FinancesScreen}.tsx`, `Dashboard/ClubSidebar.tsx` | modificar | escudo pela liga de origem; adversário por id; posição pela API de standings do save |
| `.claude/rules/…`, spec | modificar | documentação |

---

### Task 1: `deleteSquad` no DAL + tombstones no buffer

**Files:**
- Modify: `src/backend/dal/ISaveDAL.ts`, `src/backend/dal/FileSystemDAL.ts`, `src/backend/dal/BufferingSaveDAL.ts`
- Test: `src/backend/dal/FileSystemDAL.test.ts`, `src/backend/dal/BufferingSaveDAL.test.ts`

**Contrato do `deleteSquad`:**
- Assinatura: `deleteSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<void>`.
- É idempotente: apagar algo que não existe não lança erro.

**`FileSystemDAL`:**
- Faz `unlink` de `squadPath(...)`, ignorando `ENOENT`.
- Chama `bumpSaveDataVersion(saveId)` depois do unlink, como o `writeSquad` já faz.

**`BufferingSaveDAL`:**
- `deleteSquad` grava um **tombstone** no mapa de edits, na mesma chave `league/club`, e registra um thunk pendente `inner.deleteSquad(...)`.
- Com tombstone, `readSquad` devolve null e `squadExists` devolve false. `listSquadFiles`, `listAllSquads` e `listSquadsInLeague` deixam a chave de fora.
- Um `writeSquad` posterior na mesma chave substitui o tombstone e o thunk.
- O flush roda os deletes junto com os demais writes que não são `meta`, e `meta` continua por último.

**Normalização:**
- `writeSquad(saveId, league, club, squad)` guarda `{ ...squad, leagueSlug: league }`, igual ao que o `FileSystemDAL` injeta na leitura.
- Isso vale também para o thunk de flush: o arquivo gravado já leva o `leagueSlug` certo.

**`listLeagues`:** devolve a união da lista do inner com as ligas presentes nos edits, sem tombstones.

- [ ] **Step 1: Testes (FileSystemDAL)**
  - Criar, apagar e confirmar que o arquivo sumiu e que `listSquadFiles` não o traz mais.
  - Apagar algo inexistente não lança erro.
  - A versão do save sobe depois do delete.
- [ ] **Step 2: Testes (BufferingSaveDAL, com inner falso)**
  - Um tombstone esconde a chave em todas as leituras.
  - Mover (write em B + delete em A) faz a chave aparecer só em B, com `leagueSlug: "B"`.
  - Um write depois do delete restaura a chave.
  - O flush chama `inner.deleteSquad` exatamente uma vez e antes do `meta`.
  - `listLeagues` inclui uma liga que só existe nos edits.
- [ ] **Step 3: Implementar e rodar**
  - Rodar `bun test src/backend/dal/`.
  - Rodar o typecheck contra a baseline.
- [ ] **Step 4: Commit** `feat(dal): deleteSquad with buffered tombstones; normalize leagueSlug on write`

---

### Task 2: `SquadIndex` puro

**Files:**
- Create: `src/backend/squadIndex.ts`, `src/backend/squadIndex.test.ts`

```ts
// src/backend/squadIndex.ts
import type { SquadFile } from "@/backend/dal/ISaveDAL";
import type { LeagueTeam } from "@/types/playerTypes";

export interface SquadIndexEntry {
  squadId: string;
  leagueSlug: string;
  /** File stem the squad is stored under (what readSquad/writeSquad address). */
  stem: string;
  slug: string;
  name: string;
  colors: [string, string];
}

export interface SquadIndex {
  byId(squadId: string): SquadIndexEntry | undefined;
  /** Teams currently stored in the league folder, sorted by squadId for determinism. */
  inLeague(leagueSlug: string): LeagueTeam[];
  /** Resolve a club param (squadId, stem or slug) inside a league to its file stem; null when not in that league. */
  resolve(leagueSlug: string, clubParam: string): string | null;
  leagues(): string[];
}

export function buildSquadIndex(files: SquadFile[]): SquadIndex {
  const byId = new Map<string, SquadIndexEntry>();
  const byLeague = new Map<string, SquadIndexEntry[]>();
  for (const f of files) {
    const s = f.squad;
    const e: SquadIndexEntry = {
      squadId: s.id,
      leagueSlug: f.leagueSlug,
      stem: f.clubSlug,
      slug: s.slug ?? s.id,
      name: s.name,
      colors: s.colors,
    };
    if (byId.has(e.squadId)) throw new Error(`squadIndex: duplicate squadId ${e.squadId}`);
    byId.set(e.squadId, e);
    byLeague.set(e.leagueSlug, [...(byLeague.get(e.leagueSlug) ?? []), e]);
  }
  for (const list of byLeague.values()) list.sort((a, b) => a.squadId.localeCompare(b.squadId));
  return {
    byId: (id) => byId.get(id),
    inLeague: (league) =>
      (byLeague.get(league) ?? []).map((e) => ({ squadId: e.squadId, name: e.name, colors: e.colors, slug: e.slug })),
    resolve: (league, param) => {
      const list = byLeague.get(league) ?? [];
      const hit = list.find((e) => e.squadId === param || e.stem === param) ?? list.find((e) => e.slug === param);
      return hit?.stem ?? null;
    },
    leagues: () => [...byLeague.keys()].sort(),
  };
}
```

**Ordem dos times:** `inLeague` ordena por `squadId`. A ordem de hoje vem da ordem dos standings no `leagueData`. Verifique se algo depende dessa ordem: `generateLeagueCalendar` recebe a lista de ids, e a ordem muda os confrontos. Se `createSave` gera calendários a partir do `leagueData`, **mantenha** o `createSave` usando o `leagueData` (o save ainda nem existe), e use o índice só depois que o save existe. Registre essa decisão no relatório.

- [ ] **Step 1: Testes**
  - `byId`.
  - `inLeague` ordenado e sem vazar entre ligas.
  - `resolve` por id, por stem e por slug (clube nativo `33`/`manchester_united`), com null quando o clube está em outra liga.
  - Id duplicado lança erro.
  - `leagues()`.
- [ ] **Step 2: Implementar e rodar**
- [ ] **Step 3: Commit** `feat: pure SquadIndex built from save squad files`

---

### Task 3: `SaveService` pelo índice

**Files:**
- Modify: `src/backend/SaveService.ts`
- Test: `src/backend/SaveService.squads.test.ts` (novo), usando um `ISaveDAL` em memória no próprio teste, ou o `BufferingSaveDAL` sobre um inner falso

**Mudanças:**

- **`getSquadIndex(saveId)`**
  - Monta o índice com `buildSquadIndex(await this.dal.listSquadFiles(saveId))`.
  - Não guarde cache no `SaveService`. O `BufferingSaveDAL` já carrega os arquivos uma vez por dia; o custo aqui é só montar o `Map`.
  - Se isso aparecer no bench, guarde o índice em memória por instância do `SaveService`, que já vive um dia na rota ao vivo, e invalide em `saveSquad`, `moveSquad` e `deleteSquad`.
- **`getSquad(saveId, league, clubParam)`**
  - Tenta `index.resolve(league, clubParam)` e lê pelo stem.
  - Se não achar, tenta `dal.readSquad(league, clubParam)` direto.
  - **Remova** o `standingsMapFromDisk` e o `resolveSquadFileStem`.
- **`getSquadById(saveId, squadId)`:** usa `index.byId`, depois `readSquad(e.leagueSlug, e.stem)`.
- **`saveSquad(saveId, league, clubParam, squad)`**
  - O stem é `index.resolve(league, clubParam)` se existir; senão, `squad.id`.
  - **Nunca** use o slug como stem para um squad novo.
- **`squadExists`:** mesma resolução.
- **`moveSquad(saveId, squadId, toLeague)`**
  1. Lê pelo índice.
  2. Grava em `toLeague` com stem = stem atual.
  3. Apaga o antigo.
  4. Se já estiver em `toLeague`, não faz nada.
  5. Lança erro se o `squadId` não existir.
- **`resolveSquadId`:** passa a devolver `{ leagueSlug, clubSlug: stem }` pelo índice. Mantenha o ramo de prefixo legado só se algo ainda depender dele; confira com grep e, se nada depender, remova.
- **`createSave`:** sem mudança de comportamento.

- [ ] **Step 1: Testes**
  - `getSquad` por slug e por id de um clube nativo.
  - Depois de `moveSquad`, `getSquad(novaLiga, slug)` acha o clube e `getSquad(ligaAntiga, slug)` devolve null.
  - `saveSquad` de um clube movido não cria arquivo duplicado: `listSquadFiles` mostra 1 entrada.
  - `getSquadById`.
  - `resolveSquadId` devolve o stem.
  - `moveSquad` de id inexistente lança erro.
- [ ] **Step 2: Implementar e rodar** `bun test src/backend/` e o typecheck.
- [ ] **Step 3: Commit** `refactor: SaveService resolves squads via per-save index; moveSquad`

---

### Task 4: `advanceDay` pelo índice + correção do crédito de TV

**Files:**
- Modify: `src/backend/advanceDay.ts`, `src/Domain/advanceDay/financial.ts` (se `resolvePlayerSquadId` deixar de ser usado)

**Troca das leituras estáticas.** No início do dia, depois do `meta`, monte `const index = await saveService.getSquadIndex(saveId)` e troque:

| Linha aproximada | Hoje | Passa a ser |
|---|---|---|
| 172-174 | `playerSquadId` via standings | `meta.clubId`, validado por `index.byId(meta.clubId)` |
| 183-209 | squadId da partida → slug estático → `getSquad` | `getSquadById(fixture.home/away)`; ao gravar, use `e.leagueSlug`/`e.stem` do índice |
| 319-341 | treino e descanso sobre `leagueEntry.standings` | sobre `index.inLeague(leagueSlug)` |
| 377-387 | `computeStandings(leagueData teams, fixtures)` | `computeStandings(index.inLeague(leagueSlug), fixtures)` |
| 591-593, 636-640 | times da transição | `index.inLeague(leagueSlug)` |

O ramo legado (sem `activeLeagues`) pode continuar como está. Se ele depender só do mapa estático removido, apague-o: saves antigos ficam inválidos pela regra do CLAUDE.md.

**Correção do crédito de TV:**
- Na transição da liga do jogador, some `playerBroadcastingCredit` ao `finances.budget` **do squad do jogador que está em `squadsToSave`**, o squad já resetado, antes de salvá-lo.
- **Remova** o bloco das linhas ~707-709, que regravava o `playerSquad` antigo.
- Mantenha o `runSeasonTransition` puro. Se ficar mais limpo, faça ele próprio aplicar o crédito ao squad do jogador. Nesse caso, atualize o teste existente ("player budget untouched" passa a ser "player budget += credit") e explique a escolha.

- [ ] **Step 1: Teste do crédito**
  - Faça a lógica do crédito ficar testável: por exemplo, uma função pura `applyPlayerBroadcastingCredit(squadsToSave, playerSquadId, credit)`.
  - Teste que a idade do elenco do jogador sobe 1, que o `seasonLog` zera e que o `budget` recebe o crédito.
- [ ] **Step 2: Implementar**
- [ ] **Step 3: Verificar com o bench**
  - Rode `bun scripts/bench-advance-day.ts --days 5 --buffered --compare`.
  - Os dias precisam seguir idênticos ao antes: mesmas contagens de partidas e standings válidos.
  - Rode também `bun test` e o typecheck.
- [ ] **Step 4: Commit** `refactor: advanceDay reads membership from the save; fix season-end broadcasting overwrite`

---

### Task 5: Rotas

**Files:**
- Modify: `src/backend/routes.ts`

- **`/api/saves/:id/squad/:league/:club`**
  - Resolva com `getSquad(league, club)`.
  - Se der null, tente `getSquadById(club)`: o parâmetro pode ser um id de clube que agora está em outra liga.
  - Devolva o squad com `leagueSlug` atual.
- **`/import-squads`:** pule qualquer squad do `Data/squads` cujo `id` já exista **em qualquer liga** do save (`index.byId`), e não só no mesmo caminho.
- **`/api/match-setup`:** o adversário sai de `getSquadById`, sem o mapa estático.
- **Novo teste:** a rota de squad cai para o id quando a liga não bate. Extraia a resolução para um helper puro se ajudar. Teste também que o `import-squads` pula ids existentes.

- [ ] **Step 1: Implementar e testar**
- [ ] **Step 2: Commit** `fix(api): squad routes resolve by id; import-squads never resurrects moved clubs`

---

### Task 6: startKits pelo stem real

**Files:**
- Modify: `src/backend/startKits.ts`

- `buildKitWorld` passa a usar `listSquadFiles`, com `{ league: f.leagueSlug, club: f.clubSlug, squad: f.squad }`.
- `applyKit` grava pelo stem.
- Não é preciso regenerar os kits: o formato não muda.

**Verificação:**
- Crie uma carreira no Brasil por script, como o `bench-advance-day.ts` faz, e aplique um kit.
- Confirme que `listSquadFiles` continua com 1227 arquivos e sem duplicatas.
- Apague o save.

- [ ] **Step 1: Implementar e verificar**
- [ ] **Step 2: Commit** `fix: start kits address squads by file stem`

---

### Task 7: Frontend — escudos pela liga de origem, adversário por id, posição pelo save

**Files:**
- Modify: `src/Domain/world/labels.ts` (+ test)
- Modify: `LeagueTableScreen.tsx`, `MatchPreviewScreen.tsx`, `MatchResultScreen.tsx`, `MatchScreen.tsx`, `Dashboard/ClubSidebar.tsx`, `FinancesScreen.tsx`

**Helper de liga de origem.** Crie `catalogLeagueBySquadId(leagues: LeagueData[]): Map<string, string>`, que mapeia o squadId para o slug da liga onde o clube aparece no `leagueData`. Teste com duas ligas.

**Escudos.** Todo `squadLogoUrl(id, <liga atual>, slug)` passa a usar `catalog.get(id) ?? <liga atual>`. Os pontos listados nos fatos são:
- `LeagueTableScreen.tsx` ~106/247/269;
- `MatchPreviewScreen.tsx` ~823;
- `MatchResultScreen.tsx` ~455;
- `MatchScreen.tsx` ~224/232;
- `ClubSidebar.tsx` ~109.

Em telas que ainda não carregam `/api/leagues`, use o `leagues` que já estiver disponível, ou carregue uma vez.

**Adversário.**
- `MatchPreviewScreen` e `MatchResultScreen` buscam o squad do adversário por `/api/saves/:id/squad/:league/:squadId`, com o squadId **direto**, sem passar pelo mapa estático. A rota da Task 5 resolve por id.
- Remova os imports de `squadIdToClubSlugMap` e `clubSlugFromSquadId` que deixarem de ser usados.

**Finanças.** `FinancesScreen` pega a posição e os dados da tabela pela API `GET /api/saves/:id/leagues/:slug/standings`, e não pelo `computeStandings` sobre o `leagueData` estático.

**Checagem:**
- `bun run build`, `bun run i18n:lint`, typecheck e testes.
- Suba o servidor numa porta que não seja 3000, faça `curl` da rota de squad por id e derrube o servidor.

- [ ] **Step 1: Helper e teste**
- [ ] **Step 2: Telas**
- [ ] **Step 3: Checar e commit** `fix(ui): crests by catalog league, opponents by id, finance position from save standings`

---

### Task 8: Teste de mudança de liga ponta a ponta (sem pirâmide ainda)

**Files:**
- Create: `scripts/membership-smoke.ts`

O script prova que a fundação aguenta um clube mudando de liga:
1. Cria uma carreira na Premier League por script.
2. Chama `saveService.moveSquad(saveId, <um clube da Championship>, "premier_league")`.
3. Chama `saveService.moveSquad(saveId, <um clube da PL que não seja o do jogador>, "of_championship")`.
4. Avança 3 dias pelo `advanceOneDay` com buffer, como a rota.

Checagens (o script falha se alguma não passar):
- Não há erro, e as contagens de `listSquadFiles` continuam 1227 sem ids duplicados.
- `index.inLeague("premier_league")` tem os 20 clubes certos: o que entrou está, o que saiu não.
- `getSquad` pelo slug nativo acha o clube na liga nova.

**Limitação conhecida, documentada no próprio script:** o calendário da temporada corrente ainda tem os ids antigos. Os jogos do clube movido continuam acontecendo pelo id, porque as partidas agora buscam o squad por id. Isso prova a robustez. O calendário novo é assunto do plano 3b.

Por fim, apaga o save.

- [ ] **Step 1: Implementar e rodar**
- [ ] **Step 2: Commit** `test: membership smoke script (move clubs between leagues)`

---

### Task 9: Documentação

- [ ] **Spec, seção 3:** troque "Pertencimento por save: `leagueMembership.json`" pela regra "a pasta `saves/{id}/squads/{liga}/` é a verdade; `SquadIndex` resolve; `leagueData.json` é só catálogo, incluindo a liga de origem para escudos".
- [ ] **Novo `.claude/rules/game/membership.md`** (curto, em português), com:
  - `SquadIndex`, `getSquadById`, `moveSquad`, `deleteSquad` e os tombstones;
  - "nunca derive pertencimento do `leagueData`";
  - os escudos usam a liga de origem;
  - a correção do crédito de TV.

- [ ] **Commit** `docs: per-save membership`

---

## Verificação final

- [ ] `bun test`: tudo passa, exceto o `budgetTierFromTransferBudget`, que já falhava antes.
- [ ] Typecheck sem erros novos; `bun run build` passa; `i18n:lint` sem novidades.
- [ ] `bun scripts/bench-advance-day.ts --days 5 --buffered --compare` com resultados coerentes, e o tempo por dia sem regressão acima de 10%.
- [ ] `bun scripts/membership-smoke.ts` passa.
