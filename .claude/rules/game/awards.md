# Prêmios de fim de temporada

Spec: `docs/superpowers/specs/2026-10-08-season-awards-design.md`. Etapa 32 do `docs/ROADMAP.md` (#110), versão
**4.8**. Visual: `.claude/rules/ui-standard.md`. Histórico: `history.md`; técnicos: `managers.md`.

## Regra

- **Toda liga do mundo** premia na sua virada (passo 3 da virada do país, `membership.md`): melhor jogador, revelação
  (≤ 21 anos na temporada), artilheiro, melhor goleiro, seleção da temporada (XI 4-3-3), melhor técnico e, só nas ligas
  jogadas no motor completo (a do jogador e as seguidas), o gol da temporada.
- **Todo janeiro** (primeiro dia de janeiro avançado) saem o melhor jogador e o melhor técnico do mundo, sobre as
  temporadas fechadas no ano anterior; cerimônia na inbox.
- Os prêmios ficam na linha da temporada do histórico (`PlayerHistoryRow.awards`) e no registro do técnico
  (`ManagerRecord.awards`); mexem na moral (clube do jogador), no valor de mercado e no interesse dos clubes grandes.
- Sem migração (protótipo): sem arquivo = sem prêmios.
- **`/test`, `/lab`: sem efeito de partida.** O motor só passa a registrar os gols (`goalScored` com `fromX`, `fromY`,
  `goalX`, `minute` → `Statistics.getGoalLog()` → `MatchResult.goals` → `MatchEvent.goals`); nenhuma decisão, sorteio
  ou resultado muda. O quickSim não grava gols (`compact`).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/awardTypes.ts` | `AwardKind`, `PlayerAward`, `ManagerAward`, `LeagueSeasonAwards`, `WorldAwards`, `AwardsYear`, `GoalOfSeasonCandidate`, `SeasonGoals` |
| `src/Domain/awards/awardsConfig.ts` | Constantes (`AWARDS`), `tierFactor` |
| `src/Domain/awards/leagueAwards.ts` (+ teste) | Candidatos, `computeLeagueAwards`, `pickTeamOfSeason`, `managerAwardScore` |
| `src/Domain/awards/goalOfSeason.ts` (+ teste) | `goalGeometry`, `sanitizeRecordedGoals`, `isGoalCandidate`, `pickGoalOfSeason`, `appendGoals`, `goalCandidatesOfMatch` |
| `src/Domain/awards/worldAwards.ts` (+ teste) | `computeWorldAwards` |
| `src/Domain/awards/awardEffects.ts` (+ teste) | `withAwardsOnRows`, `applyAwardBoost`, `clearAwardBoost`, `addManagerAward`, `awardKindsByPlayer` |
| `src/Domain/awards/awardValue.ts` (+ teste) | `awardValueMult`, `playerValueModel` (o `Player` com o bônus) |
| `src/Domain/awards/awardMessages.ts` | Inbox `awards` (`buildAwardsMessage`) |
| `src/backend/dal/*`, `SaveService.ts` | `saves/{id}/awards/{ano}.json`, `saves/{id}/seasonGoals/{liga}-{ano}.json` (bufferizados, fase 1 do `flush`) |
| `src/backend/awardsWorld.ts` | E/S: `recordSeasonGoals` (dia), `recordLeagueAwards` (virada), `runWorldCeremony` (janeiro) |
| `src/backend/awardsRoutes.ts` | `GET /api/saves/:id/awards` |
| `src/backend/advanceDay.ts`, `managerWorld.ts` | Ganchos; `ManagerTitle.on` (data do crédito) |
| `src/GameInterface/Awards/*` | `AwardBadge`, `AwardsView` (aba), `PlayerAwards` (ficha), `AwardsInboxBody`, `awardsText`, `awardsApi` |
| `StatsScreen.tsx`, `PlayerScreen.tsx`, `CareerTable.tsx`, `ManagerRanking.tsx`, `Scout/ScoutFilters.tsx` | Telas |
| `scripts/market-sim.ts --awards` | Medição do mercado (abaixo) |

## Prêmios da liga (`computeLeagueAwards`)

Sobre as linhas novas da virada (`closeSeasonForPlayers`) dos elencos da liga; idade na temporada = idade − 1 (o
elenco já envelheceu); números de liga = total − copa − continental; a nota é o `avgRating` da linha (todas as
competições no clube).

| Prêmio | Critério |
|---|---|
| Melhor jogador | Maior nota entre os elegíveis (jogos de liga ≥ ⌈rodadas × 0,5⌉ e nota > 0); desempate gols + assistências, id |
| Revelação | Mesma regra, idade ≤ 21 |
| Artilheiro | Mais gols de liga (sem mínimo); desempate menos jogos, maior nota, id; zero gols = sem prêmio |
| Melhor goleiro | Linha GK, maior nota entre os elegíveis |
| Seleção | Vagas `GK LB CB CB RB CM CM CAM LW ST RW`; por linha (1/4/3/3) os elegíveis de maior nota, cada um na vaga de melhor aptidão; linha sem elegíveis suficientes completa com quem tem ≥ 1 jogo de liga (o "complemento") |
| Melhor técnico | `(meta − posição) / tamanho + 0,3 campeão + 0,15 acesso`; o técnico no cargo antes das demissões da virada; interino contratado depois do meio da janela não vale. Meta: diretoria (clube do jogador), `targetsOf` do `aiDesk` (IA); **sem `aiDesk` a meta é ⌈n/2⌉** |
| Gol da temporada | Sorteio (`goal:{save}:{liga}:{temporada}`) entre cabeçadas (peso 1) e chutes de fora da área (peso `1 + (dist − 18)/10`, até 3), nunca pênalti; só nas ligas do motor |

Lista curta para os mundiais: 5 jogadores por `seasonScore = nota + 0,03 × gols + 0,02 × assistências + títulos (liga
0,15 · copa 0,10 · continental 0,30)` e 3 técnicos. `weight = countryWeight × TIER_FACTOR[nível]` (1 / 0,6 / 0,4).

**Gravação (`recordLeagueAwards`):** limpa o `awardBoost` de todo jogador da liga, calcula, grava os prêmios nas linhas
(+ bônus de valor; no clube do jogador, `afterAward`), troca a entrada da liga+temporada em `awards/{ano de fechamento}.json`
(idempotente), apaga os `seasonGoals` da liga de anos anteriores, credita o técnico (`addManagerAward`, sem repetir) e,
na liga do jogador, enfileira a mensagem `awards`/`league` (gravada depois do `clearInbox`). O nome do adversário do
gol da temporada (`opponentName`) é gravado na hora.

**Candidatos a gol (`recordSeasonGoals`, todo dia):** gols de liga com `MatchEvent.goals` (só o motor), cabeçada ou de
fora da área, sem pênalti, em `seasonGoals/{liga}-{ano}.json`; `key = fixtureId:minute:playerId` não duplica num dia
refeito. Partida ao vivo: `sanitizeRecordedGoals` descarta a lista se não bater com o placar.

## Mundiais (`runWorldCeremony`)

Num dia de janeiro, se `awards/{ano − 1}.json` tem ligas e ainda não tem `world` (o marcador):
- **Jogador:** `worldScore = weight × (seasonScore − 5)` somado entre as listas curtas; desempate maior `seasonScore`, id.
- **Técnico:** `Σ weight × nota da lista curta + pontos de títulos com `on` no ano ÷ 200`; desempate pontos, id.
- Grava `world = { year, on, player: top 3, manager: top 3 }`; o vencedor ganha `world_player` (`year`) na linha da
  temporada da lista curta (procurado pelo clube da lista, depois todos os elencos, livres e aposentados), o bônus de
  valor 1,15 e a moral; o técnico `world_manager`. Mensagem `awards`/`world` sempre.
- **Jogador livre vencedor:** o prêmio fica só no histórico (sem `awardBoost`: livre não tem valor de mercado).

## Efeitos

- **Valor (`RosterPlayer.awardBoost`):** melhor jogador / mundial ×1,15; artilheiro, revelação, goleiro ×1,12; seleção
  ×1,10 (o maior vale). Até a próxima virada da liga dele; `toFreeAgent` apaga. `Player(rating, idade, valueMult)`;
  todo valor sobre um `RosterPlayer` passa por `playerValueModel`. O motor não lê valor.
- **Clubes grandes:** `scoreImprovement` + `IMPROVEMENT_BONUS` (0,08) para premiado; proposta de clube maior pelo
  jogador do humano com chance × `BIG_CLUB_BID_MULT` (2) quando há premiado livre, e o alvo é ele.
- **Moral (clube do jogador):** `afterAward` pelo `withEventDelta`: melhor jogador / mundial +10, revelação /
  artilheiro / goleiro +8, seleção +5, gol +4 (o maior prêmio da virada).

## Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/awards?year=YYYY` | Dono do save. `{ years, year, leagues, world }`; sem `year` = o mais recente; `year` inválido → 400; ano sem arquivo → 404 |
| `GET /api/saves/:id/managers` | Itens com `awards` (lista vazia sem prêmio) |
| `POST /api/saves/:id/scout-search` | Filtro `onlyAwarded`; linha com `awarded` (prêmio é público: vale com qualquer conhecimento) |

## Telas

- **Estatísticas → Prêmios** (`?tab=awards`): seletores "ANO" e "LIGA" (o de competições, só com as ligas do ano);
  cartão dos mundiais do ano (ou "saem em janeiro"); por liga, cartões dos prêmios individuais, a seleção em tabela
  (`StatsTable`), o técnico (posição × meta) e o gol da temporada. Linhas e cartões do clube do jogador destacados.
- **Ficha:** bloco "Prêmios" com até 6 selos (mais recentes) e "+N"; **CareerTable:** selos só ícone (16px, `title`)
  na coluna Títulos.
- **Ranking de técnicos:** coluna "Prêmios" (contagem) e os selos ao abrir o técnico.
- **Olheiro:** chip "Só premiados".
- **Inbox `awards`** (tópico `competitions`): `league` (premiados da liga do jogador, os dele em destaque, a seleção por
  setor, técnico, gol) e `world` (os 3 primeiros de cada prêmio). Assuntos `inbox.awards.*`.
- i18n `awards.*`, `statsScreen.awards.*`, `statsScreen.managers.awards`, `inbox.awards.*`, `scout.filters.awardedOnly`.

## Testes e smoke

```
bun test src/Domain/awards src/backend/awards.goals.test.ts src/backend/awards.rollover.test.ts \
  src/backend/awards.world.test.ts src/backend/awards.routes.test.ts src/backend/managers.routes.test.ts \
  src/Domain/scout src/backend/scoutSearch.test.ts src/GameInterface/Awards
```

`scripts/season-rollover-smoke.ts`, seção "Prêmios": cada liga virada tem a entrada; XI de 11 únicos nas vagas do
4-3-3 (o complemento abaixo do mínimo é só contado); mínimos de jogos de liga do melhor jogador, revelação e goleiro;
revelação ≤ 21; goleiro da linha GK; artilheiro = máximo de gols de liga; gol da temporada só nas ligas do motor (e
presente quando houve candidato); prêmio na linha e `awardBoost` de cada premiado; moral subiu no premiado do clube
do jogador; técnico com o registro; mensagem da liga do jogador na inbox. Mundial: `awards.world.test.ts`.

## Medição do mercado (`bun scripts/market-sim.ts 3 [--awards]`, semente 12345)

`--awards` sorteia os premiados de cada liga sintética no fim da temporada pela regra de linhas sobre a nota do
jogador + ruído N(0; 0,3) (com um `rng` próprio, para não mexer no sorteio do mercado) e aplica `awardBoost`.

| Métrica | sem prêmios | com prêmios |
|---|---|---|
| Transferências IA × IA com taxa (por temporada) | 846 / 1268 / 856 (2970) | 846 / 1260 / 821 (2927, −1,4%) |
| `open` 3 temporadas: LOW / MEDIUM / HIGH / ELITE | 92,0 / 91,0 / 97,1 / 99,9% | 92,3 / 92,6 / 98,1 / 99,7% |
| Elenco médio | 27,0 / 25,1 / 24,4 | 27,0 / 25,1 / 24,4 |
| Premiados por temporada (vendidos) | — | 635 (0) / 646 (2) / 659 (2) |

Dentro do aceite (±5%, ≥ 90% `open`, elenco igual). O MEDIUM já fica abaixo de 90% em temporadas isoladas sem prêmios
(88,6 / 88,4%): deriva anterior a esta etapa, não dos prêmios. `IMPROVEMENT_BONUS` não foi ajustado.

## Desvios do plano

- `market-sim --awards` usa um `rng` próprio (o do mercado ficaria deslocado e a comparação sem/com perderia o sentido).
- O teste da cerimônia (`awards.world.test.ts`) chama `runWorldCeremony` direto, sem avançar o dia inteiro.
- A idempotência da virada é testada chamando `recordLeagueAwards` de novo sobre o mesmo estado.
- Sem `aiDesk` (testes, scripts) a meta da IA para o melhor técnico é ⌈n/2⌉.
- Prêmio mundial de jogador livre só no histórico (sem bônus de valor).
- O nome do adversário do gol da temporada (`opponentName`) é gravado na entrada (a spec só guardava o id).
- O filtro do olheiro é testado nas funções puras (`filterScoutPlayers`, `toDisplayPlayer`, `parseScoutQuery`), não
  com uma busca sobre um save.

## Limitações

- **Nota de liga:** a nota é a média da temporada inteira no clube (o `seasonLog` não separa); o mínimo de jogos conta
  só a liga.
- **Transferência dentro da mesma liga:** só a linha do clube na virada conta; os jogos divididos em duas linhas podem
  não alcançar o mínimo.
- **Gol da temporada:** liga seguida só por parte da temporada sorteia entre os gols do período seguido; a lista da
  partida ao vivo vem do cliente e só é validada por consistência.
- **Mundial e ano civil:** uma liga de ano civil que virasse depois de 31/12 entraria no ano seguinte (não acontece hoje).
- **Repetição de um dia que falhou (fase 1 do `flush` não atômica):** como o histórico e o extrato, a moral do premiado
  pode ser aplicada duas vezes se só o elenco tiver sido gravado; o arquivo de prêmios, as linhas e os registros dos
  técnicos são idempotentes.
