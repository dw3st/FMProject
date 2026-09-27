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
- **Mata-mata (`input.knockout`):** uma partida de mata-mata nunca termina empatada. Se
  `goalsHome === goalsAway` depois dos gols normais, o quickSim soma prorrogação (30' extras) e,
  se ainda empatado, resolve com a mesma disputa de pênaltis do motor completo:
  - **Prorrogação:** gols extras vêm do mesmo xG do dia (`xgHomeDay`/`xgAwayDay`, já com o fator
    de domínio) escalado por `30/90`, sorteados pela mesma `sampleGoals` e distribuídos pela mesma
    `assignGoals` (extraída de `fillSide` para ser reaproveitada aqui — a ordem de consumo do
    `rng` não muda em relação ao caminho sem mata-mata). `recording.decider.extraTime = { home,
    away }` guarda só os gols marcados na prorrogação.
  - **Pênaltis:** só entra se a prorrogação também terminar empatada. `shootoutSide(xi)` monta um
    `PenaltySide<string>` a partir dos titulares: `accuracy = min(0.95, finishing/10)` para
    jogadores de linha, o goleiro do XI vira o `keeper` (`reflex`/`jump` ÷ 10). Chama
    `resolvePenaltyShootout` (`src/GameEngine/Infrastructure/PenaltyShootout.ts`, ver
    `.claude/rules/game-engine/shot-and-save.md` → "Penalty shootout") com o mesmo `rng` seedado
    da partida, e só lê o placar final — não há apresentação cobrança a cobrança no quickSim.
    `recording.decider.penalties = { home, away }` (ausente quando a prorrogação já decidiu).
  - **Energia:** a prorrogação alonga a partida em 1/3 (90' → 120'), então o desgaste de energia
    de todo o XI é multiplicado por `4/3` (`extraTimeMult`) sempre que `decider?.extraTime`
    existir — mesmo quando a prorrogação sozinha já decidiu, sem chegar aos pênaltis.
  - `recording.decider` só existe quando `input.knockout` é verdadeiro e o jogo passou de 90'
    empatado; ausente (não `null`) numa partida de liga comum, mesmo que termine empatada.
  - A soma dos gols por jogador (`playerStats[...].goals`) sempre bate com `recording.score` —
    cobranças de pênalti não contam como gol, só os gols de tempo normal e de prorrogação.

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
  - Valores (2026-09-24, **superseded pela recalibração de 2026-09-26** — ver
    "Recalibração de 2026-09-26" mais abaixo): `BASE_GOALS = 0.74`, `STRENGTH_EXPONENT = 0.54`,
    `LEVEL_EXPONENT = 0.8`, `PACE_EDGE_WEIGHT = 0.26`, `HOME_ADVANTAGE = 1.07`
    (antes 0.78 / 1.0 / 1.1 / — / 1.06).
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
  - **Valores (2026-09-24, superseded pela recalibração de 2026-09-26 — ver
    "Recalibração de 2026-09-26" mais abaixo para os valores atuais):**

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

### Recalibração de 2026-09-26 (após a recalibração dos craques, issue #2)

A recalibração dos nativos (nível do seed — ver `.claude/rules/data/openfootball-import.md` →
"Recalibração dos nativos") fez o motor marcar mais nas ligas fortes sem o quickSim acompanhar:
`bundesliga` −17,5%, `premier_league` −12,6%, `serie_a` −9,7% (issue #2). Recoletado com
`bun scripts/quicksim-spread.ts collect <liga> 200 2 <dir>/<liga>.json` para as mesmas 26 ligas da
tabela acima (400 jogos cada, motor pós-recalibração dos craques; Tasks 1–3 deste plano — agregado
de mata-mata — não mudam jogos de liga, então coletar antes delas terminarem foi válido).

**Fórmula de gols (`analyze`, seção 8, `ratio+level+pace` com as chaves atuais):**

```
xG = BASE_GOALS × ratio^STRENGTH_EXPONENT × (nível/LEVEL_REF)^LEVEL_EXPONENT
   × e^(PACE_EDGE_WEIGHT × paceEdge) × HOME_ADVANTAGE (mandante)
```

| Constante | Antes (2026-09-24) | Depois (2026-09-26) |
|---|---|---|
| `BASE_GOALS` | 0,74 | 0,76 |
| `HOME_ADVANTAGE` | 1,07 | 1,03 |
| `STRENGTH_EXPONENT` | 0,54 | 0,51 |
| `LEVEL_EXPONENT` | 0,80 | 0,81 |
| `PACE_EDGE_WEIGHT` | 0,26 | 0,32 |

Um termo extra de `FWD.finishing` (`ratio+level+pace+finishing FWD`) reduzia mais o rms (6,7%
contra 8,2%) e trazia `of_uzbek_super_league` para dentro de ±15%, mas colapsa `LEVEL_EXPONENT`
para ~0,07 — a mesma colinearidade já documentada na rodada de 2026-09-24 ("derruba o
`LEVEL_EXPONENT` para 0,2 (colinear)") — então não foi adotado, por consistência com essa decisão.

**Gols/jogo por liga, motor × quickSim (400 jogos cada), antes e depois das constantes novas:**

| Liga | motor | quick antes | erro antes | quick depois | erro depois |
|---|---|---|---|---|---|
| premier_league | 2,74 | 2,38 | −13,1% | 2,55 | −6,8% |
| serie_a | 2,09 | 2,07 | −0,8% | 2,19 | +5,1% |
| la_liga | 2,29 | 2,23 | −2,4% | 2,34 | +2,2% |
| ligue_1 | 2,10 | 1,94 | −7,5% | 2,04 | −2,8% |
| bundesliga | 1,92 | 1,78 | −7,0% | 1,84 | −3,8% |
| brazil_serie_a | 1,82 | 1,72 | −5,8% | 1,78 | −2,4% |
| brazil_serie_b | 1,37 | 1,36 | −0,9% | 1,38 | +1,0% |
| brazil_serie_c | 1,08 | 1,01 | −7,2% | 1,02 | −6,0% |
| of_ekstraklasa | 0,98 | 1,15 | +16,9% | 1,13 | +14,7% |
| of_championship | 1,63 | 1,49 | −8,3% | 1,52 | −6,4% |
| of_allsvenskan | 1,06 | 1,16 | +8,7% | 1,16 | +8,6% |
| of_argentine_premier_division | 1,56 | 1,42 | −9,4% | 1,45 | −7,3% |
| of_danish_superliga | 1,56 | 1,41 | −9,5% | 1,47 | −5,9% |
| of_eredivisie | 1,54 | 1,68 | +9,0% | 1,72 | +11,6% |
| of_greek_super_league | 1,23 | 1,27 | +3,6% | 1,28 | +4,9% |
| of_italian_serie_c_a | 0,94 | 0,96 | +1,1% | 0,95 | +0,9% |
| of_j_league | 1,13 | 1,13 | +0,1% | 1,12 | −0,8% |
| of_kenyan_premier_division | 0,70 | 0,68 | −2,5% | 0,67 | −4,2% |
| of_liga_mx | 1,42 | 1,39 | −2,1% | 1,39 | −2,1% |
| of_major_league_soccer | 1,40 | 1,40 | +0,2% | 1,42 | +2,0% |
| of_portuguese_primeira_liga | 1,65 | 1,61 | −2,2% | 1,66 | +1,1% |
| of_russian_second_division_b_group_2 | 0,77 | 0,68 | −11,4% | 0,66 | −14,6% |
| of_saudi_professional_league | 1,17 | 1,29 | +10,7% | 1,33 | +14,4% |
| of_spanish_second_division | 1,62 | 1,67 | +3,2% | 1,73 | +6,8% |
| of_turkish_super_league | 1,86 | 1,64 | −11,6% | 1,69 | −9,0% |
| of_uzbek_super_league | 0,66 | 0,82 | +25,1% | 0,80 | +21,2% |

rms por liga 9,0% → 8,2% (piso de ruído do motor 4,4%). **25 de 26 ligas ficam dentro de ±15%.**
`of_uzbek_super_league` continua fora (+21,2%, era +25,1%): é a liga de menor volume de gols (0,66
gol/lado no motor, ruído ±6,2%), e o ajuste é feito por deviance de Poisson somada sobre todos os
lados de todas as ligas — uma liga com poucos gols pesa pouco nessa soma, então o ajuste não
prioriza acertá-la. Isso é uma limitação conhecida da família de 5 parâmetros (o mesmo motivo por
trás da rejeição do termo de `finishing`, que só ajuda via colinearidade com o nível). Não corrigido
nesta rodada — precisaria de um ajuste ponderado por liga, fora do escopo de `analyze`.

**Eventos por vaga (`events --apply`, 3 rodadas até convergir):** `ROLE_GOAL_WEIGHT`,
`ROLE_ASSIST_WEIGHT`, `NO_ASSIST_RATE`, `SHOTS_PER_XG`, `SHOTS_LEVEL_EXPONENT`,
`PASSES_PER_MATCH`, `PASS_LEVEL_EXPONENT`, `PASS_COMPLETION_BASE`, `PASS_COMPLETION_SKILL`,
`TACKLES_PER_MATCH`, `TACKLE_LEVEL_EXPONENT`, `INTERCEPTIONS_PER_MATCH`,
`INTERCEPTION_LEVEL_EXPONENT`, `TACKLES_FAILED_PER_MATCH`, `TACKLE_FAIL_LEVEL_EXPONENT` — todos
recalculados contra os caches novos (motor pós-recalibração dos craques). Mudanças pequenas em
relação à rodada de 2026-09-24 (ex.: `SHOTS_PER_XG` 1,922 → 1,754, `PASSES_PER_MATCH.MID` 2,387 →
2,338): o motor pós-recalibração dos craques concentra mais chutes/gols nos craques de ataque, mas
a distribuição por linha/vaga não mudou o suficiente para exigir uma nova tabela de "eventos por
vaga" e notas — os valores de 2026-09-24 continuam uma leitura válida da forma da calibração.

**Checagem entre ligas (`scripts/quicksim-crossleague.ts`, top 6 de cada liga, os dois mandos,
motor 4 repetições, quickSim 50 repetições por confronto) — primeira rodada, `DOMINANCE_SIGMA =
0,35`:**

| Par | motor: lado forte V/E/D, gols/jogo | quickSim: V/E/D, gols/jogo | gap vitória forte | gap gols |
|---|---|---|---|---|
| premier_league × of_eredivisie | 80,2/13,5/6,3, 2,92 | 74,9/14,7/10,3, 3,07 | −5,3 p.p. | +5,0% |
| la_liga × of_portuguese_primeira_liga | 74,7/18,4/6,9, 2,70 | 68,5/19,2/12,3, 2,55 | −6,2 p.p. | −5,7% |
| brazil_serie_a × of_argentine_premier_division | 31,6/34,0/34,4, 1,52 | 36,6/31,6/31,7, 1,73 | +5,0 p.p. | +14,1% |
| bundesliga × of_danish_superliga | 72,2/20,5/7,3, 2,08 | 65,2/23,4/11,4, 2,07 | −7,0 p.p. | −0,4% |

Meta: gap de vitória do lado mais forte ≤ 6 p.p., gap de gols ≤ 15%. Gols: as 4 checagens passam.
Vitória do mais forte: 2 de 4 passam (`premier_league`/`of_eredivisie` −5,3 p.p.,
`brazil_serie_a`/`of_argentine_premier_division` +5,0 p.p.); as outras duas ficam perto, mas fora
(`la_liga`/`of_portuguese_primeira_liga` −6,2 p.p., `bundesliga`/`of_danish_superliga` −7,0 p.p.).

**Diagnóstico:** não é `LEVEL_EXPONENT` — ele entra igual dos dois lados (`(nível médio da
partida / LEVEL_REF)^LEVEL_EXPONENT`, mesmo nível para os dois times de uma partida), então não
tem como abrir nem fechar a diferença **entre** os dois lados de um confronto. Olhando as colunas
V/E/D: os empates do quickSim já batem com o motor; o excesso está nas **derrotas do lado forte**
(L), sistematicamente ~1,6× a taxa do motor nos três pares de nível bem diferente (Premier×Eredivisie,
La Liga×Portugal, Bundesliga×Dinamarca). Isso aponta para `DOMINANCE_SIGMA` — o fator de domínio
por partida em `quickSim.ts` (`d ~ N(0, σ)`, `xG_casa × e^(d−σ²/2)`, `xG_fora × e^(−d−σ²/2)`) é uma
log-normal **que preserva a média** (`E[e^(d−σ²/2)] = 1` para qualquer σ) mas cuja variância não
depende da diferença de força entre os dois lados: o mesmo σ empurra o resultado tanto quando os
dois times são parecidos quanto quando um é muito mais forte. Num confronto desigual essa variância
extra vira upset (o lado fraco vence mais do que deveria); num confronto de nível parecido
(`brazil_serie_a` × `of_argentine_premier_division`, nível ~4,46 × ~4,32 — **efetivamente iguais**,
não há de fato um lado "fraco") a mesma variância não tem para onde vazar como excesso de upset —
por isso esse par nem aparece com gap negativo, e o rótulo "lado forte" ali é quase arbitrário
(decidido por uma diferença de nível pequena o bastante para virar ruído).

**Fix:** `DOMINANCE_SIGMA` 0,35 → 0,25. Só afeta a variância por partida do quickSim (o motor não
usa esse parâmetro); a média de gols não muda por construção (`E[e^(d−σ²/2)] = 1`), então não é
esperado nenhum efeito no volume de gols por liga (seção anterior) — só na dispersão de
resultados. Verificado dentro de cada liga antes de aplicar entre ligas
(`bun scripts/quicksim-calibrate.ts <liga> 50 2`, `QS_QUICK_REPEATS=30`, ~100 jogos do motor por
liga — amostra pequena, ruído esperado de alguns p.p.):

| Liga | motor gols/casa%/empate%/fora% | quickSim (σ=0,25) | dentro de ±10% (gols/casa/empate) |
|---|---|---|---|
| premier_league | 2,77 / 39,0 / 27,0 / 34,0 | 2,58 / 40,1 / 22,5 / 37,4 | gols ✓, casa ✓, empate ✗ (mas só 4,5 p.p.) |
| bundesliga | 2,01 / 36,0 / 24,0 / 40,0 | 1,83 / 37,6 / 29,1 / 33,2 | gols ✓, casa ✓, empate ✗ (5,1 p.p., amostra pequena) |
| of_kenyan_premier_division | 0,67 / 25,0 / 53,0 / 22,0 | 0,66 / 21,3 / 57,3 / 21,4 | gols ✓, casa ✗ (3,7 p.p.), empate ✓ |

Nenhuma liga piorou de forma clara em relação à calibração de eventos já feita (a seção "Eventos
por vaga" acima não muda com `DOMINANCE_SIGMA`); as diferenças de casa/empate ficam na faixa de
alguns p.p., compatível com o ruído de ~100 partidas do motor por liga. `DOMINANCE_SIGMA = 0,25`
foi mantido (não revertido).

**Checagem entre ligas, segunda rodada, `DOMINANCE_SIGMA = 0,25`** (mesmos parâmetros
`n=6, repeats=4, quickRepeats=50`; o motor usa `Math.random` sem seed, então o próprio valor do
motor varia um pouco entre as duas rodadas — visível na coluna "motor" abaixo):

| Par | motor: lado forte V/E/D, gols/jogo | quickSim: V/E/D, gols/jogo | gap vitória forte | gap gols |
|---|---|---|---|---|
| premier_league × of_eredivisie | 80,9/13,2/5,9, 2,81 | 77,2/14,1/8,6, 3,08 | −3,7 p.p. | +9,7% |
| la_liga × of_portuguese_primeira_liga | 75,7/17,4/6,9, 2,81 | 70,4/18,5/11,1, 2,56 | −5,2 p.p. | −9,0% |
| brazil_serie_a × of_argentine_premier_division | 33,3/34,7/31,9, 1,57 | 35,7/33,0/31,3, 1,73 | +2,4 p.p. | +10,2% |
| bundesliga × of_danish_superliga | 75,3/16,3/8,3, 2,11 | 67,0/22,7/10,3, 2,08 | −8,3 p.p. | −1,3% |

Gols: as 4 checagens continuam dentro de ±15%. Vitória do mais forte: `premier_league`/`of_eredivisie`
(−5,3 → −3,7 p.p.) e `brazil_serie_a`/`of_argentine_premier_division` (+5,0 → +2,4 p.p.) melhoraram
e passam com folga; `la_liga`/`of_portuguese_primeira_liga` ficou praticamente igual (−6,2 → −5,2
p.p., passa agora). `bundesliga`/`of_danish_superliga` piorou na leitura direta (−7,0 → −8,3 p.p.),
mas o valor do **motor** nessa rodada também subiu bastante (72,2% → 75,3% de vitória do lado
forte) sem nenhuma mudança de código — com `n=288` jogos de motor sem seed, o desvio-padrão
esperado de uma proporção ~0,72 é ≈ 2,6 p.p., então um salto de 3,1 p.p. no motor entre as duas
rodadas é consistente com ruído de amostra, não com uma regressão do `DOMINANCE_SIGMA` novo. Não
foi possível isolar o efeito de σ desse ruído do motor sem aumentar `repeats` além do pedido nesta
rodada (ideia para depois: um script de checagem entre ligas que reaproveite os mesmos jogos de
motor entre uma rodada de σ e outra, em vez de resimular o motor do zero).

**Testes:** `bun test` → 856 passam (0 falham; a contagem subiu em relação aos 842 da primeira
rodada porque outras tasks deste plano — o agregado de mata-mata — commitaram no meio do caminho).
Só um dependia diretamente das constantes de gols:
`src/Domain/advanceDay/matches.quick.test.ts` → "neutral fixture removes home advantage" (usa o
efeito multiplicativo de `HOME_ADVANTAGE` na margem esperada). Com `HOME_ADVANTAGE` 1,07 → 1,03 a
margem pareada caiu de ~0,045 para ~0,0195 em 2000 seeds — nos dois pontos, ~0,64 × (HOME_ADVANTAGE
− 1). O teste agora deriva o limiar dessa relação
(`0,64 × (QUICK_SIM_CONFIG.HOME_ADVANTAGE − 1) × 0,5`) em vez de um número fixo escrito na hora —
continua um sinal claramente positivo e não-flaky, mas passa a acompanhar sozinho a próxima
recalibração de `HOME_ADVANTAGE`, sem precisar de outro ajuste manual no teste.

## Fadiga

Modelo de fôlego/carga: `.claude/rules/game/development.md` não cobre isso — a lógica pura fica em
`src/Domain/fitness/` (`fitnessConfig.ts` + `fitness.ts`), e o desconto por energia em campo (motor
e a escala de titulares por vaga) fica em `src/GameEngine/Domain/RuntimeLineup.ts` e
`src/Domain/lineupHelpers.ts`. Ver `docs/superpowers/specs/2026-09-27-stamina-design.md` para o
desenho original.

### Recalibração de 2026-09-27 ("soften + recalibrate")

Uma revisão apontou que a curva de fadiga do motor estava forte demais em diferenças de fôlego
normais (95×80 dava +0,77 de saldo de gols; 90×70 dava +1,43) e não suficientemente diferenciada no
extremo (90×50-com-carga-alta só aparecia como 90% de vitórias, sem medir o saldo). Duas mudanças,
na ordem em que precisam ser lidas:

**1. Curva de fadiga do motor (`RuntimeLineup.ts`).** A curva era côncava
(`FATIGUE_CURVE_POWER = 0,75`): a primeira energia perdida já doía muito, então um time em 80-90 de
fôlego (o normal num dia de jogo) já levava um desconto real, e o desconto achatava depois. Trocado
para uma curva **convexa** (`FATIGUE_CURVE_POWER = 1,5`): os primeiros pontos de fôlego perdido
quase não doem; só perto de 0 de energia o desconto chega no teto. Os três tetos também caíram
(`FATIGUE_MAX_REDUCTION_PHYSICAL` 0,55 → 0,16, `_SEMI` 0,35 → 0,10, `_TECH` 0,20 → 0,05). Isso
amacia o caso comum (fôlego 80-95, o normal numa semana sem congestionamento) e mantém o caso
extremo (time exaurido + carga alta) claramente pior.

Medido com `bun scripts/fatigue-calibrate.ts` Parte 3 (nova — cenários de saldo de gols do time
fresco, `premier_league` + `of_championship`, os dois mandos, n=320 por cenário):

| Cenário | alvo | antes (côncava) | depois (convexa) |
|---|---|---|---|
| 95 fôlego/carga 0 × 80/carga 90 | +0,2 a +0,35 | +0,77 (48 jogos) | +0,47 |
| 90/0 × 70/0 | +0,4 a +0,6 | +1,43 (48 jogos) | +0,47 |
| 90/0 × 50/carga 200 | +1,0 a +1,5 | 90% vitórias (sem saldo medido) | +1,03 |
| controle 90/0 × 90/0 | ≈ 0 | — | +0,09 (ruído da amostra) |

O cenário mais brando (95×80/90) ainda fica um pouco acima da faixa-alvo, mas perto do piso de
ruído da própria amostra (o controle mede +0,09 quando deveria ser 0) — os outros dois cenários
caem dentro do alvo. `bun scripts/fatigue-calibrate.ts <pairs> <repeats> <scenPairs> <scenRepeats>
<scen3Pairs> <scen3Repeats>`; `FC_ONLY_PART3=1` pula as Partes 1–2 (mais lentas) ao iterar só a
curva.

**2. Volume de gols do quickSim, recalibrado a fôlego real (~88), não 75.** Toda calibração de
volume de gols até aqui (`analyze`, a tabela "Volume de gols" acima) rodava os dois lados no
fôlego padrão do `emptySeasonLog()` (75, porque os elencos estáticos não têm `seasonLog`). Um dia
de jogo de verdade fica perto de 88-90 de fôlego (ver "Fôlego num dia de jogo" abaixo). Como a
curva do motor ficou muito mais suave perto do topo, um time a 88 de fôlego agora joga quase no
nível máximo — antes já vinha descontado. Isso sozinho eleva o placar do motor em ~35-45% no
fôlego real, invalidando a calibração de volume de gols antiga.

`collect` ganhou `--fitness N [--load N]` para coletar num fôlego específico (grava `fitness`/`load`
no cache; `analyze`/`events` já liam os elencos no fôlego padrão 75 por dentro — agora `analyze` lê
o fôlego gravado no próprio cache, com `--fitness` só como bloqueio de compatibilidade para caches
antigos sem o campo). Recoletado (`bun scripts/quicksim-spread.ts collect <liga> 150 2 <out>
--fitness 88`) em 10 ligas (`premier_league`, `la_liga`, `bundesliga`, `brazil_serie_a`,
`of_championship`, `of_allsvenskan`, `of_eredivisie`, `of_kenyan_premier_division`, `of_liga_mx`,
`of_turkish_super_league`), reajustado com `analyze` seção 8 (`ratio+level+pace`, chaves atuais):

| Constante | Antes (fôlego 75, curva côncava) | Depois (fôlego 88, curva convexa) |
|---|---|---|
| `BASE_GOALS` | 0,76 | 1,05 |
| `HOME_ADVANTAGE` | 1,03 | 1,15 |
| `STRENGTH_EXPONENT` | 0,51 | 0,46 |
| `LEVEL_EXPONENT` | 0,81 | 1,12 |
| `PACE_EDGE_WEIGHT` | 0,32 | 0,26 |

rms por liga **26,4% → 7,7%** (piso de ruído do motor ~4,1%). Só `of_allsvenskan` fica fora de
±15% (+17,3%); as outras 9 ligas ficam dentro de ±10%. `HOME_ADVANTAGE` subiu bastante (1,03 →
1,15) — o motor não tem vantagem de mando estrutural, então esse termo capta principalmente ruído
de amostra de qual time caiu como "casa" em cada par sorteado, igual nas rodadas anteriores dessa
mesma calibração; não foi investigado a fundo por não ser o alvo desta tarefa.

**3. `FATIGUE_PENALTY` do quickSim, 0,3 → 0,5.** A curva do motor mais suave também encolheu bastante
a diferença motor entre um time fresco e um cansado: fresco 100/carga 0 × cansado 70/carga alta,
`premier_league`, era 90%/7,8%/2,2% (V/E/D do lado fresco) e caiu para **58%/18,7%/23,3%** (2,26 ×
1,24 gols/jogo). Isso por si só já reduz o descompasso do quickSim (que ficava em 45,5%/20,8%/33,7%
com `FATIGUE_PENALTY=0,3` contra o motor antigo) — com o motor novo, o mesmo `FATIGUE_PENALTY=0,3`
dá 51,1%/17,1%/31,8% (2,17 × 1,60), mais perto mas ainda abaixo do motor.

Varrendo `FATIGUE_PENALTY` (`fatigue-calibrate.ts` Parte 2) contra o motor novo: 0,7 quase encosta
no motor (57,4%/17,3%/25,3%, 2,28 × 1,33), mas subir `FATIGUE_PENALTY` também reduz o volume de gols
entre dois times de fôlego **igual** a 88 (o termo de nível cai ainda que a razão ataque/defesa não
mude) — 0,7 custa ~5-6% de gols nesse cenário, o suficiente para desfazer boa parte da recalibração
do item 2. 0,5 custa só ~2,4-3,0% (medido direto com `quickSimMatch`, fôlego 88 dos dois lados, 3
ligas, 500 partidas cada) e ainda fecha boa parte da diferença (54,2%/17,3%/28,5%, 2,22 × 1,46). A
diferença residual (54% contra 58%) é um limite conhecido e aceito: o quickSim desconta a força uma
única vez a partir do fôlego de **início** de partida; o motor tem fadiga contínua (piora a cada
tick) e também recebe o efeito da carga durante a partida, não só no chute inicial.

### Fôlego num dia de jogo

- **Recuperação diária:** `RECOVERY_BASE` 0,35 → 0,45 nesta mesma tarefa — a curva de exemplo do
  design (26 anos, carga 0, stamina 7, saindo de 55 pós-jogo) passou de 55 → 71,4 → 81,8 → 88,4 →
  92,6 para 55 → 76,1 → 87,3 → 93,2 → 96,4 (um valor por dia de folga).
- **Numa semana normal** (sem congestionamento), o fôlego de um titular fica perto de 90 no dia de
  jogo.
- **Numa sequência congestionada** (jogo a cada 3 dias), o fôlego de um titular da IA cai para a
  faixa 85-88, e o seletor de escalação (`autoFillLineupWithFitness`) poupa titulares.

### Escalação por fôlego (`src/Domain/lineupHelpers.ts`)

- `BENCH_SWAP_RATIO` 0,85 → **1,09** — o reserva agora precisa ser **melhor** que o titular cansado,
  não só perto dele. Com o gatilho de elegibilidade sozinho (`TIRED_FITNESS_THRESHOLD = 75`), uma
  razão abaixo de ~1 quase não filtrava nada assim que um titular ficava claramente cansado,
  girando o elenco da IA demais numa sequência apertada (~8-9 titulares trocados por partida a
  0,85-1,0, medido com um script de varredura descartável simulando 8 partidas a cada 3 dias sobre
  os elencos reais da `premier_league`/`of_championship`). Com `1,09`, uma sequência congestionada
  fica em **~2,9-3,3 titulares trocados por partida**, e uma semana normal fica em **~0**.
- **Vaga de goleiro isenta por padrão:** só entra na troca se o titular cair abaixo de
  `GK_TIRED_FITNESS_THRESHOLD = 60` (bem abaixo do limiar de linha, 75) **e** existir um reserva com
  fôlego ≥ `GK_BENCH_FITNESS_FLOOR = 85`. Poupar um goleiro no meio de semana é uma decisão maior
  que poupar um jogador de linha.
- `resolveUserLineup` (`src/Domain/advanceDay/matchSimulationLineups.ts`) agora cai no seletor
  ciente de fôlego (`autoFillLineupWithFitness`), não no preenchimento só por nota, quando o clube
  do jogador nunca salvou uma escalação.
