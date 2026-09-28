# Fôlego e carga (fadiga)

## Regra

- Cada jogador carrega dois números entre uma partida e a próxima: `seasonLog.fitness` ("fôlego",
  0–100) e `seasonLog.load` ("carga", minutos-equivalentes acumulados com decaimento). Nenhum dos
  dois é simulado partida a partida para todo o mundo — só quando o jogador de fato entra em campo
  (motor completo ou quickSim) e no avanço diário (treino/descanso).
- Toda a lógica pura mora em `src/Domain/fitness/` (`fitnessConfig.ts` para as constantes,
  `fitness.ts` para as funções). Nenhum I/O ali — motor, quickSim e `advanceDay` são quem lê/grava
  `seasonLog`.
- Spec original: `docs/superpowers/specs/2026-09-27-stamina-design.md`. Histórico de calibração
  (curva do motor, `matchStartEnergy`, volume de gols do quickSim): `.claude/rules/non-player-games.md`
  → "Fadiga".

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/fitness/fitnessConfig.ts` | Todas as constantes (`FITNESS`) |
| `src/Domain/fitness/fitness.ts` (+ teste) | Funções puras: recuperação diária, carga, `matchStartEnergy`, pós-jogo |
| `src/GameEngine/Domain/RuntimeLineup.ts` | `consumeEnergy` (custo em campo), `applyContinuousFatigue`, `overallEnergyFactor` |
| `src/GameEngine/Domain/gameState.ts` | Energia de início dos titulares/banco, drenagem por tick, recuperação do intervalo |
| `src/Domain/advanceDay/quickSim.ts` + `src/GameEngine/Configs/QuickSimConfig.ts` | Desgaste por linha calibrado contra o motor |
| `src/Domain/advanceDay/matches.ts` | Pós-jogo (fôlego = energia final, carga += minutos) |
| `src/backend/advanceDay.ts`, `src/Domain/advanceDay/dailyRest.ts`, `dailyTraining.ts` | Recuperação/treino diários para quem não jogou hoje |
| `src/Domain/lineupHelpers.ts` (+ teste) | `autoFillLineupWithFitness` — seletor de XI ciente de fôlego |
| `src/GameInterface/EnergyPanel.tsx`, `TestScreen.tsx`, `src/GameEngine/Suport/TestCases.ts` | Debug (`/test`) |
| `src/lab/balanceWorker.ts`, `scenarioRunner.ts`, `types.ts`, `components/ScenarioBuilder.tsx`, `PairDetail.tsx` | Calendário apertado (`/lab`) |
| `src/GameEngine/Domain/Statistics.ts` | `avgEndEnergy`, `fatigueSubstitutions` |
| `scripts/fatigue-calibrate.ts` | Motor × quickSim, cenários de saldo de gols, `START_COMPRESSION` |
| `scripts/season-rollover-smoke.ts` (seção "Fôlego") | Smoke de temporada inteira — ver "Smoke" abaixo |

## 1. Modelo

### Fôlego pós-jogo

Quem entra em campo termina com `fôlego = energia no fim da partida` (`postMatchFitness`, apenas
arredondado e travado em 0..100). **Sem devolução automática de 50% do gasto** — essa era a regra
anterior a esta funcionalidade (`spent * 0.5` somado de volta na hora); foi removida porque a
recuperação passou a acontecer dia a dia (`recoverDay`, abaixo), moldada por idade/carga/stamina, em
vez de um bônus fixo aplicado no instante do apito final. Quem não jogou não muda nesse dia.

### Recuperação diária

```
fôlego += (100 − fôlego) × taxa
taxa = RECOVERY_BASE (0,45) × fatorIdade × fatorCarga × fatorStamina

fatorIdade   : ≤24 → 1,10  · ≤28 → 1,00  · ≤32 → 0,85  · >32 → 0,70
fatorCarga   = 1 − 0,5 × min(1, carga / LOAD_HIGH)              // LOAD_HIGH = 220
fatorStamina = 0,90 + 0,20 × stamina/10
```

`RECOVERY_BASE` subiu de 0,35 para 0,45 durante o balanceamento desta tarefa — na curva de exemplo
do design (26 anos, carga 0, stamina 7, saindo de 55 pós-jogo), um valor por dia de folga:

| `RECOVERY_BASE` | dia 1 | dia 2 | dia 3 | dia 4 |
|---|---|---|---|---|
| 0,35 (original) | 71,4 | 81,8 | 88,4 | 92,6 |
| 0,45 (atual) | 76,1 | 87,3 | 93,2 | 96,4 |

Um time de calendário apertado recuperava devagar demais entre jogos mesmo com carga moderada; 0,45
foi o valor escolhido depois do re-sweep do `BENCH_SWAP_RATIO` (ver "Escalação da IA" abaixo).

Num **dia de jogo do clube**, quem jogou não passa por `recoverDay` nesse dia (seu fôlego já é o
`postMatchFitness` calculado pelo pós-jogo); quem ficou no banco/reserva sem entrar em campo
**recupera normalmente nesse mesmo dia**, pela mesma curva de um dia de folga — corrigido durante o
balanceamento (`fix(fitness): non-playing squad members recover on match day`), porque antes disso o
laço de treino/descanso do `advanceDay` pulava o clube inteiro sempre que ele tinha uma partida no
dia, deixando reservas sem recuperar até o próximo dia livre. Hoje `finalizeSquadsAfterMatch`
(`src/Domain/advanceDay/matches.ts`) já cobre os dois casos — quem jogou (`postMatchFitness`) e quem
não jogou (`recoverDay`) — dentro do mesmo pós-jogo, e o laço diário de `advanceDay.ts` só cuida dos
clubes que **não** tiveram partida nenhuma naquele dia.

### Treino

O custo de uma sessão escala com o próprio fôlego do jogador (`custo_efetivo = custo_base ×
fôlego/100`) — um jogador já desgastado tem menos fôlego para perder, então a mesma sessão o afeta
proporcionalmente menos em valor absoluto. Abaixo de `min_energy_to_train` (config do clube, padrão
`DEFAULT_MIN_ENERGY_TO_TRAIN`) o jogador não treina: só recupera pela curva de descanso
(`recoverDay`), como se fosse um dia de folga. Uma sessão pesada (`intensity: "heavy"`) soma
`HEAVY_TRAINING_LOAD` (10) de carga; leve/normal não somam carga nenhuma.

### Carga

```
carga(dia seguinte) = carga × e^(−ln2 / LOAD_HALF_LIFE_DAYS)     // meia-vida 4 dias
```

Uma partida soma os minutos jogados (até 120 na prorrogação) à carga, sempre depois de aplicar a
meia-vida do dia (decai primeiro, soma depois). `LOAD_HIGH ≈ 220` (≈ 3 jogos completos em ~7 dias) é
onde os efeitos de carga saturam:

- **Recuperação:** `fatorCarga = 1 − 0,5 × min(1, carga/LOAD_HIGH)` — até metade mais lenta.
- **Gasto em campo:** `drainMultiplier(carga) = 1 + 0,25 × min(1, carga/LOAD_HIGH)` — até 25% mais
  rápido. Motor: fator por jogador aplicado no início da partida (`consumeEnergy`, ver "Motor"
  abaixo). quickSim: multiplica o desgaste por linha (ver "quickSim" abaixo).

O ícone de carga alta na UI (`LoadIndicator`) acende a partir de 70% de `LOAD_HIGH`
(`HIGH_LOAD_THRESHOLD`, `src/GameInterface/playerHelpers.ts`).

### Energia de início comprimida (`matchStartEnergy`)

O fôlego salvo (`seasonLog.fitness`) **não** vira a energia de início da partida direto — passa por:

```
matchStartEnergy(fôlego) = FITNESS_REF + START_COMPRESSION × (fôlego − FITNESS_REF)   [travado 0..100]

FITNESS_REF = 88          // fôlego típico de um dia de jogo sem congestionamento
START_COMPRESSION = 0,4   // 1 = sem compressão; 0 = toda partida começa em FITNESS_REF
```

`matchStartEnergy(88) === 88` sempre, qualquer que seja `START_COMPRESSION` — uma partida com os
dois lados no fôlego de referência começa **exatamente igual a antes desta mudança**, por
construção, não por calibração. Uma diferença de fôlego entre dois times fica menor no apito
inicial (ex.: 90 × 70 vira 89,2 × 79,2), mas o desgaste em campo e a curva de fadiga em si continuam
idênticos — só o ponto de partida é puxado em direção à referência. O fôlego pós-jogo continua
sendo simplesmente a energia final (`postMatchFitness`), calculada a partir desse início já
comprimido.

**Por que a compressão, e não a curva:** uma tentativa anterior tentou amaciar a própria curva de
fadiga do motor (reduzir o teto de redução, mudar a potência da curva) para diferenciar melhor dois
fôlegos de início próximos sem exagerar no extremo. Toda tentativa testada melhorava a
sensibilidade a diferenças de fôlego só à custa de inflar o volume de gols de um confronto
**simétrico** (dois lados no mesmo fôlego) em 4–45%, dependendo da curva — inaceitável, porque isso
muda o placar que o jogador vê num jogo comum, não só em cenários de fadiga extrema. Nenhuma família
de curva testada escapou desse acoplamento (nem variar só a potência, nem só o teto, nem uma curva
logística em "joelho"). A curva do motor foi então **revertida para os valores originais**
(`FATIGUE_MAX_REDUCTION_PHYSICAL = 0,55`, `_SEMI = 0,35`, `_TECH = 0,20`,
`FATIGUE_CURVE_POWER = 0,75`) e a compressão da energia de início (`matchStartEnergy`) foi
implementada em cima, porque ela comprime a diferença **relativa** entre os dois times sem tocar a
curva de cada jogador individualmente — a garantia "confronto simétrico = placar inalterado" vale
por construção (`matchStartEnergy(FITNESS_REF) === FITNESS_REF`), não por medição. Ver
`.claude/rules/non-player-games.md` → "Fadiga" para a grade completa de curvas testadas, os números
da calibração de `START_COMPRESSION` (0,3 / 0,4 / 0,5) contra quatro cenários de saldo de gols, e por
que `0,4` foi escolhido.

Usado em três lugares, sempre a mesma função:

- **Motor** (`gameState.ts`): energia de início dos titulares e do banco.
- **quickSim** (`quickSim.ts`, `startFitness`): base do desgaste em campo E do desconto de força
  (`fitnessFactor`).
- **Seletor de escalação** (`lineupHelpers.ts`, `fitnessAdjustedValue`): valoriza titular e reserva
  pelo fôlego comprimido, porque é o que a partida vai realmente jogar.

Sem `seasonLog` (um jogador de save antes do primeiro avanço de dia, ou um elenco estático sem
histórico), os três lugares usam o mesmo piso: `emptySeasonLog().fitness` (75), então a energia de
início cai em `matchStartEnergy(75) ≈ 82,8` — **não** 100 puro. Antes disso o motor (`gameState.ts`)
tinha um caminho próprio (energia de início = 100 direto, sem passar por `matchStartEnergy`) que
divergia do quickSim e do seletor de escalação; corrigido para os três caírem no mesmo piso.

**`/test` (`TestCases.ts`) é a exceção deliberada.** Os cenários gerais de ajuste de motor
(`11v11-classic`, `knockout-draw-90`, `tired-team`) existem para observar carry/passe/desarme/etc.
isoladamente, não o sistema de fôlego — por isso o roster `team_red`/`team_blue` passa por
`freshRoster()` antes de `createMatchState`, fixando `seasonLog.fitness: 100` explicitamente (sem
compressão, já que `matchStartEnergy(100) = 100`). O seletor livre de elenco do `/test`
(`TestScreen.tsx`, times "Team Red"/"Team Blue" via `SQUADS`) **não** recebe esse tratamento e cai
no piso de 75/82,8 como qualquer elenco sem `seasonLog` — aceito porque afeta os dois lados
igualmente (comparação A/B continua justa), só a intensidade absoluta de fadiga ao longo da
partida muda um pouco.

## 2. Motor

- **`consumeEnergy(energy, stamina, action, dtGame, loadDrainMultiplier)`**
  (`RuntimeLineup.ts`): `custo = STAMINA_COST[ação] × (1 − stamina×0,05) × dtGame ×
  loadDrainMultiplier`. `loadDrainMultiplier = drainMultiplier(seasonLog.load)` — 1 sem carga
  acumulada, até 1,25 em `LOAD_HIGH`, calculado uma vez no início da partida e carregado em
  `GamePlayer.drainMultiplier` (default 1 para quem não tem `seasonLog`, ex. jogadores de teste).
- **Fadiga contínua** (`applyContinuousFatigue`): antes, `runtimeStats` só era recalculado em
  degraus de 10/20/40 pontos de energia perdida. Agora `getRuntimeLineup` já é contínuo por si só;
  `FATIGUE_RECOMPUTE_THRESHOLD = 1` só controla a frequência do recompute (caro), não mais o
  formato da curva — recalcula assim que a energia se move ≥ 1 ponto desde o último baseline
  (`fatigueBaselineEnergy`), senão devolve a mesma referência de `runtimeStats` sem custo.
- **`stamina`** (atributo bruto do elenco, 0–10, não convertido em stat do motor — ver
  `.claude/rules/game-engine/player-stats-usage.md`) entra em três pontos:
  1. Custo em campo (`consumeEnergy`, acima) — 0% de redução em stamina 0, 50% em stamina 10.
  2. Recuperação do intervalo (`switchSides`, `gameState.ts`): `taxa = (0,30 + stamina/10 × 0,30) ×
     recoveryScale` — 30% do gap até `startEnergy` (não até 100 — o teto é a energia com que o
     jogador começou a partida) em stamina 0, 60% em stamina 10. `recoveryScale` é 1 no intervalo
     normal, 0,5 na pausa antes da prorrogação (`ET_BREAK_RECOVERY_SCALE`) e 0 entre os dois tempos
     da prorrogação (ver `.claude/rules/match-flow.md`).
  3. Recuperação diária (`staminaRecoveryFactor`, `fitness.ts`) — ver "Modelo" acima.

## 3. quickSim

O quickSim não simula tick a tick — desgasta o XI inteiro de uma vez, por linha, no fim da
partida (`quickSim.ts`):

```
startEnergy = matchStartEnergy(fôlego)          // mesma função do motor
drain = ENERGY_DRAIN_BY_LINE[linha]
      × (1,2 − 0,4 × stamina/10)
      × drainMultiplier(carga)
      × extraTimeMult                            // 4/3 se houve prorrogação, senão 1
fôlego pós-jogo = clamp(startEnergy − drain, 0, 100)
```

`ENERGY_DRAIN_BY_LINE` (`QuickSimConfig.ts`): `GK 38,1 · DEF 53,5 · MID 48,3 · FWD 52,1` — calibrado
por `scripts/fatigue-calibrate.ts` para ficar a ±10% do desgaste médio por linha do motor completo
sobre centenas de partidas.

O mesmo `startFitness` (energia comprimida) também entra no desconto de força de um XI cansado:

```
fitnessFactor(jogador) = 1 − FATIGUE_PENALTY × (1 − startFitness/100)     // FATIGUE_PENALTY = 0,3
```

`FATIGUE_PENALTY` foi reconferido depois da compressão e **mantido em 0,3**: a própria compressão já
encolheu bastante o gap fresco×cansado do motor (V/E/D do lado fresco foi de 90%/7,8%/2,2%, sem
compressão, para 65,6%/15,8%/18,6% com `START_COMPRESSION = 0,4`), e variar `FATIGUE_PENALTY` de 0,3
a 1,8 só move a vitória do lado fresco de 42% a 50,9% — pouco ganho para o custo de volume de gols
que qualquer valor acima de 0,3 impõe a um confronto de fôlego **igual** a 88 (esse custo não muda
com a compressão, porque `matchStartEnergy(88) = 88` sempre). Ver `.claude/rules/non-player-games.md`
→ "Fadiga" para os números completos.

**Volume de gols recalibrado a fôlego real (~88), não 75.** Todo elenco estático (sem `seasonLog`)
usa o fôlego padrão de `emptySeasonLog()` (75) — mas um dia de jogo de verdade fica perto de 88–90.
`BASE_GOALS`, `HOME_ADVANTAGE`, `STRENGTH_EXPONENT`, `LEVEL_EXPONENT` e `PACE_EDGE_WEIGHT`
(`QuickSimConfig.ts`) foram reajustados contra dados coletados a fôlego 88 (rms por liga 25,1% →
5,9%, pior liga `la_liga` +9,8%, dentro de ±10% nas 10 ligas testadas). Ver
`.claude/rules/non-player-games.md` → "Fadiga" → "Volume de gols do quickSim" para a tabela completa
de antes/depois.

## 4. Escalação da IA (`src/Domain/lineupHelpers.ts`)

`autoFillLineupWithFitness(slots, players)` — usado pela IA (partida ao vivo, `matchSimulationLineups`,
quickSim, adversário da prévia, continental) **e** pelo botão "auto" da tela de formação do jogador
quando o clube nunca salvou uma escalação:

1. Parte do resultado de `autoFillLineup` (mesma lógica de preenchimento) — um elenco 100% em forma
   devolve exatamente a mesma escalação.
2. Para cada vaga cujo titular tem `fôlego < TIRED_FITNESS_THRESHOLD` (75), procura o melhor reserva
   da mesma posição (mesma regra de elegibilidade do preenchimento normal) ranqueado por
   `fitnessAdjustedValue`.
3. `fitnessAdjustedValue(jogador, vaga) = Player.weightedScore(...) × overallEnergyFactor(
   matchStartEnergy(fôlego)) / drainMultiplier(carga)` — valoriza os dois lados pelo fôlego **que o
   motor realmente vai jogar** (comprimido), com um desconto extra por carga alta (quem está com
   carga alta vai desgastar mais rápido que o fôlego de hoje sozinho sugere).
4. O reserva só assume se `valorReserva ≥ valorTitular × BENCH_SWAP_RATIO (1,17)` — precisa ser
   **melhor**, não só perto. Com o gatilho de elegibilidade sozinho, quase qualquer titular
   claramente cansado perdia tanto valor pela curva de fadiga do motor que uma razão abaixo de ~1
   quase não filtrava nada, girando o elenco da IA demais numa sequência apertada.

**Vaga de goleiro isenta por padrão.** Só entra na troca se o titular cair abaixo de
`GK_TIRED_FITNESS_THRESHOLD = 60` (bem abaixo do limiar de linha) **e** existir um reserva com
fôlego ≥ `GK_BENCH_FITNESS_FLOOR = 85`. Poupar um goleiro no meio de semana é uma decisão maior que
poupar um jogador de linha.

**`BENCH_SWAP_RATIO` — histórico do ajuste:** `0,85` (inicial) → `1,3` (revert temporário, sem
`matchStartEnergy`, girava demais) → **`1,17`** (final, com a compressão em vigor). A compressão
estreita bastante o gap de valor entre um titular cansado e um reserva fresco (os dois são puxados
para perto de `FITNESS_REF`), então `1,3` sozinho quase parou de girar o elenco. Reajustado com um
script de varredura (8 partidas a cada 3 dias, elencos reais de `premier_league`/`of_championship`)
contra `START_COMPRESSION = 0,4`: `1,17` deixa uma sequência congestionada em **~2,8–3,1 titulares
trocados por partida** (dentro do alvo 2–3,5) e uma semana normal em **~0**, mantendo o teste de
integração `src/backend/fitness.congestion.test.ts` (3 jogos em 7 dias → pelo menos 1 titular poupado
no 3º jogo) passando.

## 5. Telas

- **Formação, prévia, elenco:** barra de fôlego + `LoadIndicator` (ícone de carga alta, ≥ 70% de
  `LOAD_HIGH`). `MatchPreviewScreen` avisa quando um titular do próprio XI está com fôlego < 70
  (`LOW_FITNESS_THRESHOLD`), listando nome + fôlego numa linha de aviso acima dos botões de ação.
- **Resumo do dia (`DaySummaryModal`):** eventos de treino e descanso mostram o fôlego recuperado
  (ou gasto) do dia, rotulado por faixa (ex. "fatigado" abaixo de um limiar).

## 6. `/test`

- **`EnergyPanel`** (botão "Energy" no `TestScreen`): energia por jogador ao vivo, ambos os times.
- **Cenário `tired-team`** (`src/GameEngine/Suport/TestCases.ts`): Time A começa em 60 de energia
  com o multiplicador de drenagem derivado de `FITNESS.LOAD_HIGH` (Time B fresco) — titulares E
  banco, porque um reserva que entra no meio de um calendário apertado chega tão cansado quanto o
  XI. Serve para observar o Time A cair de rendimento e a IA fazer substituições por fadiga.

## 7. `/lab`

**Congestão** (`ScenarioBuilder.tsx`, checkbox "Congestion"): N partidas seguidas (padrão 3) com K
dias de descanso entre elas (padrão 2), aplicando as funções de fôlego/carga puras
(`recoverDay`/`decayLoad`) entre uma partida e a próxima — a escalação em si não é re-sorteada a
cada jogo da sequência, só o fôlego/carga de cada jogador nomeado é que muda. `balanceWorker.ts`
agrega cada jogo da sequência separadamente (`CongestionMatchRaw`), então o `PairDetail` mostra a
queda de rendimento (vitórias, gols, xG) jogo a jogo dentro da sequência, além da energia final e
das substituições por fadiga (ver Estatísticas abaixo).

## 8. Estatísticas (`src/GameEngine/Domain/Statistics.ts`)

- **`avgEndEnergy`** — energia média no fim da partida, só entre quem realmente jogou (titulares +
  entraram como substitutos), não o elenco inteiro.
- **`fatigueSubstitutions`** — contagem de substituições feitas com `reason === "fatigue"`.

Os dois alimentam tanto o `StatsPanel` ao vivo quanto o `simulateMatch` headless que o `/lab` agrega
(`avgEndEnergySum`/`fatigueSubstitutions` em `balanceWorker.ts`/`scenarioRunner.ts`, expostos como
`avgEndEnergy`/`avgFatigueSubs` no `PerMatchView`/`VariantSummary`). O quickSim nunca substitui (não
tem banco simulado), então `fatigueSubstitutions` fica em 0 para esse motor.

## Smoke de temporada (`scripts/season-rollover-smoke.ts`, seção "Fôlego")

Em cada dia em que o clube do jogador tem partida na própria liga, o smoke lê — **antes** de
`runBufferedDay` rodar o dia (ou seja, o fôlego ainda é o de ontem, o que a escalação vai realmente
usar) — a escalação com fôlego (`autoLineupDefaultFormationWithFitness`) de todo clube da IA
envolvido em qualquer partida da liga do jogador naquele dia (a rodada inteira, não só o próprio
jogo), e separadamente a média de fôlego do XI do adversário direto daquele dia. Ao final:

- Média da temporada (juntando as duas séries) dentro de 55–95 — falha o smoke se não estiver.
- Variação mensal ≥ 2 pontos entre o mês de maior e o de menor média — **informativo**: se não
  variar o suficiente (mundo "travado"), o smoke só imprime uma nota, não falha (a viagem entre
  temporadas pode legitimamente ter um período mais parado, ex. only a handful of matchdays num mês
  do calendário europeu).
- Pelo menos um clube da IA, em algum momento da temporada, jogou com um XI diferente do
  `autoFillLineup` puro por causa do fôlego (compara o XI do seletor ciente de fôlego contra o
  preenchimento simples, como conjuntos de ids) — falha se nunca acontecer.
- Nenhum `seasonLog.fitness` fora de 0..100 em nenhum clube do mundo, ao final da corrida — falha
  se encontrar.
- Nenhum `seasonLog.load` negativo em nenhum clube do mundo, ao final da corrida — falha se
  encontrar.

Rodar: `bun scripts/season-rollover-smoke.ts` (mesmo comando do smoke de virada de temporada — a
seção "Fôlego" roda dentro da mesma corrida, sem flag própria).

## Limitações conhecidas

- **Cenário brando (95×80, carga 90 no lado cansado) fica acima do alvo.** Mesmo depois da
  compressão da energia de início, esse cenário específico mede saldo de gols de ~+0,5–0,6 contra um
  alvo de +0,2 a +0,35 — a carga (que não é comprimida por desenho, só o fôlego é) já produz sozinha
  uma diferença de desgaste em campo independente de quão perto os dois fôlegos de início estejam.
  Nenhum `START_COMPRESSION` testado (0,3 a 0,5) resolve esse cenário sem piorar os outros três
  (90×70, 90×50/carga200, controle 90×90) — aceito como limitação conhecida, não uma regressão desta
  tarefa. Ver `.claude/rules/non-player-games.md` → "Fadiga" para a tabela completa da varredura.
- **O gap fresco×cansado do quickSim é mais estreito que o do motor.** Depois da compressão, um
  confronto fresco (100/carga 0) × cansado (70/carga alta) no motor dá 65,6%/15,8%/18,6% (V/E/D do
  lado fresco); o quickSim com `FATIGUE_PENALTY = 0,3` dá 42%/22,1%/35,9% no mesmo cenário — um gap
  de ~24 pontos percentuais na taxa de vitória do lado fresco. Subir `FATIGUE_PENALTY` fecha esse
  gap lentamente (até 50,9% em 1,8) mas custa volume de gols num confronto de fôlego igual a 88, e
  o ganho marginal não foi considerado suficiente para justificar o custo — mantido em 0,3.
- **Volume de gols do quickSim por liga:** depois da recalibração a fôlego 88, as 10 ligas testadas
  (`premier_league`, `la_liga`, `bundesliga`, `brazil_serie_a`, `of_championship`, `of_allsvenskan`,
  `of_eredivisie`, `of_kenyan_premier_division`, `of_liga_mx`, `of_turkish_super_league`) ficam
  todas dentro de ±10% do motor; `of_allsvenskan` não é um outlier nessa rodada (a pior é
  `la_liga`, +9,8%). Se uma recalibração futura do motor mover esse número de novo, o processo é o
  mesmo descrito em `.claude/rules/non-player-games.md` → "Fadiga" → "Volume de gols do quickSim".
