# Bolas paradas (motor) — escanteios, faltas diretas e barreira, faltas cruzadas, lateral, cobradores

Spec: `docs/superpowers/specs/2026-10-02-set-pieces-design.md`. Etapa 14, versão **3.0**. Depende das
Etapas 12 (`fouls.md`: tiro livre, pênalti) e 13 (`aerial.md`: bola alta, disputa aérea, cabeçada).
O posicionamento estático por formação (layouts de `SetPieceLayouts.ts`) continua em `set-pices.md`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/SetPieceConfig.ts` | Todas as constantes (`SET_PIECE_CONFIG`) |
| `src/GameEngine/Domain/SetPieces.ts` (+ teste) | Puro: `pickSetPieceTaker`/`setPieceTakerScore`, `isDirectFreeKick`, `directFreeKickXG`, `wallSize`, `wallSpots`, `wallBlockChance`, `attackingBoxPositions`, `defendingBoxPositions`, `evaluateBoxSetPiece` |
| `src/GameEngine/Domain/gameState.ts` (+ `SetPieces.engine.test.ts`) | `awardCorner` (exportado), `applyBoxSetPiece`, `applyDirectFreeKick`, `startDirectFreeKick` (exportado), `setPieceTakerOf`, fase de bola parada (`openSetPiecePhase`, `setPieceGoalOf`), fontes de escanteio, alcance do lateral (`startPass`), `restartHoldsPeriod` |
| `src/GameEngine/Domain/DecisionTree.ts` | `decideBoxSetPiece`: o cobrador de escanteio / falta cruzada cruza ou toca curto; o de falta direta chuta |
| `src/GameEngine/Infrastructure/ActionOutcomes.ts` | `resolveAerialDuel(..., bMult)`: vantagem do defensor na bola parada |
| `src/Domain/tactics/setPieceTakers.ts` (+ teste) | `parseSetPieceTakers` (PUT de `/api/saves/:id/tactics`) |
| `src/GameInterface/Components/SetPieceTakersPanel.tsx` | Os três seletores na tela de táticas (`FormationScreen`) |
| `src/Domain/advanceDay/quickSim.ts` | `rollSetPieces` (ver "quickSim") |
| `scripts/setpiece-calibrate.ts` | Calibração (ver abaixo) |

## Cobradores (§4)

- `TacticsSave.setPieceTakers?: { corners?, freeKicks?, penalties? }` (ids de jogador). Tela de táticas:
  um seletor por função, padrão **Automático**. A rota `PUT /api/saves/:id/tactics` aceita
  `setPieceTakers` (`null`/`""` = automático; chave desconhecida ou tipo errado → 400).
- Chega ao motor por `GameState.setPieceTakers` (`{ A?, B? }`, ids de elenco): `simulateMatch`
  (`TeamTactics.setPieceTakers`, vindo de `computeMatchSimulationLineups` só para o lado do jogador) e
  a partida ao vivo (`MatchScreen`, time A). **A IA nunca define cobradores.**
- `pickSetPieceTaker(duty, jogadoresEmCampo, escolhido?)`: o escolhido se estiver em campo; senão o
  melhor jogador de linha por `setPieceTakerScore` — escanteio = (passe + visão) / 2, falta e pênalti =
  finalização (`shootAccuracy`). Escolhido fora de campo (lesão, expulsão, banco) → automático.
- Usado no escanteio, na falta direta / cruzada e no pênalti. Falta rápida (fora da zona) continua
  com o jogador mais perto.

## Escanteio (§1)

- `awardCorner(estado, time, bandeira, ...)`: cobrador na bandeira, os dois times no layout de área
  (`applyBoxSetPiece`), congelamento `CORNER_COUNTDOWN` (1,2 s), `variant: 'box'`, evento
  `cornerAwarded { team, takerId, source }`, fase de bola parada aberta.
- **Ataque** (`attackingBoxPositions`): os dois defensores melhores no alto (`aerialAbility`), o
  centroavante e os próximos melhores cabeceadores até `BOX_ATTACKERS` (5) na área — o melhor na marca
  do pênalti, depois segundo pau, primeiro pau, centro, fora do segundo pau (com um sorteio de ±2 jardas
  por vaga, para a escolha da cobrança variar); um meia na entrada da área (o melhor finalizador, para a
  sobra); uma opção curta perto da bandeira; o resto e o goleiro atrás.
- **Defesa** (`defendingBoxPositions`): goleiro na linha; um marcador do lado do gol de cada atacante
  da área (os melhores no alto nos melhores); um no primeiro pau; um no meia da entrada da área; um na
  opção curta; o atacante mais rápido fica lá na frente (saída do contra-ataque); o resto zonal na área.
- **Cobrança** (`evaluateBoxSetPiece` → `decideBoxSetPiece`): primeiro pau, marca do pênalti, segundo pau
  (os mesmos alvos de `crossTargetPoints`) ou curto (passe ao companheiro mais perto). Nota de cada alvo:
  `CORNER_BASE + (atacantes − 0,8 × defensores) × 0,45 + entrega × 0,25 − 0,25 se o goleiro chega antes`,
  atacantes/defensores = soma de `aerialAbility` ponderada pela proximidade num raio de 6 jardas.
  Curto: `0,35 + 0,1 se livre + 0,3 com build_up posse − 0,15 com jogo direto`. Vence a maior nota.
- **Na bola:** o cruzamento sai por `startAerialBall` (bola alta `cross`, `fromSetPiece`,
  `setPieceVariant: 'box'` — as regras abaixo valem só com essa marca; uma falta rápida/longa que vira
  cruzamento segue as regras do jogo corrido). Até
  `SET_PIECE_CHASERS` (4) jogadores de cada time correm para o ponto **sem o filtro de papel** (os
  zagueiros que subiram atacam a bola). Na disputa aérea o defensor tem a pontuação × 
  `SET_PIECE_DEFENDER_DUEL_MULT` (7 — ele está posicionado, do lado do gol): o atacante ganha cerca de 1
  em 8 contra um marcador igual. A cabeçada de quem ganha ignora a pressão do resto da área
  (`SET_PIECE_HEADER_PRESSURE_MULT` 0 — ele já ganhou a disputa). Falta no alto na bola parada é do
  atacante em 80% (`SET_PIECE_ATTACKER_FOUL_SHARE`), então raramente vira pênalti.
- Sem impedimento no escanteio (ninguém fica à frente da bola na linha de fundo).

### Fontes de escanteio

| Fonte (`CornerSource`) | Regra | Por partida (Premier) |
|---|---|---|
| `cross_clearance` | Cruzamento cortado de cabeça dentro da área (ou a ≤ 9 jardas da linha): `CROSS_CLEAR_CORNER_CHANCE` 0,55 | 4,8 (inclui os que saem de outro escanteio) |
| `deflection` | Chute para fora com um defensor a ≤ 6 jardas do chutador: 0,6 | 1,2 |
| `save` | Defesa do goleiro espalmada: 0,5 | 0,5 |
| `cross_block` | Cruzamento bloqueado na saída a ≤ `CLEARANCE_CORNER_DEPTH` (9) jardas da linha: 0,5 | 0,17 |
| `loose` | Bola solta que passa da linha de fundo com um defensor de linha a ≤ 3 jardas (o goleiro deixando sair é tiro de meta): 0,6 | 0,02 |
| `tackle` | Desarme ganho a ≤ 18 jardas da linha, fora da largura do gol: 0,3 | 0,06 |

Antes da etapa havia ~0,1 escanteio por partida (só bloqueios e cortes perto da linha). Por partida
(Premier, 400 jogos): 6,9 escanteios, 0,95 falta cruzada, 0,25 falta direta, 2,5 laterais.

## Tiro livre (§2–3)

`awardFoulRestart` (`fouls.md`) agora tem três casos fora da área:

| Caso | Condição | O que acontece |
|---|---|---|
| **Direto** (`variant: 'direct'`) | `isDirectFreeKick`: a ≤ `DIRECT_FK_RANGE` (30) jardas do centro do gol, fora da área, ângulo aberto ≥ `DIRECT_FK_MIN_ANGLE` (0,3 rad, "central") | Layouts `freeKick_Attack/Defend`, barreira, congelamento 1,5 s; o cobrador **chuta** |
| **Cruzado** (`variant: 'box'`) | A ≤ `FK_CROSS_RANGE` (26) jardas da linha de fundo e não direto | Layout de área (atacantes na altura da linha da defesa, 1,5 jarda em condição, para não ficarem impedidos), congelamento 1 s; o cobrador cruza ou toca curto (mesma avaliação do escanteio, mas a contagem por alvo é feita na linha, num raio de 8 jardas, porque as duas linhas correm para a bola) |
| **Rápido** | Resto do campo | Como antes: jogador mais perto, 0,4 s, ninguém se mexe |

**Barreira:** `wallSize(distância, ângulo)` = 2..5 (mais perto e mais central = maior), em
`wallSpots` a `WALL_DISTANCE` (10) jardas na linha bola → centro do gol, 0,9 jarda entre eles. Os
homens da barreira são os defensores mais perto das vagas, fora os três melhores no alto (ficam na
área). `SetPiece.wallIds` guarda quem está nela (o overlay do `/test` desenha).

**Chute direto** (`startDirectFreeKick`): `xG = FK_XG_BASE (0,9) × fator de distância (1 até 18 jardas,
0,45 a 30) × fator de ângulo (ângulo / 0,42, entre 0,3 e 1)`. A barreira tira `wallBlockChance(n) =
n × WALL_BLOCK_FACTOR (0,06)`: com essa chance o chute bate na barreira e vira bola solta (rebote para
trás, `source: 'clearance'`, quem persegue é o vigia do #36); senão o chute voa com o xG cheio
(`ShotState.freeKick`). O evento `shot` sai com `xG × (1 − bloqueio)` e conta como chute nos dois casos;
`directFreeKick { xg, wallSize, blocked }`. Gol de falta direta: `goalScored.setPiece = 'direct_free_kick'`.

O `FK_XG_BASE` é alto de propósito: neste motor os chutes são poucos e valem muito (~0,64 de xG por
chute); com o valor "real" (~0,07) a falta direta quase nunca entraria.

## Lateral (§5)

Durante a contagem do lateral o cobrador só passa para companheiros a ≤ `THROW_IN_RANGE` (20)
jardas (`startPass`; sem ninguém nesse raio, o mais perto). Sem lateral longo.

## Regra das 10 jardas e substituições

- Na falta direta, na cruzada e no escanteio todo defensor fica a ≥ `MIN_DEFENDER_DISTANCE` (10)
  jardas da bola (`keepDistanceFromBall`, empurrado na direção bola → jogador); a barreira fica
  exatamente a 10.
- Durante o congelamento, a substituição do cobrador fica pendente até a bola ser jogada (senão a
  bola iria para o mais perto, fora do ponto); um jogador da barreira substituído é trocado pelo que
  entra no mesmo lugar (`wallIds`).

## Fim de período

`restartHoldsPeriod` segura o apito para um escanteio ainda com o cobrador e para uma falta direta ou
cruzada ainda com o cobrador (além do pênalti, do chute no ar e da bola alta de bola parada, como antes).

## Gol de bola parada

`GameState.setPiecePhase { team, kind, until }`: aberta por escanteio (`corner`), falta a ≤
`SET_PIECE_FK_ZONE` (40) jardas da linha (`free_kick`) e pênalti (`penalty`); dura a contagem +
`SET_PIECE_PHASE_SECONDS` (45 s de jogo); fecha quando o outro time fica com a bola (não durante uma
bola solta ou um corte de cabeça no ar), no pontapé inicial e no intervalo. Gol nesse período sai com
`goalScored.setPiece` (`corner` · `free_kick` · `direct_free_kick` · `penalty`).

## Eventos, estatísticas

- `EventBus`: `cornerAwarded`, `directFreeKick`, `setPieceScores` (opções da cobrança, só com debug);
  `goalScored.setPiece`. Debug: categoria `setPiece`.
- `Statistics.ts` (jogador e time): `corners` (creditado ao cobrador), `freeKicks` (faltas sofridas que
  viraram tiro livre, ao cobrador), `directFreeKickShots` (também em `shots`), `directFreeKickGoals`,
  `setPieceGoals` (também em `goals`). `MatchTeamStats` recebe os mesmos campos (opcionais).
- `/test`: cenários `corner-attack` e `direct-free-kick`; overlay **Set pieces** (barreira destacada e
  linha até o gol; nas bolas paradas de área, as opções com a zona e a melhor em dourado, linha até a
  opção curta); colunas CK, DFK (chutes (gols)), SPG no `StatsPanel`.
- `/lab`: `TeamRawStats` → `balanceWorker` (motor e quickSim, `addDayLogSetPieces`) →
  `PerMatchView`/`VariantSummary` (`avgCorners`, `avgFreeKicks`, `avgDirectFreeKickShots`,
  `avgDirectFreeKickGoals`, `avgSetPieceGoals`, `setPieceGoalPct`) → linhas no `PairDetail`.

## quickSim

`rollSetPieces` (depois de `rollAerial`, por último no sorteio): escanteios por Poisson
(`CORNERS_PER_SIDE`), tiros livres = faltas do adversário − pênaltis a favor, chutes de falta direta por
Poisson (`DIRECT_FK_SHOTS_PER_SIDE`, nunca menos que os gols). Dos gols sem pênalti já sorteados, uma
parte vira gol de bola parada (`SET_PIECE_GOAL_SHARE` 0,125 dos gols): desses, uma fração
`DIRECT_FK_GOAL_SHARE / SET_PIECE_GOAL_SHARE` é falta direta (vai para o melhor finalizador, sem
assistência; uma cabeçada escolhida deixa de ser cabeçada); os outros mantêm o autor se já eram de cabeça, senão vão para um defensor/atacante
ponderado por `SET_PIECE_LINE_WEIGHT × (0,5 + cabeceio/10)`. Gols de pênalti contam como bola parada.
O placar nunca muda. Os números de jogo aéreo e passes do quickSim foram reajustados à mesma
medição (`non-player-games.md` → "Bolas paradas no quickSim").

## Calibração (`bun scripts/setpiece-calibrate.ts [PL=200] [champ=150] [--seed n] [--out f] [--sum a,b] [--compare base]`)

Motor completo, 4-3-3 automático, fôlego 88, médias por partida somando os dois times. O motor não
tem semente: rodo 16 processos em paralelo com sementes de sorteio diferentes (`--seed`) e somo.
`SETPIECE_OVERRIDES` / `AERIAL_OVERRIDES` / `FOUL_OVERRIDES` trocam constantes em memória.

Antes = `main` da 2.8 (Premier 1600 jogos, Championship 1200); depois = configuração final (mesmo
tamanho):

| | Premier antes | depois | Championship antes | depois |
|---|---|---|---|---|
| Gols | 2,346 | 2,394 (+2,1%) | 1,688 | 1,728 (+2,3%) |
| Chutes | 5,647 | 5,607 (−0,7%) | 4,709 | 4,753 (+0,9%) |
| xG | 3,609 | 3,599 (−0,3%) | 3,022 | 3,062 (+1,3%) |
| Escanteios (alvo 6–10) | ~0,1 | 6,45 | ~0,03 | 6,03 |
| Tiros livres | — | 10,3 | — | 11,1 |
| Faltas diretas (chutes) | — | 0,27 | — | 0,24 |
| Gols de falta direta (alvo 2–5% dos gols) | — | 0,086 (3,6%) | — | 0,071 (4,1%) |
| Gols de bola parada (alvo 20–30%) | — | 0,489 (20,4%) | — | 0,478 (27,7%) |
| Gols de pênalti | 0,220 | 0,217 | 0,253 | 0,243 |
| Cruzamentos (inclui escanteios e faltas cruzadas) | 11,4 | 16,7 | 10,5 | 15,4 |
| Disputas aéreas (soma dos dois times) | ~21 | 29,8 | ~18 | 27,7 |
| Gols de cabeça | 0,23 (9,8%) | 0,43 (17,9%) | 0,23 (13%) | 0,37 (21,4%) |
| Passes | 53,8 | 48,9 (−9,0%) | 47,9 | 43,6 (−9,1%) |

Medição depois da revisão (regra das 10 jardas, bloqueio vira escanteio só perto da linha, regras de
bola parada só para a cobrança de área); antes da revisão: Premier +1,1% gols / +1,1% chutes,
Championship −4,0% / −1,6%.

Gols de cabeça por vaga de titular (Premier): DEF 0,027 ≈ FWD 0,026 (antes da etapa DEF ≈ 0) — os
zagueiros que sobem marcam.

**O que move gols e chutes:**
- O congelamento das bolas paradas come tempo de jogo corrido (o relógio corre): com 2 s por escanteio
  e 1,5 s por falta cruzada os gols caíam ~5%. Daí 1,2 s / 1 s.
- Toda bola parada de área vira chute de cabeça com frequência real (~0,3 por escanteio) e o motor tem
  4× menos chutes que o futebol real: sem a vantagem do defensor posicionado os chutes subiam +20%.
  A vantagem é multiplicativa (×7), não somada: somada, ela pesava mais nas ligas fracas (pontuações
  menores) e a Championship perdia gols demais.
- Faltas cruzadas até 40 jardas tiravam gols: o tiro livre perto da área antes podia chutar, dar
  bola em profundidade ou cruzar (opções de jogo corrido com xG alto); só cruzar ou tocar curto rende
  menos. Com 26 jardas, o resto volta a ser falta rápida.
- Os passes caem ~9%: menos tempo de jogo corrido e menos tiros de meta (defesas viram escanteio).

## Limitações

- O motor não tem semente: a Championship oscila ±3% entre rodadas de 600 jogos (rodadas da mesma
  configuração antes da revisão deram −1,1% e −4,0% em gols; a final, +2,3%).
- Disputas aéreas no limite do alvo do jogo aéreo (29,8 na Premier, alvo 15–30): cada escanteio é uma disputa.
- Escanteios da Championship no piso do alvo (6,0).
- Sem lateral longo, sem jogada ensaiada, sem barreira que pula ou se mexe; o layout da falta direta
  continua o fixo da formação (só a barreira é dinâmica).
- Escanteio curto é raro com `balanced` (a nota do curto só ganha com `possession`).
- A IA sempre usa cobradores automáticos.
