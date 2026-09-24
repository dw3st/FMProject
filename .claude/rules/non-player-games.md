# Feature: Non-Player Match Simulation (Simple Mode)

## Business Rules

• The system must support simulating matches where **no human is watching**.

• Non-player matches must use the **same simulation engine** used for playable matches.

• Non-player matches must simulate the **same match duration** (45 + 45 + stoppage time).

• Non-player matches must generate the **same events** as playable matches.

• Statistics must be generated exactly the same way as in playable matches.

• Player statistics and player ratings must be produced normally.

• Non-player simulations must **not render graphics**.

• Non-player simulations must **not play animations**.

• Non-player simulations must **not wait for real-time clocks**.

• The match must run **as fast as possible** while keeping deterministic results.

• The final result must include:

• final score
• team statistics
• player statistics
• player ratings

• The simulation must return results only **after the match finishes**.

• The system must remain simple and easy to expand later.

---

# Implementation Guidelines

## Simulation Mode

Add a simulation mode flag.

Example:

```ts
SimulationMode =
  "interactive"
  "nonPlayer"
```

Interactive mode:

• real-time clock
• rendering
• animations
• UI updates

Non-player mode:

• no rendering
• no animations
• no presentation events

---

## Disable Visual Systems

When running a non-player simulation skip:

• Pixi rendering
• camera updates
• goal animations
• start/half/end animations
• UI updates

The engine should only run:

• player logic
• ball logic
• match clock
• event emission
• statistics collection

---

## Fast Engine Loop

Instead of waiting for frame updates, run the engine loop continuously.

Example:

```ts
while (!matchFinished) {
  simulateTick()
}
```

This allows the match to complete **very quickly**.

---

## Clock Handling

The same match clock logic must be used.

Example:

```
First half: 0 → 45 + extraTime
Second half: 45 → 90 + extraTime
```

But instead of waiting for real time, the simulation advances immediately.

Example tick:

```ts
gameTime += simulationStep
```

---

## Simulation Step

Use a fixed simulation step.

Example:

```
simulationStep = 0.2 seconds of game time
```

This keeps behavior identical to playable matches.

---

## Statistics Collection

Reuse the same event system.

Example:

```ts
gameBus.emit("passCompleted", {...})
gameBus.emit("shot", {...})
gameBus.emit("goalScored", {...})
```

The statistics collector listens normally.

---

## Match Result Object

At the end of the simulation return a result object.

Example structure:

```ts
MatchResult {
  score: { A: number, B: number }

  teamStats: {...}

  playerStats: {...}

  playerRatings: {...}
}
```

---

## Example Usage

```ts
const result = simulateMatch(teamA, teamB)
```

Possible output:

```
Team A 2 - 1 Team B

Shots: 14 - 9
Possession: 55% - 45%

Top Player Rating: 8.3
```

---

## Expected Performance

Without rendering or real-time delays a match should simulate in roughly:

```
5–30 milliseconds
```

depending on engine complexity.

---

## Future Improvements

Later the system can add:

• Web Worker execution
• batch match simulation
• coarser simulation steps for faster league simulations
• parallel simulations

But for now the goal is **simple, correct, and identical to the playable engine**.

---

## quickSim (ligas não seguidas)

As ligas que o jogador não acompanha não rodam o motor tick a tick. Quem resolve a partida é
`quickSimMatch` (`src/Domain/advanceDay/quickSim.ts`): calcula a força de cada setor, gera o xG
e sorteia os gols com uma binomial (`GOAL_CHANCES`), aplicando o fator de domínio
`DOMINANCE_SIGMA`. O resultado é um `PlayedMatchRecording`, e o pós-jogo (seasonLog, energia,
desenvolvimento) é o mesmo do motor.

- **Modo:** definido por `resolveSimMode` (`simMode.ts`). Usam o motor completo a liga do
  jogador e até 3 `followedLeagues`. As partidas do clube do jogador são sempre no motor completo.
- **Log do dia:** os eventos saem com `compact: true`, sem estatísticas por jogador.
- **Constantes:** ficam em `QuickSimConfig.ts`. Para calibrar, rode
  `bun scripts/quicksim-calibrate.ts <liga> <pares> <repetições>`; a meta é ficar a ±10% do motor.
  Use `QS_QUICK_REPEATS=50` para reduzir o ruído do quickSim e `QS_ENGINE_CACHE=<arquivo>` para
  reaproveitar as partidas do motor entre execuções.
- **Custo medido:** o motor leva ~0,6–0,9 s por partida; o quickSim, ~0,04 ms.
- **Onde aparece:** no `/lab`, escolha "quickSim" no ScenarioBuilder. No `/test`, clique no
  botão "QuickSim".

### Limitações conhecidas (calibração de 2026-09-23)

- **Volume de gols (recalibrado em 2026-09-24, 26 ligas, motor com `PASS_STRONG_RAW = 0.8`):**
  `xG = BASE_GOALS × ratio^STRENGTH_EXPONENT × (nível/LEVEL_REF)^LEVEL_EXPONENT × e^(PACE_EDGE_WEIGHT × paceEdge) × mando`.
  - `ratio = (ataque × meio) / (defesa × goleiro)`. O nível do jogo é a média do `teamLevel` dos
    dois times, e `teamLevel` é a média das 4 linhas.
  - `paceEdge = forwardPace(atacante) − defensePace(defensor)`: média de pace da linha de ataque
    (LW/ST/RW…) menos a da linha de defesa adversária (CB/LB/RB/WB), com
    `pace = (3·speed + acceleration) / 4` em atributos crus 0–10. É a escala do sprint do motor
    (≈ 5 + 0,45·speed + 0,15·acceleration jardas/s).
  - `ATTACK_KEYS` perdeu `finishing` (agora `dribbling, speed, acceleration`). No motor, a
    finalização só mexe na conversão (`shooterEffect` 0,85–1,2). No quickSim ela continua
    escolhendo quem marca (`fillSide`).
  - Valores: `BASE_GOALS = 0.74`, `STRENGTH_EXPONENT = 0.54`, `LEVEL_EXPONENT = 0.8`,
    `PACE_EDGE_WEIGHT = 0.26`, `HOME_ADVANTAGE = 1.07` (antes 0.78 / 1.0 / 1.1 / — / 1.06).
  - **O que explica o espalhamento:** a vantagem de velocidade dos atacantes sobre os zagueiros
    adversários. Nas 5 grandes (nível ~5,1 em todas) o `paceEdge` médio vai de +0,10 (Bundesliga,
    1,74 gol/jogo no motor) a +0,94 (Premier, 2,54). Numa regressão de Poisson jogo a jogo sobre
    o resíduo do quickSim, os dois primeiros termos escolhidos entre ~120 atributos por linha
    foram `FWD.speed` (próprio) e `DEF.speed` (adversário), com sinais opostos. Nada de finishing,
    goleiro, drible × desarme ou formação (as IAs jogam todas no 4-3-3). O efeito é no volume de
    chances: r = 0,39 com chutes e 0,41 com o xG do motor, mas só 0,11 com gols por chute. Isso
    bate com as corridas de through ball, decididas pelo sprint. O termo apareceu igual antes e
    depois da mudança de passe do motor (0,275 e 0,26).
  - **Validação fora da amostra:**
    - ajustado sem as 5 grandes, prevê as 5 grandes com rms de 6,9% (pior 10,1%), contra 14,4%
      (pior 25%) sem o termo;
    - com 8 ligas `of_*` de fora, as ligas de fora ficam com rms de 6,5% (pior 14,7%).
    - Com um expoente por linha, o goleiro fica em ~0,27–0,38 (não zera), mas o rms cai pouco
      (6,0% contra 6,3%), então ficou a fórmula de um termo. Somar um termo de `finishing` não
      melhora o rms por liga e derruba o `LEVEL_EXPONENT` para 0,2 (colinear), então foi descartado.
  - **Resultado (26 ligas, 400 jogos de motor cada):** rms 10,8% → 6,5%, pior liga 27% → 12%.
    Notas por linha seguem dentro das metas (Premier, Bundesliga, Ekstraklasa, Quênia). Casa/empate/fora
    batem na Bundesliga e no Quênia; na Premier o empate fica 3 p.p. abaixo (25,5% × 28,5%).

    | Liga | motor | quick antes | erro antes | quick depois | erro depois |
    |---|---|---|---|---|---|
    | premier_league | 2,54 | 2,05 | −19,3% | 2,31 | −9,4% |
    | serie_a | 1,99 | 1,78 | −10,5% | 2,01 | +0,9% |
    | la_liga | 2,04 | 2,02 | −0,7% | 2,09 | +2,9% |
    | ligue_1 | 1,91 | 1,83 | −3,8% | 2,09 | +9,5% |
    | bundesliga | 1,74 | 1,73 | −0,2% | 1,64 | −5,7% |
    | brazil_serie_a | 1,66 | 1,51 | −8,9% | 1,62 | −2,4% |
    | brazil_serie_b | 1,16 | 1,12 | −4,1% | 1,25 | +7,3% |
    | brazil_serie_c | 0,92 | 0,81 | −12,2% | 0,94 | +1,8% |
    | of_ekstraklasa | 0,99 | 1,15 | +15,7% | 1,11 | +11,4% |
    | of_championship | 1,23 | 1,32 | +7,9% | 1,34 | +9,3% |
    | of_allsvenskan | 0,88 | 0,97 | +9,8% | 0,99 | +12,1% |
    | of_argentine_premier_division | 1,45 | 1,43 | −1,3% | 1,38 | −4,3% |
    | of_danish_superliga | 1,10 | 1,13 | +3,0% | 1,11 | +0,7% |
    | of_eredivisie | 1,33 | 1,46 | +9,7% | 1,37 | +2,6% |
    | of_greek_super_league | 1,04 | 1,00 | −3,7% | 1,07 | +2,4% |
    | of_italian_serie_c_a | 0,76 | 0,71 | −6,8% | 0,79 | +4,6% |
    | of_j_league | 1,13 | 1,03 | −8,7% | 1,06 | −6,4% |
    | of_kenyan_premier_division | 0,64 | 0,47 | −26,8% | 0,58 | −9,2% |
    | of_liga_mx | 1,42 | 1,44 | +1,4% | 1,41 | −0,8% |
    | of_major_league_soccer | 1,20 | 1,22 | +1,9% | 1,21 | +1,5% |
    | of_portuguese_primeira_liga | 1,43 | 1,32 | −7,1% | 1,38 | −3,3% |
    | of_russian_second_division_b_group_2 | 0,55 | 0,40 | −27,1% | 0,49 | −11,1% |
    | of_saudi_professional_league | 1,05 | 1,14 | +8,2% | 1,11 | +5,7% |
    | of_spanish_second_division | 1,30 | 1,29 | −0,8% | 1,28 | −1,2% |
    | of_turkish_super_league | 1,25 | 1,33 | +6,2% | 1,23 | −1,8% |
    | of_uzbek_super_league | 0,65 | 0,68 | +4,9% | 0,71 | +9,3% |

  - **Resíduos revisitados (2026-09-24, caches novos de 400 jogos, 26 ligas):** o "Ainda sobra"
    anterior (Premier −9%, Allsvenskan +12%, Ekstraklasa +11%) era em parte ruído de cache: com
    caches novos do mesmo motor deram −7,1%, +4,9% e +12,9%, e apareceram outros do mesmo tamanho
    (Argentina −9%, Eredivisie −8%, Turquia −8%).
    - **Quase tudo é ruído do motor.** O rms por liga (6,0%) fica perto do piso de ruído do
      motor (4,7%, só Poisson), então o erro real do modelo é ~3,6%.
    - **Forma do termo de pace:** testada com validação deixando uma liga de fora (seção 9 do
      `analyze`, fórmula inteira reajustada). Nenhuma forma ganha fora da amostra: linear 6,4%,
      quadrático 6,6% (β² ≈ −0,02), saturado `w·tanh(edge/w)` com w = 1/2/3 6,4%, pace+/pace−
      separados 6,7%. Nenhum candidato com mecanismo ajuda (drible × desarme, visão/passe do MID,
      pace do MID adversário, reflexo do goleiro: 6,3–6,5%), e nível² piora (7,3%). O stepwise
      por jogo só acha ruído (`FWD.finishing`, +17 de logLik em 20.800 lados, rms igual).
  - **Motor com o meio-campo como eixo de passe (commit `a341233`):** o volume de gols quase não
    mudou no agregado (gols/lado 0,639 → 0,656), mas mexeu em ligas de nível igual em sentidos
    opostos (Bundesliga 1,56 → 1,88, Serie A 1,94 → 1,83). Nenhum atributo explica isso: as duas
    ligas têm nível e `paceEdge` quase iguais. O reajuste da fórmula inteira contra o motor novo
    só baixa o rms de 6,5% para 6,2% dentro da amostra (pior 12,9% → 13,2%), e nenhuma forma de
    pace ganha fora da amostra (linear 7,0%, saturado w = 1 6,6%). Por isso **o modelo de gols
    ficou como estava**. Erro por liga, com as mesmas constantes:

    | Liga | motor antigo | erro | motor novo | erro |
    |---|---|---|---|---|
    | premier_league | 2,48 | −7,1% | 2,44 | −5,4% |
    | serie_a | 1,94 | +3,6% | 1,83 | +9,9% |
    | la_liga | 2,01 | +4,3% | 2,13 | −1,7% |
    | ligue_1 | 1,93 | +8,2% | 2,12 | −1,7% |
    | bundesliga | 1,56 | +4,7% | 1,88 | −12,9% |
    | brazil_serie_a | 1,69 | −4,4% | 1,72 | −5,9% |
    | brazil_serie_b | 1,18 | +5,5% | 1,22 | +2,2% |
    | brazil_serie_c | 0,94 | +0,2% | 0,88 | +7,1% |
    | of_ekstraklasa | 0,98 | +12,9% | 1,04 | +5,8% |
    | of_championship | 1,25 | +6,7% | 1,26 | +6,3% |
    | of_allsvenskan | 0,94 | +4,9% | 0,94 | +5,2% |
    | of_argentine_premier_division | 1,52 | −9,2% | 1,55 | −10,9% |
    | of_danish_superliga | 1,07 | +3,3% | 1,12 | −1,3% |
    | of_eredivisie | 1,49 | −8,1% | 1,54 | −11,1% |
    | of_greek_super_league | 1,02 | +4,9% | 0,98 | +8,6% |
    | of_italian_serie_c_a | 0,74 | +6,7% | 0,79 | +0,3% |
    | of_j_league | 1,09 | −3,4% | 1,10 | −3,8% |
    | of_kenyan_premier_division | 0,60 | −3,2% | 0,61 | −4,4% |
    | of_liga_mx | 1,40 | +0,7% | 1,39 | +1,7% |
    | of_major_league_soccer | 1,15 | +5,3% | 1,20 | +1,1% |
    | of_portuguese_primeira_liga | 1,41 | −2,1% | 1,50 | −8,2% |
    | of_russian_second_division_b_group_2 | 0,53 | −6,9% | 0,56 | −11,9% |
    | of_saudi_professional_league | 1,07 | +3,9% | 1,12 | −0,7% |
    | of_spanish_second_division | 1,22 | +5,7% | 1,27 | +1,2% |
    | of_turkish_super_league | 1,34 | −8,0% | 1,25 | −1,4% |
    | of_uzbek_super_league | 0,68 | +4,8% | 0,68 | +5,2% |

    O quickSim não muda entre as colunas (1,62 … 2,31). rms 6,0% → 6,5% (piso de ruído 4,7%).
    Além de 2σ no motor novo: Bundesliga −12,9%, Argentina −10,9%, Eredivisie −11,1%, Serie A +9,9%.
  - **Como recalibrar** (depois de qualquer mudança no motor):
    1. `bun scripts/quicksim-spread.ts collect <liga> 200 2 <dir>/<liga>.json` para um conjunto
       variado de ligas nativas **e** `of_*`. Cada liga leva ~5 min, então rode várias em paralelo.
       O cache guarda cada jogo (ids, placar, chutes, xG).
    2. `bun scripts/quicksim-spread.ts analyze <dir> [--holdout a,b]` mostra o erro por liga com
       as constantes atuais, as correlações e o stepwise do resíduo, e os candidatos com mecanismo.
       A seção 8 reajusta a fórmula inteira (`c`→`BASE_GOALS = e^c`, `home`→`HOME_ADVANTAGE = e^h`,
       `ratio`, `level`, `pace`) direto nas unidades de `QuickSimConfig`.
    3. `quicksim-calibrate.ts` continua valendo para placares, casa/empate/fora e notas.
    4. `bun scripts/quicksim-spread.ts events <dir> --apply` (3 vezes) recalibra os eventos por vaga
       e as notas (ver "Eventos por vaga de titular" abaixo).
- **Contagem de passes do motor (corrigida em 2026-09-24):** o through ball emitia
  `passAttempted` sem nunca emitir `passCompleted`/`passFailed`, o que derrubava o aproveitamento
  para ~47%. Agora ele só conta na família própria (`throughBalls*`), e todo `passAttempted`
  termina em `passCompleted` ou `passFailed`, garantido por `SimulateMatch.test.ts`.
  - **O volume baixo é real, não bug:** o relógio é comprimido, e a partida tem ~7 min de jogo
    efetivo. Por jogador e por partida o motor registra GK ~2,4, DEF ~0,8, MID ~0,1 e FWD ~0,6
    passes normais, mais ~24 through balls por partida.
  - **O `passesFailed` perto de 0 também é real:** só interceptação e impedimento derrubam um
    passe normal, e o acerto fica em ~96%.
  - O MID quase não fazia passe normal (usava through ball). Era balanceamento, não contagem.
    **Rebalanceado em 2026-09-24:** `PASS_STRONG_RAW` 1,0 → 0,8 em `DecisionTree.ts` (ver
    `game-engine/pass.md` → "Action Compression"). Por jogador e por partida agora: GK ~3,0,
    DEF ~3,0, MID ~1,7 e FWD ~1,4 passes normais, ~49 passes e ~19 through balls por partida,
    acerto ~96,6%. Gols/partida: Premier 2,83 → 2,89, Serie A 2,39 → 2,23,
    `of_championship` 1,65 → 1,40. Medido com `bun scripts/passing-mix-diagnostic.ts`.
  - **Meio-campo como eixo de passe (commit `a341233`, 2026-09-24):** alavancas de passe por papel
    (`roles.json`). Por vaga de titular: GK ~2,4, DEF ~2,0, MID ~2,4 e FWD ~1,3 passes normais na
    Premier; acerto ~97,5%.
  - O volume de gols (`BASE_GOALS` e cia.) já foi recalibrado contra o motor novo (ver
    "Volume de gols" acima).
- **Eventos por vaga de titular (recalibrados em 2026-09-24, motor `a341233`, 26 ligas, 400 jogos
  cada):** passes, desarmes, interceptações, desarmes errados, chutes e assistências.
  - **Meta por vaga de titular, não por jogador que entrou.** O motor faz ~5 substituições por
    time, então há 1,2–1,6 jogadores por vaga nas linhas de campo (GK 1,0). O quickSim não tem
    reservas: o titular carrega o total da linha (total ÷ titulares). A calibração antiga dividia
    por todos que jogaram e deixava desarmes, interceptações e assistências baixos (desarme DEF
    0,26 contra 0,50 do motor).
  - **Ferramenta:** `bun scripts/quicksim-spread.ts collect` agora guarda, por lado e por linha,
    os totais de eventos (os desarmes errados vêm direto do evento `tackle` do barramento, não da
    nota) e as notas de titulares e de todos. `bun scripts/quicksim-spread.ts events <dir>
    [--quick k] [--apply]` compara motor × quickSim por liga, ajusta as taxas (Poisson, nível do
    próprio time × do adversário) e imprime as constantes. `--apply` grava em `QuickSimConfig.ts`;
    rode 3 vezes (as partilhas de gol/assistência e os desarmes errados convergem).
  - **Fórmulas** (nível = `teamLevel` do próprio time; `lv(e) = (nível / LEVEL_REF)^e`):
    - passes ~ Poisson(`PASSES_PER_MATCH[linha]` × lv(`PASS_LEVEL_EXPONENT`)); acerto =
      `PASS_COMPLETION_BASE + PASS_COMPLETION_SKILL × passing/10`;
    - desarmes ~ Poisson(`TACKLES_PER_MATCH` × lv(`TACKLE_LEVEL_EXPONENT`) × (0,5 + tackling/10));
    - interceptações ~ Poisson(`INTERCEPTIONS_PER_MATCH` × lv(`INTERCEPTION_LEVEL_EXPONENT`) ×
      (0,5 + pressing/10));
    - desarmes errados ~ Poisson(`TACKLES_FAILED_PER_MATCH` × lv(`TACKLE_FAIL_LEVEL_EXPONENT`)).
      Substitui o `TACKLE_FAIL_RATIO`. Os expoentes vêm do motor; as taxas são o botão que iguala
      a nota média dos titulares por linha (o titular do quickSim carrega também os eventos do
      reserva, então elas ficam acima da contagem por vaga do motor no FWD);
    - chutes sem gol ~ Poisson(xG do dia × `SHOTS_PER_XG` × (nível da partida / LEVEL_REF)^
      `SHOTS_LEVEL_EXPONENT`). No motor, as ligas fracas chutam bem mais por gol (expoente ≈ −1).
    - Quem marca/chuta e quem dá assistência continuam por `ROLE_GOAL_WEIGHT` /
      `ROLE_ASSIST_WEIGHT` (partilhas dentro do time, ajustadas às partilhas por linha do motor) e
      `NO_ASSIST_RATE` = 1 − assistências por gol do motor.
  - **Valores:**

    | Constante | GK | DEF | MID | FWD |
    |---|---|---|---|---|
    | `PASSES_PER_MATCH` | 2,095 | 2,124 | 2,387 | 1,102 |
    | `PASS_LEVEL_EXPONENT` | 0,23 | 0,34 | 1,01 | 0,72 |
    | `TACKLES_PER_MATCH` | 0 | 0,54 | 0,189 | 0,369 |
    | `TACKLE_LEVEL_EXPONENT` | 0 | −0,20 | −0,74 | −0,09 |
    | `INTERCEPTIONS_PER_MATCH` | 0 | 0,124 | 0,152 | 0,161 |
    | `INTERCEPTION_LEVEL_EXPONENT` | 0 | 0,60 | 1,04 | 1,24 |
    | `TACKLES_FAILED_PER_MATCH` | 0 | 1,068 | 0,364 | 1,076 |
    | `TACKLE_FAIL_LEVEL_EXPONENT` | 0 | −0,39 | −0,82 | −0,30 |
    | `ROLE_GOAL_WEIGHT` | 0 | 0 | 0,113 | 1,533 |
    | `ROLE_ASSIST_WEIGHT` | 0,015 | 0,219 | 0,284 | 0,544 |

    Escalares: `PASS_COMPLETION_BASE` 0,973, `PASS_COMPLETION_SKILL` 0,004 (o motor acerta
    97,5%, e o passe do jogador quase não pesa), `SHOTS_PER_XG` 1,922, `SHOTS_LEVEL_EXPONENT`
    −1,03, `NO_ASSIST_RATE` 0,143.
  - **Motor com o meio-campo como eixo de passe:** por vaga, o MID agora passa 2,36 na Premier,
    1,99 na `of_championship` e 1,32 no Quênia (antes 1,30 / 0,94 / 0,42), e a DEF caiu para
    ~2,0. O expoente de nível do MID caiu de 2,16 para 1,01.
  - **Antes → depois, eventos por vaga** (motor | quick antes → quick depois):

    | Liga (nível) | DEF desarmes | DEF interc. | MID passes | MID desarmes | FWD desarmes | FWD assist. | FWD chutes |
    |---|---|---|---|---|---|---|---|
    | Premier (5,20) | 0,50 \| 0,26 → 0,54 | 0,12 \| 0,07 → 0,11 | 2,36 \| 1,41 → 2,45 | 0,13 \| 0,11 → 0,17 | 0,23 \| 0,14 → 0,25 | 0,15 \| 0,09 → 0,13 | 0,95 \| 0,89 → 1,03 |
    | Championship (4,20) | 0,53 \| 0,26 → 0,56 | 0,10 \| 0,07 → 0,10 | 1,99 \| 0,87 → 2,03 | 0,19 \| 0,10 → 0,18 | 0,24 \| 0,14 → 0,23 | 0,06 \| 0,04 → 0,06 | 0,69 \| 0,51 → 0,68 |
    | Allsvenskan (3,65) | 0,55 \| 0,23 → 0,50 | 0,08 \| 0,07 → 0,08 | 1,75 \| 0,65 → 1,73 | 0,19 \| 0,11 → 0,20 | 0,24 \| 0,13 → 0,24 | 0,05 \| 0,03 → 0,05 | 0,55 \| 0,37 → 0,56 |
    | Quênia (2,85) | 0,49 \| 0,21 → 0,49 | 0,06 \| 0,06 → 0,06 | 1,32 \| 0,39 → 1,36 | 0,25 \| 0,09 → 0,21 | 0,24 \| 0,13 → 0,24 | 0,02 \| 0,02 → 0,03 | 0,45 \| 0,22 → 0,39 |

  - **Notas dos titulares por linha** (motor | quick depois):

    | Liga | GK | DEF | MID | FWD |
    |---|---|---|---|---|
    | Premier | 6,06 \| 6,04 | 6,14 \| 6,16 | 6,22 \| 6,26 | 6,77 \| 6,82 |
    | Championship | 6,04 \| 6,03 | 6,10 \| 6,11 | 6,14 \| 6,15 | 6,39 \| 6,43 |
    | Allsvenskan | 6,03 \| 6,03 | 6,07 \| 6,05 | 6,11 \| 6,11 | 6,28 \| 6,29 |
    | Quênia | 6,03 \| 6,03 | 6,02 \| 6,00 | 6,07 \| 6,06 | 6,18 \| 6,12 |
    | 26 ligas | 6,040 \| 6,032 | 6,080 \| 6,079 | 6,137 \| 6,138 | 6,412 \| 6,411 |

    rms por liga da diferença de nota: GK 0,009, DEF 0,014 (antes 0,037), MID 0,014 (antes
    0,033), FWD 0,043 (pior +0,13).
  - **Limitações que ficam:**
    - **Notas ≥ 8,5:** 0,82% no motor, 0,87% antes e 1,03% depois, quase todas de FWD (Premier
      9,5% × 7,4%). O titular carrega os gols e assistências da vaga inteira, e os desarmes
      errados extras acertam a média mas não a cauda. Não achei correção com princípio que
      mantenha a regra por vaga.
    - **Desarme × atributo:** no motor a DEF desarma menos em proporção ao `tackling` do que o
      fator `0,5 + tackling/10` supõe (potência livre 0,39, não 1). Dá ±0,05 por vaga entre ligas.
    - **Chutes do MID:** 10% dos chutes sem gol no motor e 8% no quickSim (sem peso de chute
      separado).
- **Posições nos elencos reais:** `positions[0]` guarda o papel principal ("Defender",
  "Midfielder", "Forward"), e não o papel detalhado. Por isso, o quickSim usa o **papel do slot da
  formação** (`homeRoles`/`awayRoles`, derivados com `slotRoles(formation)`) e só usa
  `positions[0]` quando o slot não tem papel conhecido. `ROLE_GROUP` aceita os dois formatos.
