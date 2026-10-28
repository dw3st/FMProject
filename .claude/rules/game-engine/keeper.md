# Goleiro ativo

Spec: `docs/superpowers/specs/2026-10-28-active-keeper-design.md`. Versão **4.37**. Regras puras em
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
