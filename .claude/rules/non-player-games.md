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

  - **Ainda sobra:** Premier −9% (a liga de maior `paceEdge`, talvez o efeito não seja linear lá
    em cima), Allsvenskan +12%, Ekstraklasa +11%. O ruído do motor com 400 jogos é de ±3% (Premier)
    a ±7% (ligas de pouco gol), então o que passa de ~8% é real.
  - **Como recalibrar** (depois de qualquer mudança no motor):
    1. `bun scripts/quicksim-spread.ts collect <liga> 200 2 <dir>/<liga>.json` para um conjunto
       variado de ligas nativas **e** `of_*`. Cada liga leva ~5 min, então rode várias em paralelo.
       O cache guarda cada jogo (ids, placar, chutes, xG).
    2. `bun scripts/quicksim-spread.ts analyze <dir> [--holdout a,b]` mostra o erro por liga com
       as constantes atuais, as correlações e o stepwise do resíduo, e os candidatos com mecanismo.
       A seção 8 reajusta a fórmula inteira (`c`→`BASE_GOALS = e^c`, `home`→`HOME_ADVANTAGE = e^h`,
       `ratio`, `level`, `pace`) direto nas unidades de `QuickSimConfig`.
    3. `quicksim-calibrate.ts` continua valendo para placares, casa/empate/fora e notas.
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
  - O volume de gols (`BASE_GOALS` e cia.) já foi recalibrado contra o motor novo (ver
    "Volume de gols" acima).
- **Passes do quickSim (recalibrados em 2026-09-24, motor com `PASS_STRONG_RAW = 0.8`):**
  `passes ~ Poisson(PASSES_PER_MATCH[linha] × (nívelDoTime / LEVEL_REF)^PASS_LEVEL_EXPONENT[linha])`,
  com o nível do **próprio** time (`teamLevel`). Acerto = `PASS_COMPLETION_BASE (0.94) +
  PASS_COMPLETION_SKILL × passing/10`; o motor acerta ~97%.
  - **Meta por vaga de titular, não por jogador que entrou.** O motor faz ~5 substituições por
    time, então há 1,2–1,6 jogadores por vaga nas linhas de campo (GK 1,0). O quickSim não tem
    reservas: o titular precisa carregar o total da linha. Por isso a tabela "Eventos" do
    `quicksim-calibrate.ts` agora divide pelo número de titulares (antes dividia por todos que
    jogaram e subestimava o motor).
  - Valores: `PASSES_PER_MATCH` GK 2,47 / DEF 2,58 / MID 1,28 / FWD 1,16;
    `PASS_LEVEL_EXPONENT` GK 0,75 / DEF 0,16 / MID 2,16 / FWD 0,96. O meio-campo é o que mais cai
    com o nível: por vaga, o motor faz MID 1,31 na Premier (nível 5,19), 0,93 na `of_championship`
    (4,20) e 0,38 no Quênia (2,86). A defesa quase não muda (2,56 → 2,36).
  - Ajustado em Premier, Serie A, `of_championship` e Quênia (200 jogos de motor cada); os
    passes por linha ficam a ±0,1 do motor nas quatro, e as notas por linha seguem dentro das
    metas (DEF sobe ~0,03 porque cada passe certo vale +0,02).
  - **Pendência:** na mesma visão por vaga, desarmes (DEF 0,26 × 0,50 do motor), interceptações e
    assistências do quickSim ficam abaixo do motor. Foram calibrados com a divisão antiga. Mexer
    neles muda as notas, então precisa recalibrar junto o `TACKLE_FAIL_RATIO`.
- **Posições nos elencos reais:** `positions[0]` guarda o papel principal ("Defender",
  "Midfielder", "Forward"), e não o papel detalhado. Por isso, o quickSim usa o **papel do slot da
  formação** (`homeRoles`/`awayRoles`, derivados com `slotRoles(formation)`) e só usa
  `positions[0]` quando o slot não tem papel conhecido. `ROLE_GROUP` aceita os dois formatos.
