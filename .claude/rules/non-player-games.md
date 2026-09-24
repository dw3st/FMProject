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

- **Volume de gols (recalibrado em 2026-09-24, com 12 ligas):**
  `xG = BASE_GOALS × ratio^STRENGTH_EXPONENT × (nível/LEVEL_REF)^LEVEL_EXPONENT × mando`.
  - `ratio = (ataque × meio) / (defesa × goleiro)`. O nível do jogo é a média do `teamLevel` dos
    dois times, e `teamLevel` é a média das 4 linhas.
  - Valores: `BASE_GOALS = 0.78`, `STRENGTH_EXPONENT = 1.0`, `LEVEL_EXPONENT = 1.1`,
    `HOME_ADVANTAGE = 1.06` (antes 0.94 / 0.5 / 1.2 / 1.01).
  - **Por que mudou:** a calibração antiga só usava as 8 ligas nativas. Nas ligas `of_*` o
    quickSim fazia +26% a +42% de gols. Os elencos derivados têm defesa e goleiro fortes em
    relação ao ataque (ex.: liga russa com ataque 1,8 e reflexo do goleiro 4,3), e o motor marca
    bem menos ali do que o nível sozinho prevê. O `ratio` com expoente 1 captura isso.
  - **Resultado:** o rms do erro de gols/jogo nas 12 ligas foi de 21% para 9%. Fora da amostra,
    o erro ficou em +8% (`of_championship`), +7% (`of_allsvenskan`) e −11% (`of_kenyan`), contra
    +26% / +33% / +31% antes. No agregado, casa, fora e empate batem com o motor
    (31,8/29,0/39,2% × 31,3/29,0/39,6%).
  - **Ainda sobra:** Premier −11%, Serie A −10% e Ekstraklasa +23%. As 5 grandes têm nível quase
    igual e no motor vão de 1,68 (Bundesliga) a 2,28 (Premier). Um modelo com expoente por linha
    melhorou pouco (rms 7,6%) e zerava o peso do goleiro, então foi descartado como sobreajuste.
  - **Como recalibrar:** rode `quicksim-calibrate.ts` com `QS_ENGINE_CACHE` por liga (motor uma
    vez, ~400 jogos) para um conjunto de ligas de níveis variados, nativas **e** `of_*`. Depois
    ajuste as constantes contra os caches. A média de gols do quickSim é analítica
    (`Σ xgHome + xgAway`), então dá para ajustar `BASE_GOALS` em forma fechada. O ruído do motor
    com 400 jogos é de ±4% nos gols.
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
  - As taxas de passe do quickSim (`PASSES_PER_MATCH`, `PASS_COMPLETION_*`) e o volume de gols
    (`BASE_GOALS`) foram calibrados **antes** desse rebalanceamento e precisam ser recalibrados
    contra o motor novo.
- **Posições nos elencos reais:** `positions[0]` guarda o papel principal ("Defender",
  "Midfielder", "Forward"), e não o papel detalhado. Por isso, o quickSim usa o **papel do slot da
  formação** (`homeRoles`/`awayRoles`, derivados com `slotRoles(formation)`) e só usa
  `positions[0]` quando o slot não tem papel conhecido. `ROLE_GROUP` aceita os dois formatos.
