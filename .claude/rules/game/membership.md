# Pertencimento de clubes a ligas (por save)

## Regra

- A pasta `saves/{id}/squads/{liga}/` é a verdade: o clube joga na liga da pasta onde está o arquivo dele.
- **Nunca derive pertencimento do `leagueData.json`** (`standings`). Ele é só catálogo estático: nome, cores, zonas e a liga de origem dos escudos.
- Não existe `leagueMembership.json`. Uma fonte só evita divergência.

## Arquivos

- O stem do arquivo é o `squadId`.
- Clubes nativos têm stem numérico e `slug` diferente (`premier_league/33.json`, `slug: "manchester_united"`).
- Clubes `of_*` têm `slug === id`.

## API (`src/backend/`)

| Peça | O que faz |
|---|---|
| `squadIndex.ts` → `buildSquadIndex(files, { strict? })` | Índice puro: `byId(id)` → `{leagueSlug, stem, slug, nome, cores}`, `inLeague(liga)` (ordenado por id, numérico), `resolve(liga, param)` (id, stem ou slug → stem), `resolveEntry`, `leagues()`, `duplicates()` |
| `SaveService.getSquadIndex(saveId)` | Monta o índice a partir de `listSquadFiles`, com cache por versão do save e build em andamento compartilhado |
| `SaveService.addNewSquads(saveId, candidatos)` | Grava em lote squads novos no save (usado pelo `/import-squads`) |
| `getSquad` / `saveSquad` / `squadExists` | Resolvem o clube pelo índice dentro da liga dada |
| `getSquadById(saveId, id)` | Lê o squad onde quer que ele esteja |
| `moveSquad(saveId, id, liga)` | Grava o arquivo na liga nova (mesmo stem, `leagueSlug` atualizado) e chama `deleteSquad` na antiga |
| `resolveSquadId` | Devolve `{leagueSlug, clubSlug: stem}` |
| `ISaveDAL.deleteSquad` | Remove o arquivo. No `BufferingSaveDAL` vira **tombstone** (`null`): some de todas as leituras e listagens até o `flush`. Uma escrita depois apaga o tombstone. O `writeSquad` bufferizado normaliza o `leagueSlug` |
| `squadRouteResolve.ts` | A rota `/api/saves/:id/squad/:league/:club` tenta o clube na liga e depois o id em qualquer liga. O `/import-squads` nunca ressuscita um clube que já existe no save com o mesmo id |

`advanceDay`, `match-setup` e os kits iniciais usam o índice ou `getSquadById`. Nada disso lê `leagueData.standings`.

## Guardas de consistência

- **`saveSquad` recusa gravações que duplicariam um clube.** Se o param não resolve na liga dada mas o `squad.id` existe em outra liga, lança `saveSquad: squad X lives in L, not M — use moveSquad`. Também lança se o stem resolvido (ou o stem `squad.id` de um squad novo) pertence a outro `squadId`. Trocar de liga é só com `moveSquad`.
- **`getSquad` / `squadExists` confiam só no índice.** Não há mais leitura direta pelo param cru; fora do índice é `null` / `false`.
- **Índice leniente.** Por padrão `buildSquadIndex` não lança em `squadId` duplicado: mantém uma cópia e reporta as outras em `duplicates()`. `getSquadIndex` registra os duplicados com `logError("squadIndex", …)`. A cópia mantida é, nesta ordem: o maior `squad.membershipRev`; a pasta igual ao `squad.leagueSlug` gravado; a primeira em ordem de chave `liga/stem`. `{ strict: true }` mantém o comportamento antigo (lança).
- **`membershipRev`.** `moveSquad` incrementa `squad.membershipRev`. O `FileSystemDAL` sempre normaliza `leagueSlug` para a pasta ao listar, então só o rev distingue a cópia movida da cópia velha que sobrou.
- **Ordem do `flush` do `BufferingSaveDAL`:** (1) todas as escritas exceto meta, (2) os deletes de squad (tombstones), (3) meta. Cada fase só roda se a anterior deu certo; as falhas ficam pendentes para o próximo `flush`. Um `moveSquad` que falha no meio deixa duas cópias do clube, nunca zero, e o dia não conta como avançado (meta não é gravada). Isso vale para a virada por país, que move muitos clubes num único dia bufferizado.
- **`listSquadFiles` tolera arquivo sumido.** Se um arquivo some entre o glob e a leitura (`ENOENT`), ele é pulado.
- **Ordem numérica.** `inLeague` ordena por id com `localeCompare(…, { numeric: true })`: `"33"` vem antes de `"1359"`.
- **`/import-squads`** junta os candidatos e chama `SaveService.addNewSquads` uma vez: lê o índice uma vez, pula ids que já existem em qualquer liga (ou repetidos no próprio import) e descarta o índice uma vez no fim.

## Cache do índice e o contador de versão

- `getSquadIndex` guarda o índice por instância de `SaveService`, carimbado com `getSaveDataVersion(saveId)`. O `FileSystemDAL` incrementa esse contador a cada escrita ou delete de squad/mercado. Chamadas concorrentes na mesma versão compartilham uma única listagem em andamento; ela sai do mapa quando termina, com sucesso ou falha.
- **O contador é local ao processo** (`src/backend/dal/saveDataVersion.ts`). Um script que edita o save em outro processo enquanto o servidor roda não incrementa o contador do servidor. O índice do singleton `saveService` do servidor fica velho até reiniciar. Reinicie o servidor depois de mexer em `squads/` por fora.
- O `advanceDay` não é afetado: cada dia cria um `SaveService` novo sobre um `BufferingSaveDAL` novo, que monta o índice do zero.

## Frontend

- **Escudos pela liga de origem.** Os arquivos ficam em `Data/logos/{liga de origem}/`. Use `catalogLeagueBySquadId(leagues)` (`src/Domain/world/labels.ts`) e passe `catalog.get(id) ?? ligaAtual` para `squadLogoUrl`. `squadLogoUrl` devolve `undefined` para ligas `of_*`.
- **Adversário por id.** Busque `/api/saves/:id/squad/:league/:squadId` com o squadId direto, sem mapear slug pelo `leagueData`.
- **Tabela pelo save.** Posição e classificação vêm de `GET /api/saves/:id/leagues/:slug/standings`.

## Crédito de TV no fim da temporada

- Antes, o crédito só entrava se o `playerSquad` tivesse sido carregado naquele dia. Quando entrava, gravava o squad **anterior ao reset** por cima do squad resetado: o elenco não envelhecia e mantinha o `seasonLog`.
- Agora `applyPlayerBroadcastingCredit` (`src/Domain/season`) soma o crédito no squad já resetado pela transição, antes de gravar.

## Teste ponta a ponta

`bun scripts/membership-smoke.ts` move um clube da Championship para a Premier League e um da PL para a Championship. Depois avança 3 dias com buffer e confere contagens, ids únicos, índice, busca por slug, a rota de squad e a gravação na liga nova. Na temporada corrente o calendário ainda tem a composição antiga, e os clubes movidos jogam os jogos antigos, porque as partidas carregam os squads por id. Na virada de verdade o calendário novo é gerado já com a composição nova (ver abaixo).

`bun scripts/season-rollover-smoke.ts` roda uma temporada inteira dia a dia numa carreira da Premier League, passa pela virada da Inglaterra e da Itália e confere acesso e rebaixamento, calendários novos, finanças do jogador e que nenhuma rodada ficou no passado sem jogar. Leva uns 15 min. `--player-league <slug>` troca a liga (`--italy` = `serie_a`).

## Pirâmide e virada por país (plano 3b)

O pertencimento só muda em um momento: na virada de temporada de um país com pirâmide.

### Fontes

- `src/example_data/pyramids.json` (runtime: `src/Data/pyramids.json`, lido por `getPyramids()` em
  `advanceDay.ts`). Chave = nome do país no `leagueData`; cada nível tem `tier` e grupos
  `{ leagueSlug, promote, relegate }`. Tipos em `src/types/pyramidTypes.ts`.
- Gerado pelo importador (`scripts/openfootball/pyramid.ts`), com correções em
  `data_process/openfootball/pyramidOverrides.json`: nível por liga (grupos B da Rússia no nível 4)
  e `boundaries` por país (Brasil 4/4). Nunca edite `pyramids.json` à mão: regenere.

### Lógica pura

| Função | Arquivo | O que faz |
|---|---|---|
| `planPromotionRelegation(pirâmide, tabelas)` | `src/Domain/season/promotionRelegation.ts` | Tabelas finais → `ClubMove[]`. Os `relegate` últimos descem, os `promote` primeiros sobem, e cada um vai para o grupo mais "em falta" do nível de destino, então os grupos mantêm o tamanho |
| `countryReadyForTransition` | idem | O país só vira quando a última liga dele terminou |
| `findDueRollovers` | `src/Domain/season/countryRollover.ts` | Depois do dia jogado: quais unidades (país ou liga solta) viram, quais esperam e quais só precisam ressincronizar `activeLeagues` |
| `planCountryRollover` | idem | Plano de uma unidade: mudanças, `playerMove`, `playerChampionOf`, mudança de nível por clube e composição esperada |
| `applyTierFinanceChange` / `tierIncomeRatio` | `src/Domain/advanceDay/tierFinances.ts` | Multiplicador de nível: `broadcasting` e `commercial` × `TIER_BROADCAST_MULT[novo] / [antigo]` (1 / 0,35 / 0,12 / 0,05); `budget` e `followers` não mudam |

### Ordem dentro do dia (`advanceOneDay`)

1. Tabelas finais na composição antiga.
2. Plano (`planCountryRollover`).
3. Arquivo + reset de cada liga com a composição **antiga**. Os squads resetados são gravados
   por id (`saveSquadById`), onde estão; o clube que muda de nível já recebe as receitas novas.
   Os clubes da IA passam depois por `applyAISeasonReaction` (seguidores, `financialTier`, verba de
   transferências da temporada) e o do jogador por `applyHumanSeasonReaction` (só seguidores);
   ver `.claude/rules/AI-clubs/finance.md`.
4. `moveSquad` de cada mudança.
5. `dropSquadIndex` + `getSquadIndex`: o índice do dia é relido. É o único ponto em que o
   pertencimento muda no meio de um dia.
6. Calendário novo e tabela zerada com a composição **nova**. Uma divergência entre o índice e
   o plano vai para o `logError("season", …)`.
7. `activeLeagues` com a próxima temporada. É também o marcador de idempotência.

Tudo acontece dentro do mesmo `BufferingSaveDAL`: um dia que falha não grava nada, e a meta vai
por último.

### Clube do jogador

Se o clube do jogador mudou de liga, `meta.leagueSlug`, `leagueName` e `followedLeagues` seguem o
índice (`index.byId(meta.clubId)`), e a inbox recebe as mensagens da categoria `season`. O
frontend (`GameSaveProvider.sessionFromSaveJson`) atualiza liga e clube da sessão.

### Datas

- A data nunca pula. Ligas que já terminaram esperam o país sem jogos, e o avanço rápido
  (`POST /api/saves/:id/advance-until`, ver spec seção 3) atravessa a entressafra dia a dia.
- `generateLeagueCalendar` mantém toda rodada dentro de `[start, end]` (`fitRoundsToWindow`):
  uma rodada depois do `end` se perderia na virada.
