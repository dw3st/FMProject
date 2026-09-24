# Open World — Plano 3b: pirâmide, virada por país e avanço rápido

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No fim de cada temporada, times sobem e descem entre as divisões de cada país. A data do jogo nunca mais pula, e um botão "Avançar até o próximo jogo" simula a entressafra dia a dia com barra de progresso. Se o clube do jogador trocar de divisão, a carreira acompanha.

**Architecture:**
- **Pirâmide.** `pyramids.json` é gerado pelo importador, com correções manuais em `pyramidOverrides.json`. Ele diz, por país, os níveis e grupos, e quantos sobem e caem em cada um. A mesma fonte regenera as `zones` de exibição de todas as ligas.
- **Lógica pura.** `planPromotionRelegation` recebe a pirâmide de um país e as tabelas finais e devolve a lista de mudanças.
- **Execução em `advanceDay`.** A virada passa a ser **por país**: nenhuma liga do país vira antes da última terminar. Quando a última termina, o país aplica as mudanças (`moveSquad`), relê o índice e roda o `runSeasonTransition` de cada liga com a nova composição. O pulo de data é removido.
- **Avanço rápido.** A rota `POST /api/saves/:id/advance-until` avança em lotes de dias com o mesmo buffer por dia, e o frontend repete a chamada até chegar ao alvo.

**Tech Stack:** Bun + TypeScript, `bun:test`, React 19 + Tailwind + i18next.

**Spec:** `docs/superpowers/specs/2026-09-23-open-world-database-design.md`, seção 3. A Task 9 atualiza o spec: entra o avanço rápido, sai o pulo de data.

**Decisões do usuário:** avanço rápido que simula todos os dias pulados, sem pular data.

---

## Fatos do código (depois do plano 3a)

**Pertencimento dos clubes**
- A pasta `saves/{id}/squads/{liga}/` é a verdade.
- `SaveService.getSquadIndex()` é o `SquadIndex`: `byId`, `inLeague` (ordem numérica), `resolve`, `resolveEntry`, `duplicates`.
- Também existem `getSquadById`, `moveSquad(saveId, id, toLeague)` (incrementa `squad.membershipRev`) e `listSquadFiles`.
- `saveSquad` recusa gravar em liga errada.
- `BufferingSaveDAL` grava na ordem: writes, deletes e `meta` por último. Tem tombstones.
- Regras em `.claude/rules/game/membership.md`.

**Virada de temporada hoje** (`src/backend/advanceDay.ts`, por volta das linhas 560-700 depois do 3a)
- **Por liga:** cada uma vira no dia em que `currentDate === leagueState.end`, depois do dia jogado.
- **`runSeasonTransition`** (`src/Domain/season/seasonTransition.ts:106-175`) é puro:
  - arquiva as standings, o título e os `playerLogs`;
  - gera o calendário de `year + 1` com os mesmos times;
  - reseta os squads (idade + 1, `seasonLog` zerado, verba de TV somada às IAs);
  - devolve `squadsToSave` com `clubSlug = slug ?? id` e a liga de entrada.
- **Crédito de TV do jogador:** entra via `applyPlayerBroadcastingCredit`.
- **Pulo de data:** quando a liga **do jogador** vira, `currentDate` salta para o `start` da próxima temporada, e as rodadas das outras ligas no intervalo nunca são jogadas.
- **Transferências e inbox:** são arquivadas e limpas quando a liga do jogador vira.
- **O índice é montado uma vez por dia** (~linha 170). O 3a assumia que o pertencimento não mudava no meio do dia, e aqui isso passa a mudar.

**Datas de fim no mesmo país diferem** (`leagueSchedules.json`)
- Brasil: A em 12-07, B em 11-30, C em 11-23.
- Itália: A em 05-18, B e C em 05-17.
- França: Ligue 1 em 05-16, Ligue 2 em 05-17.
- Todas as ligas de um país **começam** na mesma data.

**Zonas**
- São só exibição hoje (`LeagueTableScreen`). O `leagueData` já vem ordenado por país e nível.
- Nível por liga só existe no importador:
  - `TL_LEAGUES` em `scripts/importOpenFootball.ts:38-42`;
  - `tierOf` usa `tierOverrides.json`;
  - `levelFlags` e `zonesFor` em `scripts/openfootball/leagues.ts`.
- As contagens de `prom`/`rel` hoje **não batem**:

  | País | Divergência |
  |---|---|
  | Itália | a C tem 3 grupos que sobem 3 cada; a B rebaixa 3 |
  | Rússia | 5 grupos no nível 3 |
  | Colômbia e Uruguai | a 1ª rebaixa 3, a 2ª sobe 2 |
  | Brasil | a C rebaixa 4 sem ter nível abaixo |

**Pirâmides com mais de uma liga**

| País | Níveis |
|---|---|
| Inglaterra | PL(20) → Championship(19) |
| França | Ligue 1(18) → Ligue 2(11) |
| Espanha | La Liga(20) → Segunda(22) |
| Itália | A(20) → B(20) → C/A(19), C/B(18), C/C(19) |
| Brasil | A → B → C (20 cada) |
| Argentina | 1ª(30) → 2ª A(18) → 2ª B(18) (já com override) |
| Rússia | PL(16) → 1ª(18) → A Gold(10), A Silver(8), B2(10), B3(9), B4(8) |

Pares simples: Bielorrússia, Colômbia, Croácia, Arábia Saudita, Ucrânia e Uruguai.

**Frontend**
- `GameSaveProvider.sessionFromSaveJson` atualiza a data, a tática e as `followedLeagues`, mas **não** atualiza `leagueSlug`, `leagueName` nem `clubId`.
- `InboxCategory` só tem `development | transfer_in | transfer_out` (`src/types/inboxTypes.ts:1`).
- O `useAdvanceDay.ts` ignora `seasonEnded`.

**Custo de um dia:** ~1,1 a 1,8 s em dia comum, mais ~6,4 s de motor completo em rodada da liga do jogador.

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/openfootball/pyramid.ts` (+ test) | criar | Monta a pirâmide por país a partir das ligas e níveis; torna as contagens coerentes; gera as zonas de exibição |
| `data_process/openfootball/pyramidOverrides.json` | criar | Correções de nível e grupo (Rússia B no nível 4) |
| `scripts/importOpenFootball.ts` | modificar | Grava `pyramids.json`; regenera as zonas de todas as ligas a partir da pirâmide (mantendo zonas continentais como ucl/lib) |
| `src/example_data/pyramids.json` | gerado | Pirâmide por país |
| `src/types/pyramidTypes.ts` | criar | Tipos da pirâmide |
| `src/Domain/season/promotionRelegation.ts` (+ test) | criar | `planPromotionRelegation` e `countryReadyForTransition` (puros) |
| `src/Domain/season/seasonTransition.ts` (+ test) | modificar | `squadsToSave` carrega `squadId` |
| `src/backend/SaveService.ts` | modificar | `saveSquadById`; `dropSquadIndex` público se ainda não for |
| `src/backend/advanceDay.ts` | modificar | Virada por país; sem pulo de data; clube do jogador que muda de divisão; finanças por nível; inbox |
| `src/backend/advanceUntil.ts` (+ test) | criar | Avanço em lotes até um alvo |
| `src/backend/routes.ts` | modificar | `POST /api/saves/:id/advance-until` |
| `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts` | modificar | Categoria `season` (subiu, caiu, campeão) |
| `src/GameInterface/GameSaveProvider.tsx`, `useAdvanceDay.ts`, Dashboard | modificar | Sessão atualiza liga e clube; botão "Avançar até o próximo jogo" com progresso |
| `src/i18n/locales/*.json` | modificar | Textos |
| `scripts/season-rollover-smoke.ts` | criar | Roda uma temporada inteira e confere acesso e rebaixamento |

---

### Task 1: Pirâmide no importador

**Files:**
- Create: `src/types/pyramidTypes.ts`, `scripts/openfootball/pyramid.ts`, `scripts/openfootball/pyramid.test.ts`, `data_process/openfootball/pyramidOverrides.json`
- Modify: `scripts/importOpenFootball.ts`

**Tipos**

```ts
// src/types/pyramidTypes.ts
export interface PyramidGroup {
  leagueSlug: string;
  /** Clubs that go up from this group to the level above (0 on the top level). */
  promote: number;
  /** Clubs that go down from this group to the level below (0 on the bottom level). */
  relegate: number;
}
export interface PyramidLevel { tier: number; groups: PyramidGroup[] }
export interface CountryPyramid { country: string; levels: PyramidLevel[] }
/** Keyed by leagueData `country` name (same key as countries.json). */
export type Pyramids = Record<string, CountryPyramid>;
```

**Regras de `buildPyramid(leagues: Array<{slug, country, clubs, tier}>)`**
- **Estrutura.** Agrupe por país. Os níveis ficam em ordem crescente de `tier`, e os grupos de cada nível em ordem de slug. Países com um único nível não entram em `pyramids.json`.
- **Contagem por fronteira.** Entre o nível N e o N+1, com K = número de grupos em N+1:
  - Se **K = 1**, a quantidade é `n = min(base(N), base(N+1))`, onde `base(liga) = clubs >= 16 ? 3 : 2`. O grupo de N rebaixa `n` e o grupo de N+1 sobe `n`.
  - Se **K ≥ 2**, cada grupo de N+1 sobe 1, e o N rebaixa K no total.
  - Se N também tiver vários grupos, divida os rebaixamentos pelos grupos de N **o mais igual possível**, com as sobras para os primeiros em ordem de slug.
  - **A soma rebaixada de N é sempre igual à soma promovida de N+1.**
- **Limites.** O nível do topo tem `promote = 0` e o nível mais baixo tem `relegate = 0`. Brasil C passa a rebaixar 0.
- **Limite de tamanho.** Nenhum grupo pode rebaixar ou subir mais da metade dos seus clubes. Se acontecer, reduza e reporte com `console.warn`. Os testes cobrem esse caso.

**Correções** (`pyramidOverrides.json`, formato `{ "<leagueSlug>": { "tier": number } }`)
- Rússia: `of_russian_second_division_b_group_2`, `_3` e `_4` vão para o nível 4. Confirme os slugs exatos no `leagueData.json`.
- A Argentina já é corrigida pelo `tierOverrides.json`. Reuse ou mescle os dois arquivos, lendo ambos sem duplicar lógica. Registre no relatório qual caminho escolheu.

**Zonas de exibição a partir da pirâmide**
- `zonesFromPyramid(group)` gera `prom` (1..promote) e `rel` (`fromEnd: relegate`) para **todas** as ligas de países com pirâmide, **inclusive as 8 do FMProject**.
- Nas ligas do FMProject, preserve as zonas continentais existentes (`ucl`, `uel`, `uecl`, `lib`, `sud`) e troque só `prom`/`rel`.
- O importador **deixa de preservar byte a byte** as entradas do FMProject, mas só no campo `zones`. Todo o resto continua idêntico.
- Ajuste a checagem de integridade do importador: agora ela exige que as zonas sejam iguais às da pirâmide.

**Saída:** `src/example_data/pyramids.json`, e depois `cp -R src/example_data/. src/Data/`.

- [ ] **Step 1: Testes do `buildPyramid`**
  - Par simples (20 e 19 clubes) dá 3/3.
  - Par 17/10 (Colômbia) dá 2/2.
  - Itália com a C em 3 grupos: B rebaixa 3, e cada grupo C sobe 1.
  - Rússia com overrides: 1ª → nível 3 (2 grupos) dá 1ª rebaixa 2 e cada grupo sobe 1. Nível 3 → nível 4 (3 grupos) rebaixa 3, dividido entre os 2 grupos do nível 3 como 2 e 1.
  - Brasil C rebaixa 0.
  - País com um nível fica fora.
  - Limite de metade dos clubes.
  - A soma rebaixada é igual à soma promovida em toda fronteira.
- [ ] **Step 2: Testes do `zonesFromPyramid`**
  - Preserva `ucl`/`lib`.
  - Sem `rel` no nível mais baixo.
- [ ] **Step 3: Implementar e integrar no importador**
  - Rode o importador **duas vezes** e confirme que é idempotente.
  - Imprima a pirâmide de cada país no resumo.
- [ ] **Step 4: Rodar a suíte**
  - `bun test`, typecheck e build.
  - A tela de Classificação continua lendo `zones`; não precisa mudar.
- [ ] **Step 5: Commit**
  - `feat(import): country pyramids with coherent promotion/relegation counts`
  - Depois um commit separado de dados: `data: pyramids.json + zones derived from pyramid`.

---

### Task 2: Planejar acesso e rebaixamento (puro)

**Files:**
- Create: `src/Domain/season/promotionRelegation.ts`, `src/Domain/season/promotionRelegation.test.ts`

```ts
import type { CountryPyramid } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";

export interface ClubMove { squadId: string; from: string; to: string; kind: "promoted" | "relegated" }

/**
 * Final standings per league (already sorted, index 0 = champion) → moves.
 * Relegated clubs from level N are distributed over the groups of N+1 one by one, each time to the
 * group with the fewest clubs *after already-applied moves* (ties → slug order), so group sizes stay balanced.
 */
export function planPromotionRelegation(
  pyramid: CountryPyramid,
  standings: Record<string, StandingRow[]>,
): ClubMove[];

/** True when every league of the country has reached its season end (date > end, or end reached today). */
export function countryReadyForTransition(
  countryLeagueSlugs: string[],
  activeLeagues: Array<{ leagueSlug: string; end: string }>,
  date: string,
): boolean;
```

**Regras**
- **Quem sobe:** os `promote` primeiros da tabela do grupo.
- **Quem cai:** os `relegate` últimos.
- **Destino dos promovidos:** nível N+1 → N. Se o nível N tiver vários grupos, use a mesma distribuição balanceada.
- **Um clube, uma mudança por virada.** Não acontece com a pirâmide coerente, mas trate com `throw`.
- **Sem tabela:** se uma liga não tiver standings, por exemplo sem jogos, **nenhuma mudança** sai dela nem entra nela. Registre com `console.warn`.
- **Ordem da saída:** determinística, por nível e depois por posição.

- [ ] **Step 1: Testes**
  - Par simples com 3 subidas e 3 descidas: os ids certos e o destino certo.
  - Itália: 3 rebaixados da B vão um para cada grupo C, e os campeões dos grupos C sobem.
  - Rússia: distribuição balanceada.
  - Liga sem standings não gera mudança.
  - `countryReadyForTransition` com datas de fim diferentes (Brasil A 12-07, B 11-30):
    - em 11-30: `false`;
    - em 12-07: `true`, porque o dia já foi jogado e a data do dia é igual ao fim;
    - replique exatamente a condição que o `advanceDay` usa hoje para "a liga terminou", ou seja, `nextDate > end`, e escreva o teste com base nela.
- [ ] **Step 2: Implementar e rodar**
- [ ] **Step 3: Commit** `feat: plan promotion/relegation from country pyramid`

---

### Task 3: A virada grava por id

**Files:**
- Modify: `src/Domain/season/seasonTransition.ts` (+ test)
- Modify: `src/backend/SaveService.ts`

- **`squadsToSave`:** cada item passa a ser `{ squadId, squad }`. Remova `leagueSlug` e `clubSlug` do tipo `SquadSaveRef`; se algo mais usar esse tipo, ajuste também.
- **`SaveService.saveSquadById(saveId, squad)`:** grava no local atual do clube, dado por `index.byId(squad.id)`. Lança erro se o id não existir. Teste.
- **`dropSquadIndex(saveId)`:** confirme que está exposto e documentado. O `advanceDay` vai usá-lo depois das mudanças.

- [ ] **Step 1: Testes e implementação**
- [ ] **Step 2: Commit** `refactor: season transition saves squads by id`

---

### Task 4: Virada por país no `advanceDay` (sem pulo de data)

**Files:**
- Modify: `src/backend/advanceDay.ts`
- Modify: `src/types/inboxTypes.ts`, `src/Domain/inbox/inboxEvents.ts`
- Modify: `src/backend/FinancialService.ts`, ou um helper puro novo em `src/Domain/advanceDay/financial.ts`, para o multiplicador de nível

**Novo fluxo no fim do dia** (substitui o loop por liga atual):
1. Para cada **país** que tem liga ativa terminando hoje ou já terminada e ainda não virada, verifique `countryReadyForTransition`. Países sem pirâmide são tratados como uma liga só, que vira sozinha quando termina.
2. **País pronto:**
   1. Calcule a tabela final de cada liga do país: `computeStandings(index.inLeague(slug), fixtures)`.
   2. Rode `planPromotionRelegation(pyramid, standings)`.
   3. **Antes** de mover qualquer clube, arquive e resete cada liga com a composição **antiga**: `runSeasonTransition` com `leagueTeams = index.inLeague(slug)`. Salve os squads resetados com `saveSquadById`. A ordem importa: o reset é gravado no local atual e a mudança vem depois.
   4. Aplique `moveSquad` para cada `ClubMove`.
   5. Faça `dropSquadIndex` e **releia o índice**.
   6. Para cada liga do país, **gere o calendário da próxima temporada** com `index.inLeague(slug)` já com os movidos. Grave as rodadas, o `date-index`, o `meta` da liga e as standings zeradas.
   7. `runSeasonTransition` hoje gera o calendário junto do reset. Separe o que for preciso: a geração do calendário pode ser chamada de novo com os times novos, ou o `runSeasonTransition` pode receber os times do calendário separados dos times do reset. Escolha a forma mais limpa e explique.
   8. Atualize `activeLeagues` de cada liga, incluindo `totalRounds`, que hoje não é atualizado.
3. **Finanças por nível.**
   - Para cada clube movido, multiplique `finances.broadcasting` e `finances.commercial` por `TIER_BROADCAST_MULT[novoNível] / TIER_BROADCAST_MULT[nívelAntigo]`, com a tabela `{1: 1, 2: 0.35, 3: 0.12, 4: 0.05}`.
   - Coloque isso num helper puro com teste.
   - O `budget` não muda.
   - A tabela vive em `src/Domain/advanceDay/financial.ts` ou num config.
4. **Clube do jogador.**
   - Se estiver num `ClubMove`, atualize no `meta`:
     - `leagueSlug` e `leagueName`, com o nome vindo do catálogo;
     - `followedLeagues`, removendo a liga nova se ela estiver lá, via `sanitizeFollowedLeagues` com a liga nova.
   - Emita uma mensagem de inbox da categoria nova `season`, dizendo se subiu ou caiu, e para qual liga.
   - Se o clube for campeão, emita também a mensagem "Campeão da {liga}".
5. **Transferências e inbox.**
   - Hoje são arquivadas e limpas quando a liga do jogador vira. Mantenha: faça isso quando o **país do jogador** virar.
   - As mensagens de `season` do passo 4 são emitidas **depois** do `clearInbox`, para não se perderem.
6. **Remova o pulo de data.** `newCurrentDate` é sempre `nextDate`.
7. **`seasonEnded` na resposta** continua `true` no dia em que o país do jogador vira, e ganha dois campos: `moves` (as do país do jogador) e `playerMove` (o do clube do jogador, se houve).
8. **Liga que terminou antes das outras do país:** até o país virar, ela fica sem jogos, e isso é normal. A liga continua em `activeLeagues` com `end` no passado. O treino segue normalmente.

**Verificação**
- Rode o bench com `--days 5 --buffered --compare`. Tem que sair OK, porque em agosto nenhuma virada acontece.
- A virada em si é verificada na Task 7.

- [ ] **Step 1:** helper do multiplicador de nível, com teste.
- [ ] **Step 2:** categoria de inbox `season` e o builder da mensagem, com teste do builder.
- [ ] **Step 3:** reescrever o bloco de virada.
- [ ] **Step 4:** bench `--compare`, `bun test` e typecheck.
- [ ] **Step 5:** commit `feat: per-country season rollover with promotion/relegation; no date jump`

---

### Task 5: Avanço até um alvo, em lotes

**Files:**
- Create: `src/backend/advanceUntil.ts`, `src/backend/advanceUntil.test.ts`
- Modify: `src/backend/routes.ts` (ou onde está a rota de `advance-day`)

- **Alvo:** o próximo dia em que o clube do jogador tem jogo, lido do `date-index`/rounds da liga atual dele, depois do `currentDate`. Se não houver jogo nos próximos 400 dias, lance erro.
- **Função pura** `computeAdvanceTarget(currentDate, playerFixtureDates)`, com teste.
- **Rota** `POST /api/saves/:saveId/advance-until`:
  - Corpo `{ maxDays?: number }`, padrão 7, limite 14.
  - Avança até `maxDays` dias ou até chegar no alvo (para no dia do jogo, sem simulá-lo; o jogo do jogador acontece pelo fluxo normal com pré-jogo), o que vier primeiro.
  - Cada dia usa o mesmo buffer e o mesmo `withSaveLock` da rota `advance-day`: reuse a mesma função interna.
  - Responde `{ newDate, daysAdvanced, target, done, seasonEvents }`, em que `seasonEvents` junta os `seasonEnded`, `moves` e `playerMove` dos dias do lote.
  - O primeiro dia com erro para o lote e é devolvido.
- **`requireSaveOwner`**, como nas outras rotas.
- **Testes** da lógica de lote, com `advanceOneDay` injetável: para no alvo, para em `maxDays` e para no erro.

- [ ] **Step 1: Testes e implementação**
- [ ] **Step 2: Commit** `feat: advance-until endpoint (batched fast-forward to next match)`

---

### Task 6: Frontend — avanço rápido, sessão e avisos de temporada

**Files:**
- Modify: `src/GameInterface/GameSaveProvider.tsx` (`sessionFromSaveJson`: atualizar `leagueSlug`, `leagueName` e `clubId` a partir do servidor)
- Modify: `src/GameInterface/useAdvanceDay.ts` e a tela onde fica o botão Continuar (encontre-a; provavelmente no Dashboard ou na `StatusBar`)
- Modify: `src/i18n/locales/*.json`

- **Botão "Avançar até o próximo jogo"** ao lado do Continuar. Ele só aparece quando o próximo jogo do jogador está a **mais de 2 dias**.
  - Ao clicar, chama `advance-until` em loop até `done`.
  - Mostra uma barra de progresso (dias avançados / dias até o alvo), com um botão "Parar" que interrompe entre os lotes.
  - Ao terminar, recarrega a sessão e o resumo do dia, como o Continuar faz.
- **Aviso de temporada.** Quando qualquer resposta trouxer `seasonEnded` ou `playerMove`, mostre um modal simples:
  - "Temporada encerrada";
  - "Seu clube subiu para {liga}!" ou "Seu clube caiu para {liga}.";
  - o campeão da liga do jogador, se vier no evento; se não vier, use os dados que existirem e não invente.
  - O modal tem um botão OK. Depois dele, a sessão já mostra a liga nova.
- **Textos** em en e pt-BR. Rode `i18n:lint`.

- [ ] **Step 1: Implementar**
- [ ] **Step 2: Checar**
  - `bun run build`, typecheck e `i18n:lint`.
  - Suba o servidor noutra porta, e não na 3000. Crie um save por script e faça `curl` do `advance-until` num dia sem jogo, mostrando `daysAdvanced` e `done`. Depois apague o save e derrube o servidor pelo PID.
- [ ] **Step 3: Commit** `feat(ui): fast-forward to next match; season end notice; session follows league changes`

---

### Task 7: Temporada inteira de ponta a ponta

**Files:**
- Create: `scripts/season-rollover-smoke.ts`

O script:
1. Cria uma carreira na **Premier League** e avança dia a dia, com buffer por dia, até **passar do fim da temporada inglesa** (2025-05-17) e da virada do país.
   - Custo esperado: ~276 dias × ~1,5 s, mais ~38 rodadas × ~6,4 s, o que dá ~10–12 min.
   - Aceite `--player-league <slug>` para escolher outra liga.
2. **Antes da virada**, guarde:
   - a tabela final da PL e da Championship;
   - a idade de um jogador do clube do jogador;
   - o `budget` do jogador.
3. **Depois da virada**, confira:
   - os 3 últimos da PL estão em `of_championship` e os 3 primeiros da Championship estão em `premier_league`;
   - `inLeague("premier_league")` tem 20 clubes e `inLeague("of_championship")` tem 19;
   - 1227 arquivos, sem ids duplicados e sem `duplicates()` no índice;
   - os calendários novos da PL e da Championship incluem os clubes movidos, e cada clube tem exatamente `2 × (n − 1)` jogos na temporada (n = clubes da liga; em liga ímpar o bye não conta como jogo);
   - as standings zeradas têm os clubes novos;
   - a idade subiu 1 e o `budget` recebeu o crédito de TV;
   - `currentDate` avançou **dia a dia**, sem pular;
   - nenhuma rodada de outra liga (ex.: `brazil_serie_a`) ficou com data passada e `played: false`, dentro do intervalo simulado.
4. **Opcional, com `--italy`:** repita numa carreira da Serie A e confira que os grupos da C recebem 1 rebaixado cada.
5. Apaga o save no `finally` e sai com código diferente de zero se alguma checagem falhar.

- [ ] **Step 1: Implementar e rodar** (rodar em segundo plano; demora uns 10 minutos)
- [ ] **Step 2: Corrigir o que o script revelar**, com commits separados de `fix:`.
- [ ] **Step 3: Commit** `test: full-season rollover smoke (promotion/relegation end to end)`

---

### Task 8: Kits

- A virada não acontece dentro dos kits: o último dia é 2025-02-05 e nenhuma liga termina antes disso.
- As zonas mudaram só no `leagueData`, que os kits não guardam.
- **Não regenere os kits.** Confirme lendo o manifest e os tipos, e registre no relatório.

---

### Task 9: Documentação

- [ ] **Spec, seção 3:** atualize o "Momento da troca" com a virada por país, a regra da ordem (reset, depois mudanças, depois calendário novo) e o fim do pulo de data com o avanço rápido.
- [ ] **`.claude/rules/game/membership.md`:** acrescente a pirâmide (`pyramids.json`, `pyramidOverrides.json`), `planPromotionRelegation` e o multiplicador de nível.
- [ ] **`.claude/rules/data/openfootball-import.md`:** acrescente a pirâmide e as zonas derivadas.
- [ ] **Commit** `docs: pyramid, per-country rollover, fast-forward`

---

## Verificação final

- [ ] `bun test`: tudo passa, exceto o `budgetTierFromTransferBudget`, que já falhava antes.
- [ ] Typecheck sem erros novos, `bun run build` ok e `i18n:lint` sem novidades.
- [ ] `bun scripts/bench-advance-day.ts --days 5 --buffered --compare`: OK.
- [ ] `bun scripts/membership-smoke.ts`: OK.
- [ ] `bun scripts/season-rollover-smoke.ts`: OK.
