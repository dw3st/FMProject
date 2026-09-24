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

- **Nível absoluto:** o xG é multiplicado por `(nívelDoJogo / LEVEL_REF)^LEVEL_EXPONENT`
  (`LEVEL_REF = 5`, `LEVEL_EXPONENT = 1.2`, `BASE_GOALS = 0.94`). O nível do jogo é a média do
  `teamLevel` dos dois times, e `teamLevel` é a média das 4 linhas. Medido contra o motor
  (440 jogos por liga), em gols/jogo: Premier 2,31 → 2,16 (−7%), Brasileirão A 1,68 → 1,71
  (+2%), Série C 0,80 → 0,73 (−9%), Serie A +6%, Ligue 1 +10%, La Liga +13%, Série B +20% e
  Bundesliga +21%. O termo de nível não separa ligas de nível parecido: as ligas europeias têm
  nível ~5,05–5,18, mas no motor vão de 1,65 (Bundesliga) a 2,31 (Premier). O ruído do motor
  também pesa: duas amostras da mesma liga diferiram até 15%.
- **Contagem de passes do motor (corrigida em 2026-09-24):** o through ball emitia
  `passAttempted` sem nunca emitir `passCompleted`/`passFailed`, o que derrubava o aproveitamento
  para ~47%. Agora ele só conta na família própria (`throughBalls*`), e todo `passAttempted`
  termina em `passCompleted` ou `passFailed`, garantido por `SimulateMatch.test.ts`.
  - **O volume baixo é real, não bug:** o relógio é comprimido, e a partida tem ~7 min de jogo
    efetivo. Por jogador e por partida o motor registra GK ~2,4, DEF ~0,8, MID ~0,1 e FWD ~0,6
    passes normais, mais ~24 through balls por partida.
  - **O `passesFailed` perto de 0 também é real:** só interceptação e impedimento derrubam um
    passe normal, e o acerto fica em ~96%.
  - O MID quase não faz passe normal (usa through ball). É questão de balanceamento, não de
    contagem.
  - As taxas de passe do quickSim (`PASSES_PER_MATCH`, `PASS_COMPLETION_*`) foram recalibradas
    contra esses números. As notas continuam acompanhando o motor (DEF/MID ~6,1, FWD ~6,7).
- **Posições nos elencos reais:** `positions[0]` guarda o papel principal ("Defender",
  "Midfielder", "Forward"), e não o papel detalhado. Por isso, o quickSim usa o **papel do slot da
  formação** (`homeRoles`/`awayRoles`, derivados com `slotRoles(formation)`) e só usa
  `positions[0]` quando o slot não tem papel conhecido. `ROLE_GROUP` aceita os dois formatos.
