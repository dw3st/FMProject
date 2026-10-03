# Jogo aéreo (motor) — cruzamentos, lançamentos, disputas aéreas, cabeçadas

Spec: `docs/superpowers/specs/2026-10-02-aerial-play-design.md`. Etapa 13, versão **2.8**.
Escanteios e faltas cruzadas pelo cobrador são da Etapa 14 (bolas paradas); aqui só o jogo corrido
(o cobrador de tiro livre pode cruzar e o de tiro de meta pode lançar quando é a melhor ação).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/AerialConfig.ts` | Todas as constantes (`AERIAL_CONFIG`) |
| `src/GameEngine/Domain/Aerial.ts` (+ teste) | Puro, lado da decisão: `isCrossPosition`, `crossTargetPoints`, `evaluateCrossTargets`, `evaluateLongBall`, `aerialDuelScore`, `isInSmallBox` |
| `src/GameEngine/Infrastructure/ActionOutcomes.ts` (+ `AerialOutcomes.test.ts`) | Sorteios: `resolveAerialDuel`, `gkClaimChance`, `computeHeaderEffect`; `resolveShot` usa o efeito de cabeceio quando `shot.header` |
| `src/GameEngine/Domain/DecisionTree.ts` | `evalCross` / `evalLongBall` competem em `decideBallHolder` (decisões `cross` e `long_ball`) |
| `src/GameEngine/Domain/gameState.ts` (+ `Aerial.engine.test.ts`) | `startAerialBall`, `resolveAerialLanding` (exportados), `clearanceBall`, `startHeader`, controle de primeiro toque |
| `src/GameEngine/Configs/AttackConfig.ts` | `TeamPassWeights.LONG_BALL_WEIGHT` por `build_up` (possession 0,6 · balanced 1,0 · direct 1,3) |
| `src/GameEngine/Domain/Statistics.ts`, `PlayerRating.ts` | Estatísticas e nota (ver abaixo) |
| `src/Domain/advanceDay/quickSim.ts` | `rollAerial` (ver `.claude/rules/non-player-games.md` → "Jogo aéreo no quickSim") |
| `scripts/aerial-calibrate.ts` | Calibração (ver abaixo) |

## Bola alta (`PassState.kind`)

`cross`, `long_ball` e `clearance` (`isAerialKind`). `toId` é sempre `null`; o destino é o ponto
`toX/toY` (com o erro de passe `σ = (1 − passingSkill) × MAX_ERROR / 2`: cruzamento 4, lançamento
10 jardas). Voa a `AERIAL_YARDS_PER_SEC` (30) com a mesma suavização dos passes (começa devagar),
**nunca é interceptada no caminho**: só pode ser bloqueada no chute por um adversário a ≤ 2 jardas do
passador (`BLOCK_CHANCE` 0,35; o bloqueio vira uma `clearance` curta, ou escanteio perto da linha de
fundo). No voo, até 3 perseguidores por time (`commitLooseBallChasers` com as opções aéreas) correm
para o ponto e ficam presos à decisão `chase_loose_ball`; o goleiro só corre se o ponto cai na
pequena área dele. Atacantes em impedimento no momento do chute ficam em `aerialOffsideIds`.

## Cruzamento

- **Posição de cruzar:** até 50 jardas da linha de fundo, `|y − 37| ≥ 7`, **fora da área** (dentro
  dela só o corte da linha de fundo: até 4 jardas da linha e fora da pequena área). Medido: deixar
  cruzar de dentro da área custava ~1/3 dos gols "de chão" e metade dos pênaltis.
- **Alvos:** primeiro pau (7,5 jardas da linha, poste do lado do cruzador), marca do pênalti (12) e
  segundo pau (7 jardas, 2 fora do poste).
- **Nota de cada alvo** (`raw`, 0 se nenhum atacante alcança a zona):
  `BASE 0,5 + (atacantes − 0,6 × defensores) × 0,22 + passe × 0,15 + melhor cabeceio × 0,30 − 0,20 se o
  goleiro alcança`, atacantes ponderados por proximidade num raio de 22 jardas (os que chegam durante
  o voo), defensores num raio de 8. A menos de `CROSS_DEEP_DIST` (20) da linha a nota é × 0,7: ali o
  portador tem opções melhores (cortar para dentro, chutar, cruzar rasteiro, sofrer pênalti).
- Comprimido como as outras ações: `compress(raw, CROSS_STRONG_RAW = 0,5)`.

## Lançamento longo

Companheiro (não goleiro) ≥ 22 jardas à frente, a 28–65 jardas, que não esteja em impedimento; o
passador precisa estar a ≤ 60 jardas do próprio gol. `raw = LONG_BALL_WEIGHT × (progresso × 0,3 +
habilidade aérea do receptor × 0,2 + passe × 0,1)`, `compress(raw, 0,4)`. O peso de espaço
(`LONG_BALL_SPACE_WEIGHT`) é 0: lançar só para quem está livre criava contra-ataques demais (+12% de
chutes); o lançamento vai para a cabeça do centroavante e é disputado. Na prática quase todo
lançamento é do goleiro (~2,2 por goleiro por jogo; os zagueiros ~0,2).

## Disputa na queda (`resolveAerialLanding`)

1. **Goleiro** (do time que defende): sai se o ponto cai na pequena área ou se ele está a ≤
   `AERIAL_RADIUS + 3` e mais perto que todos. Agarra com `0,45 + 0,25 × posicionamento + 0,15 × reflexo
   − 0,08 × atacantes perto` (vira tiro de meta, como uma defesa), senão soca (`clearance` de 14–24
   jardas).
2. **Disputa:** jogadores de linha a ≤ `AERIAL_RADIUS` (5) do ponto. Com os dois times presentes, o
   melhor de cada lado por `aerialDuelScore` (heading 0,45 + jump 0,25 + força 0,15 + posição 0,15) duela:
   `P = (sA + 0,1) / (sA + sB + 0,2)`; os dois entram em recuperação curta. Pode ser falta (`FoulKind`
   `aerial`, base 0,06, infrator 50/50 — na área do defensor é pênalti). Só um time presente: o mais
   perto ganha sem disputa. Ninguém: bola solta (`LooseBallState.source = kind`).
3. **Atacante ganhou:** impedido no chute → tiro livre de impedimento. A ≤ `HEADER_RANGE` (12) da
   linha com ângulo ≥ 0,18 rad → **cabeçada** ao gol. Senão, ajeita de cabeça para um companheiro mais
   perto do gol a ≤ 12 jardas (passe normal); senão domina, com chance `0,35 + 0,45 × firstTouch` (se
   errar, a bola cai solta).
4. **Defensor ganhou:** disputado ou dentro da própria área → corta de cabeça (`clearance` de 16–28
   jardas para longe do gol; de cruzamento perto da linha de fundo, 30% vai para escanteio). Sozinho
   fora da área → domina (mesma chance de primeiro toque).
5. **`clearance`** é uma bola alta curta: a "segunda bola" é disputada onde cai (mesma regra de
   duelo); quem ganha fica com a bola. Não conta como passe, lançamento nem cruzamento.

## Cabeçada

`xG = computeXG(dist, ângulo, pressão) × HEADER_XG_MULT (0,9)`; a mira usa o cabeceio no lugar da
finalização, e na resolução `computeHeaderEffect = 0,8 + heading × 0,5` substitui o
`computeShooterEffect` (o goleiro entra igual). Conta como chute (`shot`) e, se entra, como gol
(`goalScored` com `header: true`); a assistência é do cruzador (`lastPasserId`).

O spec previa `HEADER_XG_MULT ≈ 0,55`. Neste motor os chutes são poucos e valiosos (~0,6 de xG por
chute); com 0,55 os gols de cabeça ficavam em ~7% dos gols e os cruzamentos tiravam gols. 0,9 deixa a
cabeçada de 8–12 jardas ainda pior que um chute de pé do mesmo lugar (sem o efeito de finalização e
com a pressão do zagueiro que perdeu).

## Eventos, estatísticas, nota

- `EventBus`: `crossStarted`, `longBallStarted`, `aerialResolved` (`kind`, `completed`, `outcome`:
  header · knockdown · control · clearance · claim · punch · blocked · loose · offside · foul),
  `aerialDuel` (com `kind`, inclui as segundas bolas de `clearance`), `gkClaim`, `header`; `goalScored`
  ganhou `header`. Debug: categoria `aerial`; `crossScores` (alvos do cruzamento, só com debug).
- `Statistics.ts` (jogador e time): `crosses`, `crossesCompleted` (primeiro contato do time que
  cruzou, creditado ao cruzador), `aerialDuels` (disputas de que participou; no time = disputas do
  jogo), `aerialDuelsWon`, `headers` (também em `shots`), `headerGoals` (também em `goals`),
  `longBalls`, `longBallsCompleted`. `MatchTeamStats` (dia/partida) recebe os mesmos campos (opcionais).
- Nota (`PlayerRatingConfig`): disputa aérea ganha +0,05; gol de cabeça é gol (+1,5); cabeçada é chute.
- Ao vivo / `/test`: colunas CR, AD, HG, LB no `StatsPanel`; cenário `cross-to-box`; overlay **Aerial**
  (alvos do cruzamento com a zona e o melhor em dourado; no voo, o ponto de queda, o anel de
  `AERIAL_RADIUS` e as linhas dos perseguidores); barras CROSS / LONG no painel de decisão.
- `/lab`: `TeamRawStats` → `balanceWorker` → `PerMatchView`/`VariantSummary` (`avgCrosses`,
  `crossCompletionPct`, `avgAerialDuelsWon`, `avgHeaderGoals`, `avgLongBalls`) → linhas no `PairDetail`.
- MCP: `evaluate_cross`.

## Calibração (`bun scripts/aerial-calibrate.ts [PL=200] [champ=150] [--style s] [--out f] [--sum a,b] [--compare base1,base2]`)

Motor completo, 4-3-3 automático nos dois lados, fôlego 88, médias por partida somando os dois
times. O motor não tem semente: uma rodada de 400 jogos varia ±3% em gols sozinha, então rodo vários
processos em paralelo (`--out`) e somo (`--sum`). `AERIAL_OVERRIDES` / `FOUL_OVERRIDES` trocam
constantes em memória. Também imprime, por linha (posição do titular; o reserva herda), passes,
disputas ganhas, gols de cabeça, cruzamentos e lançamentos por vaga.

Antes = motor sem jogo aéreo (Premier 800 jogos, Championship 600); depois = configuração final
(Premier 800, Championship 1200):

| | Premier antes | depois | Championship antes | depois |
|---|---|---|---|---|
| Gols | 2,330 | 2,408 (+3,3%) | 1,720 | 1,703 (−1,0%) |
| Chutes | 5,558 | 5,643 (+1,5%) | 4,932 | 4,826 (−2,1%) |
| xG | 3,415 | 3,641 (+6,6%) | 3,040 | 3,102 (+2,0%) |
| Passes (sem cruzamentos/lançamentos) | 65,2 | 54,1 (−17%) | 58,7 | 49,4 (−16%) |
| Bolas em profundidade | 24,7 | 19,4 | 24,2 | 18,7 |
| Faltas | 11,1 | 10,7 | 11,9 | 11,5 |
| Pênaltis marcados | ~0,25 (`fouls.md`) | 0,27 | — | 0,29 |
| Cruzamentos (alvo 10–20) | — | 12,0 (22% certos) | — | 10,8 (20%) |
| Disputas aéreas (soma dos dois times, alvo 15–30) | — | 22,0 (11,0 disputas) | — | 19,0 (9,5) |
| Cabeçadas | — | 0,75 | — | 0,66 |
| Gols de cabeça (alvo 10–15%) | — | 0,233 (9,7%) | — | 0,193 (11,3%) |
| Lançamentos (alvo 5–15) | — | 6,4 (45% certos) | — | 5,4 |

Por estilo (Premier, 200 jogos, o mesmo estilo nos dois times): `direct_play` 11,9 lançamentos, 14,6
cruzamentos, 16,8 disputas; `possession` 0,4 lançamentos, 3,4 cruzamentos.

Passes por vaga (Premier, antes → depois): GK 2,78 → 0,51 (o goleiro lança longo quase sempre),
DEF 2,68 → 2,57, MID 3,71 → 3,35, FWD 2,61 → 2,08. O quickSim teve os `PASSES_PER_MATCH` escalados
na mesma proporção.

**O que move gols e chutes:**
- Cruzar perto da linha de fundo / dentro da área tira gols (o portador ali vale muito: corta, chuta,
  sofre pênalti); cruzar de longe (20–50 jardas) é neutro ou soma. Daí a área excluída e o × 0,7.
- Lançamentos que acham o atacante livre criam chances demais; para a cabeça do centroavante, com
  erro de 10 jardas e primeiro toque, ficam neutros.
- Os cruzamentos trocam conduções para dentro da área por bolas altas: os pênaltis caíam à metade,
  por isso `IN_BOX_MULT` (faltas) foi de 0,13 para 0,30.
- `HEADER_RANGE` 15 → 12 trocou cabeçadas de longe (piores) por ajeitadas/domínio, que viram chutes de
  pé.

## Limitações

- Sem escanteio cruzado nem bola parada aérea (Etapa 14): zagueiros quase não fazem gol de cabeça.
- `jump` é baixo nos jogadores de linha dos elencos reais (~0,9/10), então pesa pouco fora do gol.
- O goleiro lança longo em ~80% das reposições mesmo no estilo equilibrado; os passes do jogo caíram
  ~17% (não há alvo para isso no spec).
- Disputa aérea não rola lesão de contato (manteve a calibração de lesões).
- O estilo `possession` cruza pouco (3,4 por jogo; 3,0 gols em 200 jogos) e o `direct_play` ficou bem
  mais aéreo (2,52 gols em 200 jogos). A tabela de estilos de `pass.md` (2.1.1: 2,75 e 3,03) é de antes
  das faltas e do jogo aéreo, então a comparação é só indicativa. Não rebalanceado nesta etapa.
