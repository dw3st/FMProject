# Jogo aéreo (motor) — cruzamentos, lançamentos, disputas aéreas, cabeçadas

Spec: `docs/superpowers/specs/2026-10-02-aerial-play-design.md`. Etapa 13, versão **2.8**.
Escanteios e faltas cruzadas pelo cobrador são da Etapa 14 (`set-pieces-play.md`): a cobrança é uma
bola alta `cross` com `fromSetPiece`, com regras próprias na disputa (vantagem do defensor posicionado,
mais perseguidores sem filtro de papel). Aqui, o jogo corrido.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/GameEngine/Configs/AerialConfig.ts` | Todas as constantes (`AERIAL_CONFIG`) |
| `src/GameEngine/Domain/Aerial.ts` (+ teste) | Puro, lado da decisão: `isCrossPosition`, `crossTargetPoints`, `evaluateCrossTargets`, `evaluateLongBall`, `longBallPressure`, `aerialDuelScore`, `keeperComesFor`, `isInSmallBox` |
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
passador precisa estar a ≤ 60 jardas do próprio gol. A nota depende da situação:

```
raw = LONG_BALL_WEIGHT × ( progresso / 65 × 0,30            // não satura mais em 50 jardas
                         + números na queda × 0,15            // 0,5 + 0,25 × (companheiros − defensores) a ≤ 7 jardas
                         + pressão × 0,30                     // longBallPressure
                         + habilidade aérea do receptor × 0,2
                         + passe × 0,1 )
compress(raw, LONG_BALL_STRONG_RAW = 0,63)
pressão = max(adversário a ≤ 12 jardas do passador, fração das opções curtas (≤ 25 jardas) marcadas)
```

Antes a nota do goleiro era praticamente constante (progresso saturado em 50 jardas, sem termo de
espaço): um ajuste mínimo jogava as reposições de ~80% longas para ~3%. Com a pressão e os números a
nota varia com o lance: num tiro de meta calmo (opções curtas livres) o passe curto ganha; pressionado,
o goleiro lança. Lançar para um receptor **livre** continua sem peso (criava contra-ataques demais,
+12% de chutes); o termo de números premia apoio para a segunda bola.

Parcela das reposições do goleiro que são longas (`aerial-calibrate` imprime `GK long-kick share`):
balanced ~43% (Premier) / ~39% (Championship), possession ~10%, direct ~86%.

## Disputa na queda (`resolveAerialLanding`)

1. **Goleiro** (do time que defende): sai se o ponto cai na pequena área e ele está a ≤
   `SMALL_BOX_DEPTH + AERIAL_RADIUS + GK_EXTRA_REACH` (14 jardas), ou se está a ≤ `AERIAL_RADIUS + 3` e
   mais perto que todos (`keeperComesFor`, o mesmo teste da nota do cruzamento). Agarra com `0,45 + 0,25 × posicionamento + 0,15 × reflexo
   − 0,08 × atacantes perto` (vira tiro de meta, como uma defesa), senão soca (`clearance` de 14–24
   jardas).
2. **Disputa:** jogadores de linha a ≤ `AERIAL_RADIUS` (5) do ponto. Com os dois times presentes, o
   melhor de cada lado por `aerialDuelScore` (heading 0,45 + jump 0,25 + força 0,15 + posição 0,15) duela:
   `P = (sA + 0,1) / (sA + sB + 0,2)`; os dois entram em recuperação curta. Antes do duelo, um atacante
   que estava impedido no chute é marcado (tiro livre; nunca pênalti a favor dele). Pode ser falta
   (`FoulKind` `aerial`, base 0,06, infrator 50/50 — na área do defensor é pênalti). Só um time
   presente: o mais perto ganha sem disputa. Ninguém: bola solta (`LooseBallState.source = kind`,
   com `offsideIds`: um impedido que pegar a sobra é marcado).
3. **Atacante ganhou:** impedido no chute → tiro livre de impedimento. A ≤ `HEADER_RANGE` (12) da
   linha com ângulo ≥ 0,18 rad → **cabeçada** ao gol. Senão, ajeita de cabeça para um companheiro mais
   perto do gol a ≤ 12 jardas (passe normal); senão domina, com chance `0,35 + 0,45 × firstTouch` (se
   errar, a bola cai solta, ainda do cruzamento/lançamento e com o impedimento valendo).
4. **Defensor ganhou:** disputado ou dentro da própria área → corta de cabeça (`clearance` de 16–28
   jardas para longe do gol; de cruzamento perto da linha de fundo, 30% vai para escanteio). Sozinho
   fora da área → domina (mesma chance de primeiro toque; se errar, a bola solta é do time dele —
   `clearance`, o lançamento não conta como certo).
5. **`clearance`** é uma bola alta curta: a "segunda bola" é disputada onde cai (mesma regra de
   duelo); quem ganha fica com a bola. Não conta como passe, lançamento nem cruzamento.
   Desde a Etapa 14 o escanteio que sai de um corte (cruzamento cortado na área, cruzamento bloqueado)
   usa as chances de `SET_PIECE_CONFIG` (`set-pieces-play.md` → "Fontes de escanteio").
6. **Perseguidores:** cada nova bola alta / solta re-seleciona os perseguidores; quem ainda corria
   atrás de uma bola anterior e não foi escolhido volta a decidir (`commitLooseBallChasers`). A saída
   de bola e a troca de lado limpam todos.
7. **Fim de período:** uma bola alta cobrada de bola parada (tiro livre, tiro de meta) é jogada antes do
   apito (`restartHoldsPeriod`, até 60 s de jogo).

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

Antes = motor sem jogo aéreo (Premier 800 jogos, Championship 600); depois = configuração final, com o
lançamento situacional e as correções da revisão (Premier 1200, Championship 1200):

| | Premier antes | depois | Championship antes | depois |
|---|---|---|---|---|
| Gols | 2,330 | 2,422 (+4,0%) | 1,720 | 1,650 (−4,1%) |
| Chutes | 5,558 | 5,678 (+2,2%) | 4,932 | 4,899 (−0,7%) |
| xG | 3,415 | 3,631 (+6,3%) | 3,040 | 3,130 (+3,0%) |
| Passes (sem cruzamentos/lançamentos) | 65,2 | 53,4 (−18%) | 58,7 | 48,1 (−18%) |
| Bolas em profundidade | 24,7 | 19,8 | 24,2 | 19,5 |
| Faltas | 11,1 | 10,6 | 11,9 | 11,5 |
| Pênaltis marcados (gols) | ~0,25 (`fouls.md`) | 0,29 (0,23) | — | 0,28 (0,22) |
| Cruzamentos (alvo 10–20) | — | 11,5 (22% certos) | — | 10,4 (20%) |
| Disputas aéreas (soma dos dois times, alvo 15–30) | — | 20,6 (10,3 disputas) | — | 18,4 (9,2) |
| Cabeçadas | — | 0,70 | — | 0,68 |
| Gols de cabeça (alvo 10–15%) | — | 0,233 (9,6%) | — | 0,191 (11,6%) |
| Lançamentos (alvo 5–15) | — | 6,4 (52% certos) | — | 5,9 |
| Reposições longas do goleiro | — | 43% | — | 39% |

Por estilo (Premier, 200 jogos, o mesmo estilo nos dois times): `direct_play` 15,2 lançamentos (goleiro
longo em 86%), 14,3 cruzamentos, 19,1 disputas; `possession` 0,7 lançamentos (goleiro longo em 10%),
3,3 cruzamentos.

Passes por vaga (Premier, antes → depois): GK 2,78 → 1,37, DEF 2,68 → 2,28, MID 3,71 → 3,30,
FWD 2,61 → 2,09. O quickSim teve os `PASSES_PER_MATCH` escalados na mesma proporção (média Premier +
Championship).

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

- ~~Sem escanteio cruzado nem bola parada aérea~~ — feito na Etapa 14 (`set-pieces-play.md`); desde
  então os cruzamentos e disputas da tabela acima incluem escanteios e faltas cruzadas (16,7
  cruzamentos e 30 disputas somadas na Premier) e os zagueiros marcam de cabeça.
- `jump` é baixo nos jogadores de linha dos elencos reais (~0,9/10), então pesa pouco fora do gol.
- Os passes do jogo caíram ~18% (cruzamentos e lançamentos são uma família à parte, como a bola em
  profundidade; não há alvo para isso no spec).
- Disputa aérea não rola lesão de contato (manteve a calibração de lesões).
- O estilo `possession` cruza pouco (3,3 por jogo; 3,0 gols em 200 jogos) e o `direct_play` ficou bem
  mais aéreo (15 lançamentos, 2,7 gols em 200 jogos). A tabela de estilos de `pass.md` (2.1.1: 2,75 e 3,03) é de antes
  das faltas e do jogo aéreo, então a comparação é só indicativa. Não rebalanceado nesta etapa.

## Registro dos gols (Etapa 32)

`goalScored` leva também `fromX`, `fromY`, `goalX` e `minute`; `Statistics.getGoalLog()` guarda a lista da partida e
vira `MatchEvent.goals` (cabeçada, bola parada, distância, fora da área). Só dado: nada muda no motor. Ver
`.claude/rules/game/awards.md`.
