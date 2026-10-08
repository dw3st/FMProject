# Prêmios de fim de temporada (Etapa 32)

Etapa 32 do `docs/ROADMAP.md`, issue #110. Desenho aprovado em 2026-10-07/08 (não muda aqui; esta spec detalha).
Versão **4.8**. Regras atuais que esta etapa toca: `.claude/rules/game/history.md`, `managers.md`, `club-history.md`,
`stats.md`, `morale.md`, `scouting.md`, `negotiation.md`, `AI-clubs/transfer-needs.md`, `membership.md`,
`game-engine/aerial.md`, `set-pieces-play.md`, `ui-standard.md`, `changelog.md`. Regra nova: `.claude/rules/game/awards.md`.

## Decisões

| Tema | Decisão |
|---|---|
| Prêmios por liga | Melhor jogador, revelação (≤ 21), artilheiro, melhor goleiro, seleção da temporada (XI 4-3-3), melhor técnico, gol da temporada |
| Quando | Na virada da liga (passo 3 da virada do país, `membership.md`), em **todas** as ligas do mundo |
| Mínimo de jogos | Prêmios por nota (melhor jogador, revelação, goleiro, XI): jogos **de liga** ≥ ⌈rodadas da liga / 2⌉ |
| Gol da temporada | Só nas ligas jogadas no motor completo (liga do jogador e seguidas): sorteio determinístico entre os gols de fora da área ou de cabeça; as outras ligas não têm esse prêmio |
| Prêmios mundiais | Melhor jogador e melhor técnico do mundo, uma vez por ano, no primeiro dia de janeiro avançado, sobre as temporadas fechadas no ano anterior; cerimônia na inbox |
| Efeitos | Moral do premiado do clube do jogador; valor de mercado +10–15% até a próxima virada da liga dele; mais procurado por clubes grandes (alvo `improvement` da IA e proposta de clube maior pelo jogador do humano) |
| Onde aparece | Linha da temporada do histórico do jogador (`PlayerHistoryRow.awards`), registro do técnico (`ManagerRecord.awards`), selos na ficha, ranking de técnicos, aba **Prêmios** em Estatísticas, filtro "Só premiados" no olheiro, inbox |
| Dado | `saves/{id}/awards/{ano}.json` (um arquivo por ano de fechamento) + `saves/{id}/seasonGoals/{liga}-{ano}.json` (candidatos a gol da temporada), via DAL / `BufferingSaveDAL` |
| `/test`, `/lab` | **Sem efeito de partida**: nada a exibir. O motor só passa a registrar os gols da partida (dado, nenhuma decisão muda) |
| Saves antigos | Sem migração (protótipo): sem arquivo = sem prêmios |

## 1. O que um gol guarda hoje (levantamento)

- **Motor completo:** `gameBus.emit('goalScored', { team, score, scorerId, assistId?, header?, setPiece? })`
  (`gameState.ts`, gol de jogada e de pênalti). A posição do chute existe só no evento anterior,
  `shotResolved { fromX, fromY, toX, toY }`. O minuto não vai em nenhum dos dois.
- **Day log (`MatchEvent`, `dayLogTypes.ts`):** só `scorers: { playerId, playerName, team, goals }[]` (contagem por
  jogador) e `teamStats.headerGoals`/`setPieceGoals` (contagens por time). Nada por gol.
- **Partida ao vivo:** `PlayedMatchRecording` (`buildPlayedMatchRecording.ts`) também só tem `playerStats`.
- **quickSim:** nunca tem lance (só sorteio de autor; `compact: true`).

Logo, para o gol da temporada, o motor passa a gravar o mínimo, **só nas partidas do motor**:

```ts
// src/types/dayLogTypes.ts
export interface MatchGoal {
  playerId: string;            // id de elenco do autor
  team: "home" | "away";
  minute: number;              // matchMinute(state) + 1 (como a tela)
  header: boolean;
  setPiece?: "corner" | "free_kick" | "direct_free_kick" | "penalty";
  distance: number;            // jardas do ponto do chute ao centro do gol (1 casa)
  outsideBox: boolean;         // chute de fora da grande área
  assistId?: string;
}
MatchEvent.goals?: MatchGoal[];              // ausente no quickSim (compact) e em eventos antigos
PlayedMatchRecording.goals?: MatchGoal[];    // partida ao vivo
```

- `goalScored` ganha `fromX`, `fromY`, `goalX` (linha do gol atacado) e `minute` — dados, sem mudar nenhuma decisão.
  No pênalti: a marca (12 jardas).
- `Statistics.ts` guarda a lista da partida (`getGoalLog()`, zerada com as demais estatísticas) e `simulateMatch`
  devolve `MatchResult.goals` (ids do motor); `buildMatchEvent` traduz para ids de elenco (mesmo mapa de
  `playerStats`). `buildPlayedMatchRecording` copia `getGoalLog()` da partida ao vivo.
- **Partida ao vivo vinda do cliente:** `sanitizeRecordedGoals(goals, score, homeSquad, awaySquad)` descarta a lista
  inteira se ela não bater (gols por lado ≠ placar do tempo normal + prorrogação, autor fora dos elencos, minuto
  fora de 0..130, distância fora de 0..130). Sem a lista a partida só não gera candidatos.
- `outsideBox = |goalX − fromX| > PENALTY_AREA_DEPTH || fromY < PENALTY_AREA_Y_MIN || fromY > PENALTY_AREA_Y_MAX`;
  `distance = hypot(goalX − fromX, 37 − fromY)`.

## 2. Candidatos a gol da temporada

- No avanço do dia, depois das partidas: para cada `MatchEvent` com `goals` cuja `competition` é **liga**
  (nem copa nem continental), os gols elegíveis entram em `seasonGoals/{liga}-{ano}.json` (`ano` = `year` da temporada
  da liga, `LeagueSeasonState.year`).
- **Elegível:** `header === true` **ou** `outsideBox === true`, e nunca pênalti. Falta direta de fora da área conta
  (é de fora da área).
- Entrada: `{ key, fixtureId, date, playerId, playerName, squadId, opponentId, minute, header, distance, setPiece? }`;
  `key = fixtureId:minute:playerId` evita duplicata num dia refeito (o append ignora chave repetida).
- Tamanho: ~2,4 gols × 380 jogos × ~30% elegíveis ≈ 300 entradas × ~180 B ≈ 55 KB por liga e temporada; no máximo 4
  ligas por temporada no motor (a do jogador + 3 seguidas).
- Uma liga que deixa de ser seguida no meio da temporada guarda o que já entrou; uma que passa a ser seguida começa do
  zero (o prêmio sai se houver ao menos um candidato).
- Na virada da liga: o sorteio usa o arquivo do ano que fecha; arquivos de anos anteriores ao que fecha são apagados
  (o do ano que fecha fica até a virada seguinte — um dia refeito ainda o encontra).

**Sorteio** (`pickGoalOfSeason`): `mulberry32(seedFrom("goal:{saveId}:{liga}:{temporada}"))`, peso
`1` para cabeçada e `1 + (distância − 18) / 10` (limitado a 3) para chute de fora da área (o golaço de longe pesa
mais; segue sendo sorteio). Sem candidato, a liga não tem o prêmio naquela temporada.

## 3. Prêmios por liga (`computeLeagueAwards`, puro)

Entrada: as linhas de histórico que a virada acabou de gravar (`closeSeasonForPlayers`) de todos os jogadores dos
elencos da liga (só a linha nova: `season` e `league` da virada, sem `partial`), a idade de cada um **na temporada**
(o elenco já envelheceu na transição: `idade − 1`), `positions[0]` (linha), `totalRounds` da liga, a tabela final, o
técnico de cada clube e a meta de cada clube.

- **Números de liga da linha:** `apps − cupApps − contApps`, `goals − cupGoals − contGoals`. A nota é `avgRating` da
  linha (todas as competições no clube: o `seasonLog` não separa nota de liga — `stats.md`).
- **Elegível por nota:** jogos de liga ≥ `ceil(totalRounds / 2)` e `avgRating > 0`.
- **Melhor jogador:** maior nota entre os elegíveis; desempate: mais gols + assistências, depois menor id.
- **Revelação:** idade na temporada ≤ 21, mesma regra.
- **Artilheiro:** mais gols de liga (sem mínimo de jogos); desempate: menos jogos de liga, maior nota, menor id. Zero
  gols na liga inteira = sem prêmio.
- **Melhor goleiro:** linha GK (`getMainRole(positions[0]) === "GK"`), maior nota entre os elegíveis.
- **Seleção (XI 4-3-3):** vagas `GK, LB, CB, CB, RB, CM, CM, CAM, LW, ST, RW` (a formação `4-3-3`). Por linha
  (GK 1, DEF 4, MID 3, FWD 3), os elegíveis da linha com maior nota; depois, dentro da linha, cada um vai para a vaga em
  que tem a melhor aptidão (`aptitudeFor`: natural > apt > training > unsuitable), o de maior nota escolhendo primeiro.
  Linha sem elegíveis suficientes: completa com os de **≥ 1 jogo de liga** da linha por nota; ainda faltando (não
  acontece num mundo real), a vaga fica sem nome e o smoke acusa.
- **Melhor técnico:** para cada clube com jogos na tabela, o técnico no cargo na virada (`managers.json`; antes das
  demissões de virada `aiDesk.rollover`), elegível se não for interino contratado depois da metade da temporada
  (`hiredOn` ≤ meio da janela da liga; sem `hiredOn` vale). Nota = `(meta − posição) / tamanho + 0,3 se campeão + 0,15
  se subiu`. **Meta:** clube do jogador = `board.objective.target`; IA = `objectiveFor(...).target` (o alvo que a revisão
  de segunda já guarda em `ManagerRecord.target`, `targetsOf` do `aiDesk`; sem cache, calculado dos elencos como no
  `targetsOf`). Desempate: mais pontos na tabela, menor id do clube.
- **Gol da temporada:** §2.
- **Lista curta para os mundiais:** os 5 melhores jogadores por `seasonScore` e os 3 melhores técnicos pela nota
  acima, guardados com a liga (ver §5).

```
seasonScore(linha) = avgRating + 0,03 × gols + 0,02 × assistências          (totais da linha, todas as competições)
                   + títulos da linha: liga 0,15 · copa 0,10 · continental 0,30
```

Saída (`LeagueSeasonAwards`, gravada no arquivo do ano):

```ts
type LeagueAwardKind = "best_player" | "young_player" | "top_scorer" | "best_goalkeeper"
  | "team_of_season" | "best_manager" | "goal_of_season";
interface AwardedPlayer { playerId: string; name: string; squadId: string; clubName: string;
  value: number;            // nota (ou gols, no artilheiro)
  leagueApps: number; slot?: string /* vaga no XI */ }
interface LeagueSeasonAwards {
  league: string; season: string; closedOn: string; country: string | null; tier: number;
  weight: number;           // countryWeight × fator do nível (mundiais)
  bestPlayer?: AwardedPlayer; youngPlayer?: AwardedPlayer; topScorer?: AwardedPlayer; bestGoalkeeper?: AwardedPlayer;
  teamOfSeason: AwardedPlayer[];           // 11, na ordem das vagas
  bestManager?: { managerId: string; name: string; squadId: string; clubName: string; position: number; target: number; score: number };
  goalOfSeason?: GoalOfSeasonCandidate;
  shortlist: { players: (AwardedPlayer & { seasonScore: number })[]; managers: { managerId: string; name: string; squadId: string; score: number }[] };
}
```

`weight = countryWeight do país (managerTracker.weightOf, o mesmo do ranking de técnicos) × TIER_FACTOR[nível]`
(nível 1 = 1, 2 = 0,6, 3+ = 0,4; liga sem pirâmide = nível 1).

## 4. Onde a virada grava (`advanceDay`, passo 3)

Dentro do bloco de histórico de cada liga da unidade:

1. **Antes de `aiDesk.rollover`:** escolhe o melhor técnico e a lista curta de técnicos (o técnico ainda é o que
   dirigiu a temporada).
2. **Depois de `closeSeasonForPlayers`:** limpa os bônus de valor antigos (§6) dos jogadores da liga, calcula os
   prêmios de jogador, grava nas linhas novas (`PlayerHistoryRow.awards`), aplica o bônus de valor e, no clube do
   jogador, a moral.
3. Grava o técnico (`ManagerRecord.awards`, pelo `managerTracker.apply`, sem repetir temporada+tipo+liga).
4. `upsertLeagueAwards(ano de currentDate, entrada)`: substitui a entrada da mesma liga e temporada (idempotente num
   dia refeito); apaga os `seasonGoals` de anos anteriores.
5. Liga do jogador: a mensagem `awards`/`league` vai para uma fila adiada e é gravada depois do `clearInbox`.

`PlayerHistoryRow.awards?: PlayerAward[]` com `PlayerAward = { kind: AwardKind; league?: string; year?: number }`
(`AwardKind = LeagueAwardKind | "world_player" | "world_manager"`; `league` nos prêmios de liga, `year` nos mundiais).
`ManagerRecord.awards?: ManagerAward[]` com `{ season, kind: "best_manager" | "world_manager", competition (liga ou
"world"), squadId, year? }`.

**Custo:** os elencos da liga já estão em memória (`transition.squadsToSave`); o técnico vem do `managerTracker`; a meta
da IA vem do cache (`targetsOf`) — só sem cache calcula `clubLevel` dos ~20 clubes, como a revisão de segunda.

## 5. Prêmios mundiais (janeiro)

- **Quando:** num dia com mês `01`, se o arquivo `awards/{ano − 1}.json` existe, tem ligas e ainda não tem `world`
  (idempotente pela própria presença de `world`). Roda depois das viradas do dia. Na pré-simulação do kit (agosto →
  fevereiro) não há ligas fechadas em 2026: nada acontece.
- **Melhor jogador do mundo:** entre as listas curtas de jogadores de todas as ligas do arquivo,
  `worldScore = weight × (seasonScore − 5)`; o mesmo jogador em duas ligas no ano (calendário de ano civil + europeu)
  soma as duas entradas. Desempate: maior `seasonScore`, menor id.
- **Melhor técnico do mundo:** candidatos = técnicos das listas curtas + todo técnico com título creditado no ano
  (`ManagerTitle.on`, campo novo: data do crédito). `worldScore = Σ weight × nota da lista curta + pontos de títulos com
  `on` no ano ÷ 200`. Desempate: mais pontos de títulos, menor id.
- **Gravação:** `world = { year, player: {...top 3}, manager: {...top 3}, on }` no arquivo do ano anterior; o vencedor
  ganha `world_player` / `world_manager` (`year`) na linha de histórico da temporada pela qual entrou na lista curta
  (procurado pelo `squadId` da lista; se ele mudou de clube, varre os elencos, livres e aposentados — uma vez por ano);
  o técnico em `ManagerRecord.awards`. Efeitos do vencedor jogador: o mesmo bônus de valor do melhor jogador (§6) e a
  moral se for do clube do jogador.
- **Cerimônia:** mensagem `awards`/`world` com os 3 primeiros de cada prêmio, sempre (não depende da liga do jogador).

## 6. Efeitos

### Valor de mercado (`RosterPlayer.awardBoost`)

- `awardBoost?: { season: string; league: string; mult: number }`. Mult por prêmio (o maior vale, não somam):
  melhor jogador / mundial 1,15; artilheiro, revelação, goleiro 1,12; seleção 1,10. Técnico e gol da temporada não dão
  bônus.
- **Até a próxima virada da liga dele:** no passo 3 de cada virada, antes de premiar, todo jogador dos elencos da liga
  perde `awardBoost` (quem foi premiado de novo ganha o novo). Quem mudou de liga perde na virada da liga nova.
  `toFreeAgent` apaga o bônus.
- **Onde entra:** `Player` ganha um 3º parâmetro `valueMult = 1` multiplicado em `valueMillions` (o `price` segue a
  mesma grade); um único helper `playerValueModel(player, rating?)` (`src/Domain/awards/awardValue.ts`) constrói o
  `Player` com `awardValueMult(player)`. Todo `new Player(playerOverallRating(p), p.age)` sobre um `RosterPlayer`
  (`bids.ts`, `rivals.ts`, `transferAcceptance.ts`, `transferNeeds.ts`, `askingPrice.ts`, `displayPlayer.ts`,
  `scouting/missions.ts`, `scouting/seen.ts`) passa por ele. **O motor não lê valor**: nada muda em partida.

### Mais procurado por clubes grandes

- `scoreImprovement` (alvo `improvement`, só de compradores de tier mid/high — `transfer-needs.md`): `+ AWARDS.
  IMPROVEMENT_BONUS (0,08)` quando o candidato tem `awardBoost`.
- `generateBidsForHuman`, proposta de clube maior por um jogador fora da lista: chance diária `UNLISTED_CHANCE ×
  AWARDS.BIG_CLUB_BID_MULT (2)` quando o elenco humano tem um premiado livre; o alvo é o premiado de maior nota (senão o
  melhor jogador, como hoje).
- **Medição obrigatória** (`bun scripts/market-sim.ts 3 [--awards]`, novo `--awards` que sorteia os premiados de cada
  liga no fim da temporada sintética com a mesma regra de linhas/nota e aplica `awardBoost`): transferências IA × IA com
  taxa ±5% do sem prêmios, `open` ≥ 90% em todo tier, elenco médio igual; imprime quantos premiados foram vendidos e a
  taxa média deles ÷ valor sem bônus. Ajustar `IMPROVEMENT_BONUS` se sair da faixa.

### Moral (clube do jogador)

`afterAward(squad, playerId, kind)` (`src/Domain/morale/morale.ts`, pelo `withEventDelta`, então o temperamento
escala): melhor jogador / mundial +10, revelação / artilheiro / goleiro +8, seleção +5, gol da temporada +4 (só o
maior prêmio da virada conta). Clube da IA: nada (sem moral).

## 7. Telas

- **Estatísticas → aba Prêmios** (`?tab=awards`): seletor de ano (anos do arquivo) e de liga (`SelectCombobox`
  agrupado por continente/país, com rótulo "LIGA"); no topo, o cartão "Prêmios mundiais" do ano (se houver); por liga:
  cartões dos prêmios individuais (selo, jogador com link para a ficha, clube com escudo, nota/gols), o XI em lista por
  linha (`TABLE_STYLE`), o técnico (posição × meta) e o gol da temporada ("Fulano, 34' contra X, de cabeça / de 27
  jardas"). Padrão `ui-standard.md` (o título da tela não muda; nada de texto < 13px).
- **Ficha do jogador:** selos (`AwardBadge`, ícones `award`/`medal`/`trophy`) dos prêmios de todas as linhas, mais
  recentes primeiro, com a temporada no `title`; `CareerTable` mostra os selos na coluna Títulos.
- **Ranking de técnicos:** coluna "Prêmios" (contagem) e a lista ao abrir o técnico.
- **Olheiro:** chip "Só premiados" (`onlyAwarded`): jogador com algum prêmio no histórico (prêmio é público, vale com
  qualquer conhecimento).
- **Inbox `awards`:** `league` (premiados da liga do jogador, destaque para os do clube dele) e `world` (cerimônia).
  Tópico `competitions` das preferências (`responsibilities.md`).
- i18n `awards.*`, `statsScreen.awards.*`, `inbox.awards.*`, `scout.onlyAwarded` (en, pt-BR).

## 8. Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/awards?year=YYYY` | Dono do save. `{ years, year, leagues, world }`; sem `year` = o mais recente; ano sem arquivo → 404; `year` inválido → 400 |
| `GET /api/saves/:id/managers` | Itens ganham `awards` |
| `POST /api/saves/:id/scout-search` | Filtro `onlyAwarded`; linha com `awarded` |

## 9. `/test`, `/lab`

Sem efeito de partida: os prêmios não mudam nenhuma decisão nem resultado. O motor só emite mais campos em `goalScored`
e o `Statistics.ts` guarda a lista de gols (para o day log); nenhuma estatística nova no `StatsPanel` nem no `/lab`.

## 10. Smoke (`scripts/season-rollover-smoke.ts`, seção "Prêmios")

Para cada liga virada na corrida:
- há entrada no arquivo do ano com `teamOfSeason` de 11 nomes únicos nas vagas do 4-3-3;
- melhor jogador, revelação, goleiro e todo o XI (salvo o complemento, que o smoke conta e só informa) com jogos de liga ≥
  metade das rodadas; revelação ≤ 21 na temporada; goleiro da linha GK;
- artilheiro = maior número de gols de liga entre as linhas da liga;
- gol da temporada só nas ligas jogadas no motor (a do jogador e as de `meta.followedLeagues` do save do smoke), e nunca nas demais;
- a linha de histórico de cada premiado tem o prêmio; `awardBoost` aplicado; o premiado do clube do jogador (se houver)
  ganhou moral no dia; o técnico premiado tem o registro;
- a inbox do dia da virada do país do jogador tem a mensagem `league`.
Mundial: só se a corrida passar por janeiro (a padrão não passa); senão o teste dedicado
`src/backend/awards.world.test.ts` (save de teste, arquivo do ano anterior semeado, dia 2028-01-01).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/awardTypes.ts` | Tipos (`AwardKind`, `PlayerAward`, `ManagerAward`, `LeagueSeasonAwards`, `WorldAwards`, `AwardsYear`, `GoalOfSeasonCandidate`) |
| `src/Domain/awards/awardsConfig.ts` | Constantes (`AWARDS`) |
| `src/Domain/awards/leagueAwards.ts` (+ teste) | `leagueCandidates`, `computeLeagueAwards`, `pickTeamOfSeason`, `managerAwardScore` |
| `src/Domain/awards/goalOfSeason.ts` (+ teste) | `goalGeometry`, `isGoalCandidate`, `pickGoalOfSeason`, `sanitizeRecordedGoals` |
| `src/Domain/awards/worldAwards.ts` (+ teste) | `computeWorldAwards` |
| `src/Domain/awards/awardEffects.ts` (+ teste) | `withAwardsOnRows`, `applyAwardBoosts`, `clearAwardBoosts`, `addManagerAward`, `awardBoostOf` |
| `src/Domain/awards/awardValue.ts` (+ teste) | `awardValueMult`, `playerValueModel` |
| `src/Domain/awards/awardMessages.ts` | Inbox `awards` |
| `src/GameEngine/Domain/gameState.ts`, `Statistics.ts`, `SimulateMatch.ts`, `Infrastructure/EventBus.ts` | Registro dos gols |
| `src/Domain/advanceDay/matches.ts`, `src/GameInterface/buildPlayedMatchRecording.ts` | `MatchEvent.goals`, `PlayedMatchRecording.goals` |
| `src/backend/dal/*`, `SaveService.ts` | `awards/{ano}.json`, `seasonGoals/{liga}-{ano}.json` |
| `src/backend/awardsWorld.ts` | E/S: acumular gols, prêmios da liga na virada, cerimônia mundial |
| `src/backend/awardsRoutes.ts` | `GET /awards` |
| `src/backend/advanceDay.ts`, `managerWorld.ts` | Ganchos; `ManagerTitle.on` |
| `src/GameInterface/Awards/*`, `StatsScreen.tsx`, `PlayerScreen`, `CareerTable.tsx`, `ManagerRanking.tsx`, `ScoutScreen` | Telas |

## Pontos abertos

1. **Nota de liga.** O `seasonLog` só guarda a nota média da temporada inteira (liga + copa + continental). Os prêmios
   por nota usam essa média, com o mínimo de jogos contado só na liga. Separar a nota de liga exigiria um campo novo no
   `seasonLog` (`leagueRatingSum`) — não feito; a diferença é pequena (copa e continental são ~10–20% dos jogos).
2. **Transferência no meio da temporada dentro da mesma liga.** Só a linha do clube atual na virada conta: um jogador
   vendido de um clube a outro da mesma liga tem os jogos divididos em duas linhas e pode não alcançar o mínimo em
   nenhuma. Juntar as linhas da mesma liga é possível (as parciais abertas estão no `history`), mas complica qual linha
   recebe o prêmio; fica para depois.
3. **Gol da temporada no motor só para ligas seguidas.** Uma liga seguida só por parte da temporada sorteia entre os gols
   do período seguido.
4. **Partida ao vivo:** a lista de gols vem do cliente e é só validada por consistência (como o resto da gravação).
5. **Mundial de janeiro e ligas de ano civil:** uma liga de ano civil que vira depois de 31/12 (não acontece com o
   calendário atual) entraria no ano seguinte.
6. **Repetição de um dia que falhou (fase 1 do `flush` não atômica):** como o histórico e o extrato, a moral do premiado
   pode ser aplicada duas vezes se só o elenco tiver sido gravado; o arquivo de prêmios, as linhas e os registros dos
   técnicos são idempotentes.
