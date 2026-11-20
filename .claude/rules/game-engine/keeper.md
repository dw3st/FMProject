# Goleiro ativo

Spec: `docs/superpowers/specs/2026-10-28-active-keeper-design.md`. Versão **7.7**. Regras puras em
`src/GameEngine/Domain/Keeper.ts`, constantes em `src/GameEngine/Configs/KeeperConfig.ts` (`KEEPER_CONFIG`).

## Regra

| Comportamento | Onde | Regra (valores finais) |
|---|---|---|
| Arco defendendo | `keeperDefendingTarget` ← `computeDefensivePosition` | Bola a ≤ 20 jardas: o arco de antes (0,5 → 6). Mais longe: 0,5 (20) → `FAR_COME_OUT` 6 (60+). Limitado aos `bounds` do papel |
| 1 contra 1 | `isOneOnOne`, `rushComeOut` | Portador adversário a ≤ 25 do centro do gol, sem defensor de linha (não recuperando) à frente num corredor ±8: sai na bissetriz até `min(10, dist − 1,5)`, limitado só ao campo. A 2 jardas a decisão `tackle` (já existia) vira abafada |
| Abafada | `resolveTackle` (`smotherBase`) | Base `0,25 + 0,3 × (posicionamento + reflexo)/2` no lugar do `tackleChance`; falta × 0,5 e a técnica lida do posicionamento (`foulCheck`, `FoulContext.keeperMult`) |
| Adiantado | `keeperAttackingTarget` ← `computeAttackingPosition` | Time com a bola: 6 jardas (bola a ≤ 30 da linha), 12 (57,5), 18 (97,5); segue 15% do y. `ATTACK_ENABLED` só para medição |
| Líbero | `sweeperChases` ← `commitLooseBallChasers` | Bola em profundidade / solta (não bola alta) a ≤ 30 da linha e ±26 do centro: persegue se `eta_gk + (0,15 − 0,15 × posicionamento) < eta` do atacante mais rápido. Fora da área joga com o pé (portador normal) |
| Bola alta larga | `isWideClaimZone`, `keeperComesWide`, `wideClaimFactor` ← `resolveAerialLanding` | Além da pequena área até 10 jardas (±10 do centro), a ≤ 10 do ponto e no máximo à distância do jogador de linha mais perto: sai; agarrar × `1 − 0,35 × (prof − 6)/4`; errando, 30% a bola fica solta no ponto (`dropLooseAt`), senão soco. Também só persegue a bola alta larga quando sairia nela |
| Qualidade no chute | `computeGKPositionQuality` ← `keeperPositionDeviation` | Distância ao trecho da bissetriz entre o arco e, a ≤ 25 jardas, o ponto de saída: sair nunca é punido |

- O cruzador **não** antecipa a saída larga (a nota dos alvos em `evaluateCrossTargets` / `evaluateBoxSetPiece` continua só
  com a pequena área). Antecipando, o cruzador trocava o cruzamento por condução para dentro da área e os pênaltis
  dobravam (0,22 → 0,43 por jogo, faltas de desarme e drible na área).
- Eventos `keeperSortie { kind: sweep | rush | high }`, `keeperSweep` (bola solta ganha fora da área), `keeperSmother`;
  debug `keeper`. `Statistics.ts`: `keeperSorties`, `keeperSweeps`, `keeperSmothers`.

## `/test`, `/lab`

- `/test`: cenários `keeper-sweeper`, `keeper-one-on-one`, `keeper-attacking`, `keeper-high-ball`; overlay **Keeper**
  (zona do líbero, zona de bola alta, raio do 1 contra 1, linha até o alvo); colunas KS / KW / KM no `StatsPanel`.
- `/lab`: `TeamRawStats.keeperSorties/Sweeps/Smothers` → `avgKeeper*` → linhas no `PairDetail`.

## Medições (2026-10-28)

`bun scripts/keeper-measure.ts [jogos] [variante] [liga] [semente]` (4-3-3, `Math.random` semeado por jogo; variantes
`off`, `all`, um comportamento só; `KEEPER_OVERRIDES` troca constantes). Premier, 800 jogos (2 sementes):

| Configuração | gols | chutes | pênaltis | saídas | abafadas |
|---|---|---|---|---|---|
| main (antes) | 2,165 | 5,39 | 0,22 | — | — |
| primeira versão (1v1 até 13, arco longe 8, alta até 12, cruzador antecipando) | 1,864 | 4,91 | 0,38 | 1,19 | 0,45 |
| a mesma sem a antecipação do cruzador | 1,654 | 4,29 | 0,28 | 1,41 | 0,38 |
| final (1v1 até 10, arco longe 6, alta até 10 e só sendo o primeiro) | 2,21 | 5,25 | 0,26 | 0,45 | 0,17 |

O peso do goleiro na defesa do chute (`SAVE_SCALE`) quase não mexe no volume (0,38 e 0,30 deram o mesmo): ficou 0,45.

Mundo (`bun scripts/ai-formation-goals.ts --engine 800 --modes ai --quick 0`, formações da IA):

| Liga | gols antes | depois | Δ | chutes antes | depois | Δ |
|---|---|---|---|---|---|---|
| premier_league | 2,243 | 2,205 | −1,7% | 5,60 | 5,34 | −4,6% |
| of_championship | 1,781 | 1,645 | −7,6% | 5,23 | 4,97 | −5,0% |
| as duas | 4,024 | 3,850 | **−4,3%** | 10,83 | 10,31 | **−4,8%** |

Dentro de ±5% somando as ligas (ruído ~±2%): quickSim não recalibrado.

## Testes

`bun test src/GameEngine/Domain/Keeper.test.ts`.

## Limitações

- O líbero quase nunca dispara (~0,01 bola afastada por jogo): a linha de defesa costuma chegar antes.
- O goleiro fora da área não tem regra de mão nem lançamento próprio: é um portador comum.
- Sem chute por cobertura contra o goleiro adiantado.

## Cruzamento na marca do pênalti (8.1.51)

Report de tester: o goleiro esperava na linha bolas que ele pegaria antes de todos. Medido com `bun scripts/keeper-probe.ts
[jogos] [liga] [semente]` (bolas em profundidade, altas e cortes; quem chega antes pelo sprint, se o goleiro persegue, quem
fica com a bola): ~4,5 cruzamentos por jogo para a marca do pênalti (12 jardas), o alvo `penalty` de `crossTargetPoints`,
com o goleiro o mais rápido de todos e sem sair, porque a zona de bola alta acabava em 10 jardas. As bolas em
profundidade já eram dele.

- `HIGH_CLAIM_DEPTH` 10 → 13, `HIGH_REACH` 10 → 12, `HIGH_DEPTH_PENALTY` 0,35 → 0,7, `HIGH_FLAP_SHARE` 0,3 → 0,5.
- O desconto pela profundidade e a bola espalmada que fica solta valem em toda saída fora da pequena área
  (`resolveAerialLanding`, `deep = !inSmall`). Antes, se ele chegasse primeiro pela regra de perto (`keeperComesFor`),
  segurava com a chance cheia em qualquer distância. Sozinha, essa troca não muda os gols.
- Por que não segurar mais: a pegada encerra o ataque, enquanto o corte do zagueiro deixa uma segunda bola viva. Premier,
  600 jogos, 4-3-3, semente 9000: antes 2,11 gols; penalidade 0,85 / espalma 0,7: 2,01; 0,7 / 0,5 (o escolhido): 1,91;
  0,5 / 0,3: 1,78. O goleiro sai em ~4,4 dessas bolas por jogo (antes 0,4).
- Mundo (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`, `KEEPER_OVERRIDES` no worker): Premier 2,155 → 1,901
  gols, 5,47 → 5,09 chutes; Championship 1,639 → 1,581, 4,92 → 4,84; somadas −8,2% gols, −4,4% chutes. quickSim:
  `BASE_GOALS` 0,795 → 0,73 e `SHOTS_PER_XG` 1,778 → 1,89 (a relação quickSim × motor fica a mesma: +9,3% nas duas ligas
  somadas, antes e depois).

## Chute por cima do goleiro adiantado (8.4.2)

Report do usuário: o resultado do chute era sorteado na linha do gol, sem olhar a distância do goleiro, então um goleiro a 10 jardas da linha "pegava" na linha a bola que já tinha passado por ele. Agora, com a bola no ar, ele corre para o ponto mais perto do que resta da trajetória (`shotInterceptPoint`), e o sorteio acontece quando a bola chega a até `SHOT_REACH` (4) jardas dele (`ballMeetsKeeper`, `ShotState.outcome`): defesa encerra o chute ali (o `shotResolved` leva esse ponto, para os efeitos não desenharem na linha); gol segue até a linha, sem novo sorteio. No alvo e fora do alcance o tempo todo: gol. Fora do alvo: como antes. Cenário `keeper-shot-over` no `/test`, debug `keeper`. Mundo (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`, 800 jogos por liga, contra a 8.4): Premier 2,060 → 2,109 gols, 5,54 → 5,49 chutes; Championship 1,686 → 1,732, 5,22 → 5,37; somadas +2,5% e +0,9%, quickSim não recalibrado. Com alcance 3: +6,0% (um chute no canto com o goleiro na linha virava gol direto).

## Mira do chute (8.5)

Report do usuário: chutes errando com o gol vazio. A mira (`computeShotAim`, `SHOT_AIM`) sorteava o ponto numa faixa que dependia só da finalização: um jogador mediano errava metade dos chutes em qualquer distância. Agora o desvio cresce com a distância ao centro do gol (5% do desvio até 4 jardas, cheio a partir de 22) e cai a 30% quando o goleiro não alcança a linha do chute (`keeperReachesShot`). Falta direta segue como antes (`fixedRange`). Para o volume não subir, a chance de gol de um chute no alvo é × `CONVERSION` (0,78); o chute fora do alcance do goleiro continua gol certo. Sonda: `bun scripts/shot-miss-probe.ts`. Medição do mundo: Premier 120 jogos, chutes para fora 43% → 24%. Mundo (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`, contra a 8.4.2): Premier 2,109 → 2,085 gols, 5,49 → 5,67 chutes; Championship 1,732 → 1,768, 5,37 → 5,25; somadas +0,3% e +0,5%, quickSim não recalibrado.

## Bola na área e o zagueiro na frente (8.7.5)

Report de tester: bolas que caíam na área à frente do goleiro, com ele mais perto que todos, e ele não saía. Medido (`bun scripts/keeper-probe.ts 100` e uma sonda da queda da bola): a bola alta só valia até 13 jardas e ±10 do centro, a bola solta só era dele se ele tivesse sido escolhido perseguidor no começo da corrida, e a bola que ele espalmava ficava fora da corrida dele (`dropLooseAt` o marca como quem tocou por último). E, quando saía, a disputa se resolvia com ele a ~4,8 jardas da bola: 21% de pegadas, o resto soco ou bola solta.

- **Zona da bola alta** (`isWideClaimZone`): a grande área inteira além da pequena área. `HIGH_CLAIM_DEPTH` (13) agora só marca onde a penalidade da pegada chega ao máximo; mais fundo ela fica igual.
- **Bola solta na área** (`keeperClaimsLooseBall`, `keeperTakesLoose`): todo tick, uma bola solta na grande área de um goleiro é dele quando ele chega antes de todos (ETA de sprint), também a que ele espalmou.
- **Zagueiro na frente** (`defenderCovers`, `DEFENDER_COVER` 4, `DEFENDER_LEVEL` 1): fora da pequena área, um companheiro de linha a até 4 jardas da bola e não atrás dela (entre a bola e o gol, ou na linha dela, com 1 jarda de folga), fora de recuperação, joga a bola: o goleiro não sai (bola alta, escolha de perseguidor, varredura, bola solta). Zagueiro batido não conta.
- **Desenho** (`playerAnims.ts`, `claim`; `gkClaim` leva `x`/`y`): quando ele sai, o boneco vai até a bola (até 7 jardas), sobe e volta. O resultado não muda.

Mundo (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`, contra a 8.6.1): Premier 2,156 → 2,074 gols, 5,57 → 5,58 chutes; Championship 1,806 → 1,792, 5,29 → 5,40; somadas −2,4% e +1,0%, quickSim não recalibrado.

## Segurar, espalmar ou soltar (12.10)

Pedido do usuário (o goleiro espalmava demais, sem critério: até a 12.9 toda defesa era 50/50 entre segurar e escanteio, `SET_PIECE_CONFIG.SAVE_CORNER_CHANCE`, removido). `saveOutcomeChances(skill, goalChance)` (`Keeper.ts`, `KEEPER_CONFIG.SAVE`): habilidade = média de reflexo, salto e posicionamento (`shotStoppingSkill`); segurar = 0,6 + 0,5 × (habilidade − 0,5) − 0,5 × (chance de gol − 0,3), entre 0,15 e 0,9; do que não segura, uma parte solta (0,09 − 0,4 × (habilidade − 0,5) + 0,2 × (chance − 0,3), entre 0,02 e 0,4) e o resto vai para escanteio. A bola solta cai `SPILL_DIST` (4) jardas à frente de onde ele a encontrou (`dropLooseAt`, o time dele tocou por último). Evento `keeperSave { kind }`, debug `keeper`, `Statistics.keeperHolds/keeperSpills`, linhas "Saves held" / "Saves spilled" no `PairDetail` do `/lab`.

Medido (`bun scripts/keeper-measure.ts 400 all <liga> 5000`, 4-3-3, `Math.random` semeado por jogo, contra a regra antiga com `KEEPER_OVERRIDES`): Premier 1,837 → 1,923 gols (+4,7%), escanteios 4,26 → 4,01, seguradas 0,84 → 0,87, soltas 0 → 0,14 por jogo; Championship 1,475 → 1,540 (+4,4%), escanteios 3,82 → 3,66, soltas 0,15. quickSim não recalibrado (dentro de ±5%).

## Goleiro que solta a bola corre atrás dela (12.19.4)

Report do usuário. Numa bola solta o `ballHolderId` continua sendo o último a tocar, e o dono da bola não decide nem anda como os outros. Quando um goleiro soltava uma defesa ou espalmava um cruzamento (`dropLooseAt`), ele ficava parado até outro chegar ou até o vigia de 7 segundos entregar a bola. Agora o goleiro que é o último toque de uma bola solta (`looseKeeper`, `gameState.ts`) decide e anda como os demais, e a disputa dele (`keeperClaimsLooseBall`) passa a valer. Os outros jogadores não mudam: o vale para todos tirava 12% dos gols.

Mundo (`ai-formation-goals.ts --engine 400 --chunks 4 --modes ai --quick 0`, contra a 12.19.3): Premier 2,123 → 1,982 gols, 5,77 → 5,51 chutes; Championship 1,875 → 1,702, 5,59 → 5,21; somadas −7,9% e −5,6%. Decisão do usuário: aceitar e acompanhar no quickSim, `BASE_GOALS` 0,798 → 0,735 e `SHOTS_PER_XG` 1,96 → 2,01 (quickSim 4000 jogos: Premier 2,150, Championship 1,604; somadas +1,9% sobre o motor).

## The save by the ball (engine rebuild stage 7)

With `SHOT_PHYSICS` the keeper's save is no dice on the xG: he reacts by reflexes, dives by diving to the path of the
3D ball and stops it within his hands by handling, the offset and the speed; then holds, parries or spills. During a
physical shot the shot moves him (`tickPhysicalShot`), not the formation. His behaviour outside the shot is stage 11.
See `shot-and-save.md` → "Stage 7".

## Stage 11: FM's keeper (engine rebuild)

Flag `FM_KEEPER` (`DECISION_FLAGS`, on by default); constants in `Configs/FmKeeperConfig.ts` (`FM_KEEPER`, knots
`FM_KEEPER_DEFEND_KNOTS_M` / `FM_KEEPER_OWN_KNOTS_M`, env `FM_KEEPER_OVERRIDES`); pure rules in `Keeper.ts`
(`fmKeeperOffLineM`, `fmKeeperTarget`, `fmClaimDepth`, `fmKeeperComesForHigh`, `fmKeeperDeviation`). Every number is read
from FM (R8 §2, R9 §2), nothing calibrated (stage 21). Off = the active keeper of 7.7 above (arc, rush, sweeper, wide
claims), the same play as before.

- **Position** (`fmKeeperTarget`, both phases): metres off the line by the ball's distance from the centre of his goal
  line, linear between knots. Opponent on the ball: 0 within 35 m, 2.7 / 6.0 / 10.5 m at the centres of the 35–52.5 /
  52.5–70 / 70+ m bands. His own team: 0.5 within 20 m, 3.8 / 4.8 / 11 / 18.5 m at 30 / 43.75 / 61.25 / 85 m. Sideways
  0.18 of the ball's offset from the centre. At least 0.3 yd off the line, pitch-clamped only (not the role bounds).
- **No 1-v-1 rush, no sweeper.** He never runs at a holder through on goal, and he never chases a ground ball outside
  his box. A loose ball in his box he gets to first is still his (`keeperComeOut` `loose`). A holder who runs into him
  (2 yd) meets the challenge at the feet (`keeperFeet`, the 7.7 smother chance). The shot itself is stage 7's save by
  the ball's path.
- **High balls** (`fmKeeperComesForHigh`, in `commitLooseBallChasers`): he comes for one only when its meeting point
  (stage 10's `meetPoint`, 1.8 m) is in his box, at most `3 + 8 × command` yd off his line (command = mean of
  positioning and jumping; capped at FM's 16 m), he gets there before every outfield player of both teams, and in time
  (his race ≤ the ball's flight to the point + 0.2 s). Otherwise he holds his line and only meets the ball if it passes
  through his reach (stage 10's contact search). At the contact the 7.7 catch / punch / flap rule.
- **Distribution and condition:** nothing new. The keeper as holder is the stage-8 chooser; his drain is stage 14's
  (`GK_DRAIN_SCALE` 0.07). Both are only measured here.
- **Events:** `keeperComeOut { kind: high | loose | sweep | rush, depth }` (sweep and rush only with the flag off),
  `keeperCollect { inBox }` (any loose ball he wins), `keeperFeet { won }` replace `keeperSortie` / `keeperSweep` /
  `keeperSmother`. `aerialContact.inBox`, `keeperSave` has the contact point (`x`, `y`, `z`).
- **Statistics:** player `keeperComeOuts`, `keeperCollects`, `keeperFeetWins` (were sorties / sweeps / smothers); team
  (defending side) `boxHighBalls`, `boxHighKeeper`, `boxHighDef`, `boxHighAtt`, `keeperClaims`, `keeperPunches`. `/lab`
  `PairDetail`: "High balls into the box" and the keeper / defence / attack shares, "Keeper claims %". `fm-targets.ts`
  section "The keeper": off the line by band and side, sideways follow, the box high balls, claims, open-play passes
  (long ≥ 35 m, kept) and goal kicks.
- **2D:** the dive already goes to the real point (stage 7 moves him to the ball's path). The `keeperSave` event picks
  the figure's move: held at his body = catch (low: collect), wide = dive, a high parry = tip over.
- **/test:** scenarios `keeper-sweeper` (he stays), `keeper-one-on-one` (he holds his line), `keeper-attacking` (own
  bands), `keeper-high-ball` (spot cross: past his depth), new `keeper-six-yard-cross` (he claims) and `keeper-far-ball`
  (opponent far away); overlay "Keeper": his claim depth and the 35 m radius.
- Tests: `Domain/KeeperFm.test.ts`; `Domain/Keeper.test.ts` runs the 7.7 rules with `FM_KEEPER` and `FM_AERIAL` off.
- Measured: `fm-numbers.md` → "Etapa 11".
