# Faltas, cartões e pênaltis (motor)

Spec: `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` (§1, §2, §3 parte em campo, §4, §6).
Etapa 12, parte 1 (motor). A parte fora de campo (suspensão, `seasonLog.yellowCards`, seletores,
inbox, quickSim) e a tela ao vivo (§5) são a parte 2: `.claude/rules/game/discipline.md`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/FoulConfig.ts` | Todas as constantes (`FOUL_CONFIG`) |
| `src/GameEngine/Domain/Fouls.ts` (+ teste) | Puro: `foulChance`, `cardRoll`, `isClearChance` |
| `src/GameEngine/Domain/gameState.ts` | `maybeFoul` (rola e executa), `bookPlayer` (cartão / expulsão), `awardFoulRestart` (tiro livre / pênalti), `resolveInMatchPenalty` |
| `src/GameEngine/Domain/Fouls.engine.test.ts` | Falta vira tiro livre, falta na área vira pênalti (gol e defesa), vermelho deixa 10, segundo amarelo, goleiro expulso |
| `src/GameEngine/Domain/DecisionTree.ts` | Cobrador de `free_kick` pode chutar ou dar bola em profundidade; nunca conduz |
| `scripts/fouls-calibrate.ts` | Calibração (ver abaixo) |

## Quando rola

Três lances resolvidos, sempre com a bola dominada (nunca com passe/chute no ar):

| `FoulKind` | Onde | Infrator → sofreu | Ângulo |
|---|---|---|---|
| `tackle` | desarme (`resolveTackle`) | desarmador → portador | real (`tackleAngleModifier`: frente/lado/trás) |
| `dribble` | 1v1 (`resolveDribble`) | defensor → driblador | `front` se o defensor ganhou; `behind` se foi batido (falta para parar a jogada) |
| `duel` | bola solta disputada (`resolveLooseBallDuel`) | sorteio 50/50 entre os dois | `side` |
| `aerial` | disputa aérea (`resolveAerialLanding`, `aerial.md`) | sorteio 50/50 entre os dois | `side` |

A falta **anula o lance**: o time que sofreu recomeça, mesmo que o desarme/drible/duelo tenha sido
ganho pelo infrator. O evento `tackle` sai com `success: false` quando houve falta; `dribble` sai com
`success: true`. Impedimento na bola solta é checado antes da falta.

## Chance de falta (`foulChance`)

```
chance = BASE[tipo] × ÂNGULO × agressividade × técnica × cansaço × amarelo × ganhou × área   (limite 0,9)

BASE        tackle 0,75 · dribble 0,55 · duel 0,40 · aerial 0,06
ÂNGULO      frente 0,7 · lado 1,0 · trás 1,8
agress.     1 + 1,0 × (TACKLE_AGGRESSION − 0,4)      low_block 0,85 · mid_block 1,0 · high_press 1,25
técnica     1 + 0,6 × (0,5 − tackling)               tackling = runtimeStats.withoutBall.tackling (0..1)
cansaço     1 + 0,6 × max(0, (70 − energia) / 70)
amarelo     0,15 se o infrator já tem amarelo
ganhou      0,15 se o lance foi ganho pelo infrator (desarme/drible vencido)
área        0,30 dentro da própria área (defensor se segura; falta ali é pênalti) — era 0,13 antes do jogo
            aéreo: os cruzamentos substituem muitas conduções para dentro da área e os pênaltis caíram à metade
```

`TACKLE_AGGRESSION` (estilo de marcação, `DefenseConfig`) só é usado aqui.

## Cartão (`cardRoll`)

Vermelho direto rolado primeiro, depois amarelo:

```
amarelo  = 0,17 × (trás 1,4) × (chance clara 1,8) × (já tem amarelo 1,15)      limite 0,85
vermelho = 0,0008 × (trás 2) × (chance clara 8) × (já tem amarelo 1,0)          limite 0,6
```

Chance clara (`isClearChance`): quem sofreu estava a até 35 jardas do gol e sem defensor de linha à
frente num corredor de ±8 jardas (o goleiro não conta). Segundo amarelo = vermelho (dois registros:
o amarelo e um vermelho com `secondYellow: true`).

**Expulsão:** `bookPlayer` remove o jogador sem substituto (`removeInjuredPlayer`, o mesmo caminho do
lesionado sem reserva) e chama `ensureCompetentGK` (goleiro expulso: o jogador de linha mais recuado
vira goleiro com o piso de atributos).

## Retomada

- **Tiro livre (`free_kick`)**, fora da área: no ponto da falta. Desde a Etapa 14
  (`set-pieces-play.md`): **falta direta** (a ≤ 30 jardas do gol e central) com barreira, chutada pelo
  cobrador de faltas; **falta cruzada** (a ≤ 26 jardas da linha de fundo) com os times no layout de
  área, cruzada ou tocada curta pelo cobrador de faltas; no resto do campo, cobrança rápida pelo
  jogador mais perto (congelamento de 0,4 s, ninguém se mexe; o cobrador não conduz e passa, chuta ou
  dá bola em profundidade). O cobrador de pênalti é o escolhido na tela de táticas ou o melhor
  finalizador em campo.
- **Pênalti (`penalty`)**, dentro da área: cobrador = maior `shootAccuracy` em campo do time que
  sofreu, na marca (12 jardas), goleiro na linha, os demais fora da área. Ao fim do congelamento de 2 s,
  `resolveInMatchPenalty` usa `penaltyChance` (o mesmo de `PenaltyShootout.ts`): gol → saída do
  adversário; defesa/fora → tiro de meta do goleiro. Conta como chute (`shot`, xG = chance) e gol normal
  (`goalScored`, sem assistência).
- **Cooldown de desarme:** toda retomada de falta (tiro livre ou pênalti) e todo tiro livre de
  impedimento aplicam `tackleCooldown = TACKLE_COOLDOWN`. O congelamento não drena o cooldown, então o
  cobrador nunca é desarmado (nem sofre outra falta) logo depois de cobrar.
- **Fim de período:** `restartHoldsPeriod` segura o apito (até 60 s de jogo depois do fim do período)
  enquanto há um pênalti pendente, um tiro livre perigoso ainda com o cobrador ou um chute no ar. Antes
  disso, um pênalti marcado nos últimos ~36 s de jogo era descartado no intervalo, no fim do jogo ou no
  fim da prorrogação.

## Eventos, estatísticas, nota

- `EventBus`: `foul`, `card`, `freeKickAwarded`, `penaltyAwarded`, `penaltyResolved` (`offsideCalled` já
  existia). Debug: categorias `foul` e `card`.
- `Statistics.ts` (jogador e time): `fouls`, `yellowCards` (o segundo amarelo conta), `redCards`,
  `penaltiesAwarded` (creditado ao cobrador), `penaltiesConceded`, `penaltyGoals`, `offsides`
  (o receptor). `penaltiesTaken`/`penaltiesScored` continuam só para a disputa de pênaltis.
- Nota (`PlayerRatingConfig`): amarelo −0,3, vermelho −1,0, pênalti cometido −0,5.
- `StatsPanel` (`/test`, partida ao vivo): colunas FL, YC, RC, OFF, PEN.
- `/test`: cenário `foul-in-box` (CB derruba o ST por trás dentro da área: amarelo + pênalti).
- `/lab`: `TeamRawStats` → `balanceWorker` → `PerMatchView`/`VariantSummary`
  (`avgFouls`, `avgYellowCards`, `avgRedCards`, `avgPenaltiesAwarded`, `avgPenaltyGoals`, `avgOffsides`)
  → linhas em `PairDetail`.

## Como os cartões saem da partida (para a parte 2)

`GameState.cards: CardRecord[]` → `MatchResult.cards` (`simulateMatch`) → `MatchCard[]`
(`dayLogTypes.ts`, ids de elenco, `home`/`away`) em `MatchEvent.cards` e `PlayedMatchRecording.cards`
(partida ao vivo, `buildPlayedMatchRecording`). `finalizeSquadsAfterMatch(..., cards)` recebe a lista;
hoje só para o relógio do expulso no minuto do vermelho. `MatchTeamStats` ganhou `fouls`,
`yellowCards`, `redCards`, `offsides`, `penaltiesAwarded` (opcionais).

## Calibração (`bun scripts/fouls-calibrate.ts [PL=400] [champ=150] [--out f] [--compare base]`)

Partidas do motor completo, 4-3-3 automático, fôlego 88, médias por partida somando os dois times.
`FOUL_OVERRIDES='{"TACKLE_BASE":0.7}'` troca constantes em memória para comparar candidatos.
O motor usa `Math.random` sem semente: duas rodadas de 400 jogos da Premier League **antes** das faltas
deram 2,235 e 2,362 gols (±5% entre rodadas), por isso a comparação usa as rodadas somadas.

| | Premier League antes (800) | depois (800) | Championship antes (300) | depois (150) |
|---|---|---|---|---|
| Gols | 2,30 | 2,37 (+3,2%) | 1,64 | 1,67 (+2,0%) |
| Chutes | 5,74 | 5,57 (−3,0%) | 4,94 | 4,98 (+0,7%) |
| xG (inclui pênaltis) | 3,36 | 3,41 (+1,5%) | 2,82 | 3,07 (+8,8%) |
| Faltas | — | 11,3 | — | 11,8 |
| Amarelos | — | 2,89 | — | 2,72 |
| Vermelhos | — | 0,15 (0,12 de segundo amarelo) | — | 0,09 |
| Pênaltis | — | 0,24 (0,18 gol) | — | 0,21 (0,18 gol) |
| Impedimentos | — | 1,05 | — | 0,76 |
| Tiros livres | — | 11,1 (2,1 perigosos) | — | 11,5 (2,2) |

Origem das faltas na PL: desarme 4,7 · drible 4,7 · bola solta 1,8.

**Depois do cooldown na retomada e do apito segurado** (2026-10-02, PL, 2 × 200 jogos somados):
gols 2,34, chutes 5,60, xG 3,42, faltas 11,2, amarelos 2,75, vermelhos 0,18 (0,125 de segundo
amarelo), pênaltis 0,28 (0,22 gol), impedimentos 1,03, tiros livres 10,9 (2,2 perigosos); origem
desarme 4,6 · drible 4,7 · bola solta 1,9. Tudo dentro do ruído das rodadas anteriores (as duas
rodadas de 200 deram vermelhos 0,205 e 0,150, pênaltis 0,31 e 0,25).

**Depois do jogo aéreo** (Etapa 13, `aerial.md`, PL 1200 / Championship 1200 jogos, `IN_BOX_MULT`
0,13 → 0,30 e faltas em disputa aérea): faltas 10,6 / 11,5, pênaltis 0,29 / 0,28 (0,23 / 0,22 gol),
gols +4,0% / −4,1% e chutes +2,2% / −0,7% em relação ao motor anterior.

**O que move gols/chutes:** os pênaltis somam ~0,18 gol por partida; os gols sem pênalti caem
~4,6% (as interrupções quebram jogadas), o que compensa quase tudo. Os layouts de tiro livre perigoso
aumentam chutes (com 35 jardas: +22% de chutes); sem layout nenhum, a interrupção derruba chutes
(−15% a −20%). 25 jardas fica neutro. Falta em
desarme ganho devolve a bola ao ataque (aumenta gols); falta em drible batido para a jogada (reduz);
por isso `TACKLE_WON_MULT` é baixo e `DRIBBLE_BASE` alto.

**Limitações:** sem falta fora de desarme/drible/duelo (ex.: puxão sem bola), sem lei da vantagem,
sem barreira; o tiro livre perigoso usa o layout fixo da formação; o expulso é sempre substituído
"por ninguém" (o time não sacrifica um jogador para pôr um goleiro reserva).
