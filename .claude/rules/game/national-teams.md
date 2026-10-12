# Seleções nacionais (IA), calendário FIFA, convocação e torneios

Spec: `docs/superpowers/specs/2026-10-11-national-teams-design.md`. Etapa 41a do `docs/ROADMAP.md`, versão **4.21**.
A 41b (o técnico do jogador numa seleção) usa os mesmos dados. Visual: `.claude/rules/ui-standard.md`.

## Regra

- Toda nação com pelo menos um jogador nos elencos do mundo no começo da carreira tem seleção: 173 no mundo 2026/27
  (UEFA 54, CAF 50, AFC 29, CONCACAF 25, CONMEBOL 10, OFC 5). Nação = nacionalidade normalizada (`normalizeNation`,
  `NATION_CONFED`). A lista é fixa na carreira; id `nat_<countryKey>`.
- Jogos de seleção **sempre no quickSim**, 4-3-3, XI automático (fôlego e lesão). Grupos e mata-mata de torneio em
  campo neutro; eliminatórias e amistosos com mando. Cartões ignorados (sem suspensão de seleção).
- **As ligas param**: datas FIFA para todos; Copa do Mundo para todos; Eurocopa para os países da UEFA; Copa América
  para CONMEBOL e CONCACAF (`blockedDays` / `countryBlockedDays`). A geração dos calendários de liga (criação e
  virada), das copas, das continentais, da base e a remarcação evitam esses dias.
- Sem migração (protótipo): save sem `national/` não tem seleções (o dia não faz nada).
- `/test`, `/lab`: **sem efeito de partida** (quickSim, nenhuma mecânica do motor muda).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/nationalTypes.ts` | `NationalTeam`, `NationalCallUp`, `NationalState`, `NationalCompetition`, `NationalLeader`, `NationalTournamentAwards`, `NationalCareer`, `NationalDuty`, `NationalSeasonLog` |
| `src/Domain/national/fifaCalendar.ts` (+ teste) | Janelas (`fifaWindows`), torneios (`TOURNAMENTS`, `tournamentDates`, `tournamentsOfYear`), vagas (`WC_SLOTS`, `EURO_SLOTS`), datas de eliminatória e sorteio, `blockedDays` / `countryBlockedDays` |
| `src/Domain/national/elo.ts` (+ teste) | Ranking SUM da FIFA: `eloAfterMatch`, `importanceOf`, `initialPoints`, `rankTeams` |
| `src/Domain/national/competitions.ts` (+ teste) | Potes (`drawPots`), eliminatórias (`buildQualifier`, `qualifierQualified`), torneios (`buildTournament`, `knockoutPairs`, `advanceTournament`, `tournamentPlacement`), amistosos (`pairFriendlies`) |
| `src/Domain/national/nationalSquad.ts` (+ teste) | Convocação (`callableCandidates`, `pickCallUp`, `missingByLine`), gerados (`nationalFillers`, `fillerLevel`), XI (`nationalLineup`), nível (`squadLevel`) |
| `src/Domain/national/nationalMatch.ts` | Pós-jogo (`applyNationalMatch`), dia de concentração (`nationalCampDay`), líderes, títulos e prêmios na carreira |
| `src/Domain/national/nationalAwards.ts` | Prêmios do torneio, lista curta para o mundial, multiplicador de valor, pontos de técnico |
| `src/Domain/season/generateCalendar.ts` | `placeRoundsAroundBlocks` (ligas com dias bloqueados) |
| `src/backend/nationalWorld.ts` | E/S: `createNationalWorld`, `ensureNationalWorld`, `playNationalDay` (sorteios, convocações, jogos, fim de competição, demissões e contratações) |
| `src/backend/nationalRoutes.ts` | Rotas (abaixo) |
| `src/backend/dal/*`, `SaveService.ts` | `national/state.json`, `national/comps/<slug>.json` (bufferizados) |
| `src/backend/advanceDay.ts` | O dia nacional depois dos jogos de clube e da base, antes do treino; convocados fora do treino (`skipPlayerIds`); inbox depois do `clearInbox`; `ensureNationalWorld` na rota `/presimulate` |
| `src/backend/startKits.ts` | Kits levam a pasta inteira; os técnicos voltam aos registros do save |
| `src/GameInterface/National/*`, `src/pages/national` | Tela Seleções, linha da ficha, selo do elenco, corpo da inbox |
| `scripts/national-calendar-measure.ts`, `scripts/national-sim.ts` | Medições M1, M2 |

## Calendário

| Janela | Âncora (1ª segunda em ou depois) | Existe |
|---|---|---|
| Março | 21/03 | todo ano |
| Junho | 01/06 | só em anos ímpares |
| Setembro | 31/08 | todo ano |
| Outubro | 05/10 | todo ano |
| Novembro | 09/11 | todo ano |

Convocação na segunda `M`, jogos em `M+3` e `M+7`, volta em `M+8`; clubes bloqueados de `M` a `M+9`.

| Torneio | Anos | Seleções | Formato | Datas |
|---|---|---|---|---|
| Copa do Mundo `wc_<ano>` | 2030, 2034… | 48 | 12×4; 32 no mata-mata (8 melhores terceiros) | grupos 12, 16, 20/06; 16-avos 25/06; oitavas 29/06; quartas 03/07; semi 07/07; final 12/07 |
| Eurocopa `euro_<ano>` | 2028, 2032… | 24 | 6×4; 16 no mata-mata (4 melhores terceiros) | grupos 12, 16, 20/06; oitavas 25/06; quartas 29/06; semi 03/07; final 08/07 |
| Copa América `copa_<ano>` | 2028, 2032… | 16 (10 CONMEBOL + 6 da CONCACAF pelo Elo) | 4×4; quartas | grupos 14, 18, 22/06; quartas 27/06; semi 01/07; final 06/07 |

- Convocação do torneio em 01/06; cada seleção volta no dia seguinte à eliminação. Mata-mata em jogo único com
  prorrogação e pênaltis; cruzamento fixo (`knockoutPairs`: 1ºs, 2ºs, 3ºs; semeado `i` × `K+1−i`, sem dois do mesmo
  grupo na primeira rodada; depois ordem de chave). Sem disputa de terceiro.
- **Eliminatórias** nas datas FIFA de 1/1 de `ano−2` a 31/12 de `ano−1` (a primeira Euro desde set/2026); sorteio em
  15/01 de `ano−2` (ou no início do mundo), do torneio em 01/12 de `ano−1`. Vagas da Copa: UEFA 16, CAF 10, AFC 9,
  CONMEBOL 6, CONCACAF 6, OFC 1; Euro: 24. `G = min(vagas, ⌊N/4⌋)` grupos (mais se o maior grupo não couber nas
  datas), turno e returno; os `G` primeiros + os melhores das posições seguintes (pontos/jogo, saldo/jogo, gols/jogo,
  Elo). `N ≤ vagas`: todos sem jogos. Vagas sem dono: melhores do Elo.
- **Amistosos** em toda data FIFA para quem não tem jogo oficial nela (sorteados na convocação): na confederação por
  Elo ± 150 de ruído, sem repetir o adversário da janela; sobras cruzam confederações.

## Elo (SUM da FIFA)

`P' = P + I (W − We)`, `We = 1/(10^(−ΔP/600)+1)`; pênaltis 0,75/0,5. `I`: amistoso 10, eliminatória 25, Euro/Copa
América 35 (quartas em diante 40), Copa do Mundo 50 (60). Derrota no mata-mata de torneio não tira pontos. Pontos
iniciais `1000 + 220 × (nível do XI − 3)` em 700..1900. Potes e convites pelo Elo; `prevRank` guarda o ranking no
começo de cada janela/torneio.

## Convocação e efeitos

- 23 dos jogadores de elenco (não base, não livres) da nação: fora quem estará lesionado no primeiro jogo e quem tem
  fôlego < 50; cotas GK 3, DEF 8, MID 7, FWD 5 pela nota na posição natural, depois os melhores. Faltando gente,
  **gerados** (`ngen_<nação>_<ano>_<linha>_<i>`): só da seleção, refeitos sob demanda pela especificação guardada na
  convocação (nível, nomes de doadores, quantidade por linha); nível = média dos convocáveis − 0,8 (com ≥ 3), senão a
  base da confederação (UEFA 3,4 · CONMEBOL 3,5 · CAF 3,0 · AFC 2,6 · CONCACAF 2,6 · OFC 2,1).
- `RosterPlayer.nationalDuty { nation, from, until }`: indisponível para o clube (`isUnavailable`), fora do treino e
  do descanso do clube; dia sem jogo = `nationalCampDay` (curva de descanso); volta: o campo sai e a inbox avisa.
- Pós-jogo (`applyNationalMatch`): `seasonLog.national` (fora dos totais), fôlego e carga de 90/120 min, lesão com a
  duração do clube dele, DP de crescimento (sem staff do clube), `RosterPlayer.national` (jogos, gols, assistências,
  títulos, prêmios; vai para o aposentado). Moral +3 na convocação (clube do jogador).
- Fim de torneio: prêmios (melhor jogador ≥ 3 jogos, artilheiro, goleiro, seleção do torneio por linha), título na
  carreira dos jogadores do campeão com jogo, valor (`awardBoost`: campeão ×1,12, vice ×1,08, semi ×1,05, melhor
  ×1,15, artilheiro/goleiro ×1,12, seleção ×1,10; até a próxima virada da liga do clube), `awards/<ano>.json →
  national` (o melhor do mundo de janeiro soma `peso × (score − 5)`: Copa 1,2, Euro 0,8, Copa América 0,7) e pontos
  ao técnico campeão (Copa 200, Euro 120, Copa América 100; `ManagerTitle.kind = "national"`).

## Técnicos

Registros comuns de `managers.json` com `squadId = nat_…` (fora do pool de livres, da revisão de segunda e das vagas
de clube; clubes nunca os roubam). `NationalTeam.managerId` é a fonte da vaga (a 41b troca para `player`). Ao fim de
uma eliminatória ou ao cair num torneio, `rolloverSackChance` (posição final × meta pelo Elo; não classificar com meta
de classificar = rebaixamento); interino + contratação 7–21 dias depois pelo `chooseHire` (prestígio = percentil do
Elo, só livres). Ranking de técnicos: a nação aparece como "clube".

## Rotas (`requireSaveOwner`; 404 sem seleções)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/national` | Ranking, competições, `homeTeam` (país da liga do clube), próxima data FIFA/torneio |
| `GET /api/saves/:id/national/competitions/:slug` | Grupos (`groupRows`), fases, jogos (com `stage`), artilharia, classificados, prêmios |
| `GET /api/saves/:id/national/teams/:teamId` | Seleção: ranking, técnico, convocação atual ou última (clube, nota, jogos e gols pela seleção), jogos, títulos |

## Telas

- Aba **Seleções** (`/national`) depois de Ligas: Ranking (chips de confederação), Competições (seletor, campeão,
  grupos, mata-mata, artilharia, prêmios, resultados), Seleção (seletor de nação; convocados com selo "Local" nos
  gerados, próximos jogos e recentes, títulos).
- Ficha: linha "Seleção" (bandeira, jogos, gols, títulos, "Na seleção até"); Elenco: selo "Seleção"; inbox
  `national` (`called_up`, `returned`, tópico `competitions`). i18n `national.*`.

## Medições (2026-10-11)

Ver a spec §14 e o relatório da etapa. M1 (`bun scripts/national-calendar-measure.ts`): todas as ligas cabem, nenhuma
rodada em dia bloqueado; liga de 20 clubes que cruza o ano: ~3–5 rodadas fora dos dias de jogo por temporada. M2
(`bun scripts/national-sim.ts 2030-07-20`): ciclo completo (Euro e Copa América 2028, eliminatórias e Copa 2030),
1,48–1,51 gol por jogo; topo do Elo Espanha, Inglaterra, Argentina, França, Alemanha (fundo: Ilhas Salomão, Somália);
16–29 técnicos de seleção demitidos em 4 anos (duas rodadas); ~1,1–1,3 s por dia nacional isolado. M3 (bench, PL):
dia de convocação +~1 s, dia de jogo de seleção +~0,2–0,4 s sobre um dia comum sem jogo de clube.

## Testes e smoke

```
bun test src/Domain/national src/Domain/season/generateCalendar.test.ts src/backend/national.advanceDay.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "Seleções": seleções e técnicos, jogos das janelas jogados, nenhum jogo de
clube em dia bloqueado do país, ninguém com convocação vencida, jogadores com jogos pela seleção, inbox.

## Limitações

- Sem Copa Africana, Copa da Ásia, Gold Cup nem Liga das Nações; sem repescagem intercontinental nem país-sede.
- Grupo de torneio todo no mesmo dia; o 4-3-3 sempre; cartões de seleção ignorados.
- Um jogador transferido no meio da janela volta pelo scan do mundo (raro); a convocação usa o clube da véspera.
- Gols por jogo de seleção (~1,5) abaixo do futebol real: o quickSim é o de clubes, sem calibração própria.
