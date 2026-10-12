# Seleções nacionais da IA, calendário FIFA, convocação e torneios (Etapa 41a, 4.21)

Data: 2026-10-11. Roadmap: linha 41 (dividida em 41a, esta, e 41b, o técnico do jogador numa seleção).
Decisões do usuário (fechadas): ver "Decisões" no fim. Regra viva: `.claude/rules/game/national-teams.md`.

## 1. Escopo

- Toda nação com pelo menos um jogador nos elencos do mundo no começo da carreira tem seleção (173 no mundo 2026/27:
  UEFA 54, CAF 50, AFC 29, CONCACAF 25, CONMEBOL 10, OFC 5). A lista é fixa na carreira.
- Jogos de seleção sempre no **quickSim** (41a). O técnico do jogador numa seleção é a 41b; os dados já ficam
  prontos (a vaga de técnico da seleção aponta para um registro de `managers.json`, que pode ser o `player`).
- **As ligas param** nas datas FIFA e nos torneios: a geração dos calendários de liga (criação e virada), das copas,
  das continentais, dos torneios de base e a remarcação evitam essas janelas. Os start kits são regenerados.

## 2. Calendário FIFA (`src/Domain/national/fifaCalendar.ts`, puro)

### Datas FIFA

Cinco por ano, cada uma começa numa segunda-feira `M` (a primeira segunda em ou depois de):

| Janela | Âncora | Existe |
|---|---|---|
| Março | 21/03 | todo ano |
| Junho | 01/06 | só em anos ímpares (nos pares há Euro + Copa América ou Copa do Mundo) |
| Setembro | 31/08 | todo ano |
| Outubro | 05/10 | todo ano |
| Novembro | 09/11 | todo ano |

- Convocação em `M`, jogos em `M+3` (quinta) e `M+7` (segunda), volta em `M+8`.
- **Bloqueio de clubes:** `M .. M+9` (10 dias, de segunda a quarta da semana seguinte) para todas as ligas do mundo,
  copas, continentais e base. A rodada do fim de semana anterior e a quinta seguinte continuam livres.
- Exemplo: 2026 — 31/08, 05/10, 09/11; 2027 — 22/03, 07/06, 06/09, 11/10, 15/11; 2028 — 27/03, 04/09, 09/10, 13/11.

### Torneios

| Torneio | Anos | Seleções | Formato | Datas (a partir de `S`) | Bloqueia |
|---|---|---|---|---|---|
| Copa do Mundo (`wc_<ano>`) | 2030, 2034… | 48 | 12 grupos de 4; 32 no mata-mata (12 primeiros, 12 segundos, 8 melhores terceiros): 16-avos, oitavas, quartas, semi, final | `S` = 12/06: grupos `S`, `S+4`, `S+8`; 16-avos `S+13`; oitavas `S+17`; quartas `S+21`; semi `S+25`; final `S+30` | todas as ligas de 01/06 à final |
| Eurocopa (`euro_<ano>`) | 2028, 2032… | 24 | 6 grupos de 4; 16 no mata-mata (6+6+4 melhores terceiros): oitavas, quartas, semi, final | `S` = 12/06: `S`, `S+4`, `S+8`; `S+13`; `S+17`; `S+21`; final `S+26` | ligas de países da UEFA de 01/06 à final |
| Copa América (`copa_<ano>`) | 2028, 2032… | 16 (10 CONMEBOL + 6 convidados da CONCACAF pelo Elo) | 4 grupos de 4; 8 no mata-mata: quartas, semi, final | `S` = 14/06: `S`, `S+4`, `S+8`; `S+13`; `S+17`; final `S+22` | ligas de países da CONMEBOL de 01/06 à final |

- Convocação em 01/06; cada seleção volta no dia seguinte ao último jogo dela.
- Mata-mata em jogo único, campo neutro, prorrogação e pênaltis (`knockout` do quickSim). Os grupos também são em
  campo neutro. Sem disputa de terceiro lugar.
- O cruzamento do mata-mata é fixo: os classificados são ordenados (1ºs pela campanha, depois 2ºs, depois 3ºs; dentro
  de cada classe pontos, saldo, gols, Elo), o semeado `i` pega o `K+1−i` (troca com o vizinho para evitar dois do
  mesmo grupo), e a partir daí vencedor do jogo `2j−1` × vencedor do `2j`.
- A AFC, a CAF e a OFC não têm torneio continental nesta etapa (só eliminatórias e a Copa do Mundo).

### Eliminatórias

- Nas datas FIFA dos dois anos antes do torneio (1º de janeiro de `ano−2` a 31 de dezembro de `ano−1`; a primeira
  Euro, 2028, começa em setembro de 2026, com o mundo). Sorteio em 15/01 de `ano−2` (ou na criação da carreira, se ela
  for depois). Sorteio do torneio em 01/12 de `ano−1`.
- Vagas da Copa do Mundo (48): UEFA 16, CAF 10, AFC 9, CONMEBOL 6, CONCACAF 6, OFC 1. Eurocopa: UEFA 24. A Copa
  América não tem eliminatória.
- Formato simplificado: `G = min(vagas, ⌊N/4⌋)` grupos (pelo menos 1), potes pelo Elo (pote `k` = ranks `kG..kG+G−1`,
  um de cada pote por grupo, sorteio com semente), turno e returno, uma rodada por data FIFA a partir da primeira data
  do ciclo (grupo ímpar tem folga). Classificam os `G` primeiros + as vagas que sobram para os melhores das posições
  seguintes (2ºs antes dos 3ºs; pontos por jogo, saldo por jogo, gols por jogo, Elo). Confederação com `N ≤ vagas`:
  todos classificados sem eliminatória; vagas sem dono vão para os melhores do Elo mundial ainda fora.
- Com 16 datas (Euro 2028) e 18 (demais ciclos) cabem grupos de até 8.

### Amistosos

- Em cada data FIFA, as seleções sem jogo oficial nela jogam amistoso, sorteado no dia da convocação: dentro da
  confederação por proximidade de Elo (Elo + ruído de ±150, pares consecutivos, sem repetir o adversário da outra data
  da janela); as que sobram cruzam confederações; um ímpar fica sem jogo. Mando sorteado. Arquivo `friendly_<ano>`.

## 3. Ranking por Elo (modelo SUM da FIFA, `elo.ts`)

`P' = P + I × (W − We)`, `We = 1 / (10^(−(P−Pa)/600) + 1)`. `W`: vitória 1, empate 0,5, derrota 0; disputa de
pênaltis: vencedor 0,75, perdedor 0,5. `I`: amistoso 10; eliminatória 25; Euro/Copa América até as oitavas 35, das
quartas em diante 40; Copa do Mundo até as oitavas 50, das quartas em diante 60. Derrota no mata-mata de um torneio
final não tira pontos (`max(0, …)`). Pontos iniciais: `1000 + 220 × (nível − 3)` limitado a 700..1900, com `nível` =
média do overall do XI (4-3-3) dos 23 convocáveis na criação da carreira. O ranking é a ordem dos pontos (desempate
nome); `prevRank` guarda a posição no começo da janela anterior (seta na tela).

## 4. Convocação

- **Quem:** jogadores dos elencos (não base, não livres) com a nacionalidade (normalizada) da seleção.
- **Fora:** lesionados com volta depois do primeiro jogo da seleção na janela, fôlego < 50.
- **23:** cotas por linha GK 3, DEF 8, MID 7, FWD 5 pela nota na posição natural (`slotValue`); faltando na linha, os
  melhores restantes; faltando gente, **jogadores gerados**.
- **Gerados** (`fillers.ts`): só da seleção, nunca no mundo nem no mercado; determinísticos por
  `<save>:<nação>:<ano>:<linha>:<i>` (id `ngen_<nação>_<ano>_<linha>_<i>`), refeitos sob demanda, nada gravado além do
  id na convocação. Nível = média dos convocáveis reais − 0,8 (com pelo menos 3 reais), senão a base da confederação
  (UEFA 3,4 · CONMEBOL 3,5 · CAF 3,0 · AFC 2,6 · CONCACAF 2,6 · OFC 2,1), com ruído σ 0,35, entre 1,5 e 6; idade 21–32;
  nomes da própria seleção (doadores reais) ou do livro de nomes do país (`staffNameBook`).
- **No período:** `RosterPlayer.nationalDuty = { nation, from, until }` — indisponível para o clube
  (`isUnavailable`), não treina nem descansa no clube; nos dias sem jogo recupera pela curva de descanso; nos dias de
  jogo, pós-jogo de seleção. Na volta, o campo sai.
- **Escalação do jogo:** XI automático (fôlego e lesão) do 4-3-3 entre os 23 disponíveis no dia.

## 5. Efeitos nos jogadores (`nationalMatch.ts`)

| Efeito | Regra |
|---|---|
| Fôlego e carga | Partida de 90 min (`applyMatchFitness`); 120 com prorrogação |
| Lesão | As do quickSim, com a duração do clube dele (médico e fisioterapia); inbox do clube do jogador |
| Evolução | DP de partida, só crescimento (`personalDpMult`, sem staff do clube), como a base |
| Moral (clube do jogador) | Convocado +3 (`withEventDelta`) uma vez por convocação |
| Temporada | `seasonLog.national { appearances, goals, assists, ratingSum }` — fora dos totais (como `youthCup`) |
| Carreira | `RosterPlayer.national { nation, caps, goals, assists, titles[], awards[] }` — permanente; vai para o aposentado |
| Cartões | Ignorados (sem suspensão de seleção nesta etapa) |
| Valor | No fim de um torneio: campeão ×1,12, vice ×1,08, semifinalista ×1,05; melhor jogador ×1,15, artilheiro e goleiro ×1,12, seleção do torneio ×1,10 (o maior vale), no `awardBoost` (até a próxima virada da liga do clube dele) |

## 6. Prêmios dos torneios

Ao fim de Copa do Mundo, Euro e Copa América: melhor jogador (maior nota média com ≥ 3 jogos; desempate gols +
assistências, id), artilheiro (gols; desempate menos jogos, nota), melhor goleiro (GK, ≥ 3 jogos), seleção do torneio
(XI 4-3-3, `pickTeamOfSeason`). Só jogadores reais. Gravados na competição e em `awards/<ano>.json` →
`national[]` com uma lista curta (5 por `nota + 0,03 × gols + 0,02 × assistências + 0,3 campeão`). A cerimônia mundial
de janeiro soma `peso × (score − 5)` dessas listas às das ligas (peso: Copa do Mundo 1,2, Euro 0,8, Copa América 0,7).

## 7. Técnicos de seleção

- **Onde:** em `managers.json`, como registros comuns com `squadId = "nat_<chave da nação>"`. Justificativa: o mesmo
  pool, o mesmo ranking, as mesmas funções de demissão/contratação (`sackManager`, `hireManager`, `chooseHire`), e o
  `squadId` com prefixo próprio isola a seleção das regras de clube sem mexer nelas (não entra no pool de livres, nem
  nas vagas de clube, nem na revisão de segunda). A seleção guarda `managerId` no estado (`NationalTeam.managerId`): a
  41b só troca esse id para `player` (que mantém o clube).
- **Criação:** um técnico por seleção, nome do livro de nomes do país (`coach_nat_<chave>`).
- **Demissão:** quando a seleção termina uma eliminatória ou cai num torneio, `rolloverSackChance` com posição =
  colocação final (grupo na eliminatória, fase no torneio: 1 campeão, 2 vice, 3–4 semi, 5–8 quartas…) e meta = posição
  pelo Elo entre os participantes; não classificar com meta de classificação conta como rebaixamento (0,6).
  Sorteio `seedFrom(save:nat:competição:sack)`.
- **Contratação:** interino na hora; contrata 7–21 dias depois (`vacancyHireOn`) pelo `chooseHire` com
  `prestígio = percentil do Elo`, só entre os livres (sem roubar técnico de clube); clubes nunca roubam técnico de
  seleção.
- **Pontos:** título — Copa do Mundo 200, Euro 120, Copa América 100 (`ManagerTitle.kind = "national"`).

## 8. Dados e arquivos

```
saves/{id}/national/state.json           NationalState  (seleções, Elo, técnicos, convocações, sorteios feitos)
saves/{id}/national/comps/{slug}.json    NationalCompetition (grupos, fases, jogos, líderes, prêmios)
```

Bufferizados (fase 1 do `flush`). Os start kits levam a pasta inteira. Sem migração: save sem a pasta não tem
seleções (o avanço do dia não faz nada).

```ts
NationalTeam { key, nation, confed, elo, prevRank?, managerId, games }
NationalCallUp { nation, competition?, from, until, players: { id, squadId, generated? }[] }
NationalState { teams: Record<nation, NationalTeam>, callUps: Record<nation, NationalCallUp>, competitions: string[],
                draws: string[], vacancies: Record<nation, { since, hireOn }> }
NationalCompetition { slug, kind: "qualifier" | "tournament" | "friendlies", tournament?: "wc" | "euro" | "copa",
  year, confed?, teams, groups, stages: { name, dates, drawn }[], fixtures: Fixture[], slots?, qualified?,
  championId?, status, leaders, awards? }
```

## 9. O dia (`playNationalDay`, `src/backend/nationalWorld.ts`)

Antes do treino, depois dos jogos de clube e da base:
1. Sorteios devidos (eliminatórias em 15/01, torneio em 01/12, criação na primeira vez).
2. Início de janela/torneio: amistosos da janela; convocação de toda seleção com jogo no período; `nationalDuty`;
   inbox `national` / `called_up` do clube do jogador.
3. Jogos do dia: quickSim, Elo, tabela, líderes, pós-jogo nos jogadores reais; mata-mata sorteado/avançado; fim do
   torneio (campeão, prêmios, valor, títulos, técnico); fim de eliminatória (classificados, demissões).
4. Convocados sem jogo no dia: descanso.
5. Volta (`until` passado): `nationalDuty` sai, inbox `returned` com jogos, gols e lesões.
6. Vagas de técnico: contratações devidas.

Os convocados entram em `skipPlayerIds` do treino. Custo: só dias de janela/torneio fazem algo além de ler o estado.

## 10. Calendário das ligas com bloqueios (`generateLeagueCalendar`)

- `generateLeagueCalendar(config, teams, year, { blocked })`: sem bloqueio, o algoritmo de sempre (resultado
  idêntico). Com bloqueio, as `R` rodadas são distribuídas pelos **dias livres** da janela da liga (o alvo da rodada
  `r` é o dia livre de índice `(r−1)(L−1)/(R−1)`, mais o deslocamento da liga), cada uma vai para o dia de jogo da liga
  mais próximo (±3) fora do bloqueio e a pelo menos 3 dias da rodada anterior; sem dia de jogo, o meio de semana
  (terça a quinta) mais próximo. O passe final mantém tudo dentro de `[início, fim]` e fora do bloqueio.
- `blocked` vem de `leagueBlockedDays(país, início, fim)`: datas FIFA (todos) + torneios da confederação do país (Copa
  do Mundo para todos).
- Copas (`busyDates`), continentais (datas ocupadas de cada país), base (`busyByClub`) e a remarcação
  (`findFreeDate`) somam os dias bloqueados do país.

## 11. Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/national` | Ranking (posição, seta, nação, confederação, pontos, técnico), competições (atuais e encerradas), janela atual e próxima |
| `GET /api/saves/:id/national/competitions/:slug` | Competição com tabelas de grupo, mata-mata, jogos, líderes, prêmios; 404 sem ela |
| `GET /api/saves/:id/national/teams/:nation` | Seleção: pontos, posição, técnico, convocação atual (ou a última), jogos recentes e próximos, títulos |

Dono do save; 404 sem seleções.

## 12. Telas

- **Aba nova "Seleções"** (`/national`) na barra superior, depois de Ligas. Justificativa: as seleções não pertencem
  a uma liga (a tela Ligas é guiada pelo seletor de liga e as abas dela são da liga escolhida), têm três vistas
  próprias e serão o segundo emprego do técnico na 41b. A barra encolhe as abas sozinha (`useCompactTabs`).
  - Título "SELEÇÕES **NACIONAIS**" / "NATIONAL **TEAMS**". `SegmentedTabs`: Ranking · Competições · Seleção.
  - Ranking: tabela padrão (#, seta, bandeira + nação, confederação, técnico, pontos destacados), chips de
    confederação (Mundo, UEFA, CONMEBOL, CONCACAF, CAF, AFC, OFC).
  - Competições: seletor (atuais primeiro), faixa do campeão, grupos (tabela por grupo, classificados marcados),
    mata-mata por fase, jogos por data, artilharia, prêmios.
  - Seleção: seletor de nação (padrão: país da liga do clube do jogador), pontos e posição, técnico (rosto),
    convocados (posição, jogador, clube, nota, jogos e gols pela seleção, selo "Local" nos gerados), jogos recentes e
    próximos, títulos.
- **Ficha do jogador:** linha "Seleção" (bandeira, nação, jogos, gols, títulos) e selo "Convocado até dd/mm".
- **Elenco:** selo "Seleção" no jogador convocado.
- **Inbox `national`** (tópico `competitions`): `called_up` (convocados do clube e as datas) e `returned` (jogos, gols,
  lesões).
- i18n `national.*` (en, pt-BR).

## 13. `/test`, `/lab`

Sem efeito de partida: os jogos de seleção são quickSim e nenhuma mecânica do motor muda. Nada a exibir.

## 14. Medições (a fazer na implementação, resultados no fim)

- M1: calendário das ligas com bloqueio — todas cabem; rodadas de meio de semana por tipo de liga; pares de jogos de
  clube a menos de 3 dias.
- M2: volume do mundo — o motor e o quickSim de clube não mudam (nenhuma linha deles muda); conferir gols/jogo do
  quickSim de seleção e a distribuição do Elo depois de 2 anos simulados (topo/fundo plausíveis).
- M3: custo do avanço do dia numa data FIFA (`bench-advance-day.ts`).

## Decisões (do usuário, fechadas)

Todas as nações com jogadores; gerados só da seleção; técnico de IA por seleção com a regra de clube; Elo SUM nos
potes; datas FIFA de março, junho, setembro, outubro e novembro; Euro e Copa América em 2028, 2032…; Copa do Mundo em
2030, 2034… com 48; eliminatórias nas datas dos dois anos antes; amistosos no resto; ligas, copas, continentais e base
param nas janelas; convocação da IA com 23 por nível respeitando lesão e fôlego; efeitos em fôlego, carga, lesão,
moral, histórico e valor; prêmios do torneio no melhor do mundo; tudo no quickSim; técnico humano de seleção é a 41b.

Decisões tomadas aqui (dentro do espaço aprovado): sem Copa Africana/Asiática/Gold Cup nesta etapa; junho só em anos
ímpares; Copa América com 6 convidados da CONCACAF; jogos de seleção sempre no 4-3-3; cartões de seleção ignorados.
