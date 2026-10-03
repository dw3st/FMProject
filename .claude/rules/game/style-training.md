# Treino de estilos de jogo (familiaridade)

Spec: `docs/superpowers/specs/2026-10-02-style-training-design.md`. Etapa 15 do `docs/ROADMAP.md`, versão **2.10**.
Visual: `.claude/rules/ui-standard.md`. Pesos de tática: `.claude/rules/game-engine/tactical-config.md`.

## Regra

- Familiaridade 0..100 por chave: os 5 `TacticalStyle` + `high_line_trap` + `long_ball`
  (`FamiliarityKey`, `src/types/familiarityTypes.ts`).
- **Só o clube do jogador grava** (`Squad.styleFamiliarity`). Criada em `createSave`: tudo em 50, o estilo
  salvo em `tactics.json` em 70. O start kit não apaga (restaurada como o staff, `applyRandomStartKit`).
- **IA não simula** (`.claude/rules/AI-clubs/finance.md`): 75 no próprio estilo (sempre `balanced`), 50 nos
  demais (`aiFamiliarity`), nada gravado.
- `familiarityFactor(v)` linear: 0 em 50, +1 em 100, −1 em 0. **Em 50 nada muda, por construção.**
- O **estilo** (não a familiaridade) continua dirigindo as intenções; a mentalidade é aplicada antes.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/familiarity/familiarityConfig.ts` | Constantes (`FAMILIARITY`) |
| `src/Domain/familiarity/familiarity.ts` (+ teste) | `familiarityFactor`, `initialFamiliarity`, `familiarityOf`, `aiFamiliarity`, `squadFamiliarityLevels`, `trainFamiliarity` |
| `src/GameEngine/Configs/FamiliarityConfig.ts` (+ teste) | Efeitos no motor: tabela por estilo, `high_line_trap`, `long_ball`, `HIGH_PRESS_STAMINA_MULT`, execução |
| `src/GameEngine/Configs/AttackConfig.ts` / `DefenseConfig.ts` | `applyTeamAttackConfig`/`applyTeamTacticsConfig(team, style, mentality, axesOverride, familiarity?)` |
| `src/GameEngine/Domain/gameState.ts` | `tacticDrainMult` (press sob pressão alta), `withTeamExecution` nos atributos do titular e do banco |
| `src/GameEngine/Domain/SimulateMatch.ts` | `TeamTactics.familiarity` |
| `src/Domain/advanceDay/matchSimulationLineups.ts` | Familiaridade do jogador (gravada) e da IA (regra) nas táticas da partida |
| `src/Domain/advanceDay/dailyTraining.ts` | `TrainingPolicy.styleFocus`; treino aplica `trainFamiliarity` |
| `src/Domain/advanceDay/quickSim.ts` | `homeFamiliarity`/`awayFamiliarity` → força das linhas |
| `src/backend/SaveService.ts`, `saves.ts`, `startKits.ts`, `advanceDay.ts` | Criação, `meta.style_focus` (PUT validado), kit, foco padrão = estilo da tática |
| `src/GameInterface/Components/FamiliarityBars.tsx` | Barras na tela de táticas (`FormationScreen`) |
| `src/GameInterface/Development/DevelopmentTrainingConfig.tsx` | Seletor "Foco de estilo" |
| `src/GameInterface/MatchScreen.tsx` | Partida ao vivo aplica a familiaridade (A = clube, B = regra da IA) |
| `scripts/familiarity-measure.ts` | Medição (ver abaixo) |

## Treino

Cada dia de treino do clube do jogador (`buildTrainingEvent`, só se o elenco grava familiaridade):

```
foco   += GAIN_PER_SESSION (2) × devMult do auxiliar × (1 − v/100)      // teto suave
demais −= DECAY_PER_DAY (0,15), nunca abaixo de DECAY_FLOOR (30)         // abaixo do piso: fica como está
```

Foco = `meta.style_focus` (tela de treino; PUT `/api/saves/:id` valida com `isFamiliarityKey`), senão o estilo
de `tactics.json`. Dias de jogo e de descanso não mexem. De 50, um foco constante chega a ~82 em 50 sessões e
~93 em 100 (auxiliar nota 5).

## Efeito no motor (`FamiliarityConfig.ts`)

1. **Pesos do próprio estilo** (identidade; tudo escala com o fator, `mult` relativo, `add` absoluto):

   | Estilo | Ajuste em fator +1 |
   |---|---|
   | `possession` | `LANE_WEIGHT`, `RECEIVER_SPACE_WEIGHT` × 1,03 |
   | `high_press` | `PRESS_INTENSITY` + 0,05 |
   | `counter_attack`, `direct_play` | `PROGRESS_WEIGHT` (passe e condução) × 1,03 |
   | `balanced` | `LANE_WEIGHT`, `PROGRESS_WEIGHT` × 1,015 |
   | `high_line_trap` (só com linha alta) | `DEFENSIVE_LINE_HEIGHT` + 0,03 |
   | `long_ball` (sempre) | `LONG_BALL_WEIGHT` × 1,05 |

   Medido (abaixo): esses ajustes sozinhos não mudam o resultado (≈ 0 p.p.).
2. **Execução:** atributos dos jogadores do time × (1 + `EXECUTION_STAT_SCALE` × fator), teto 10, aplicados na
   montagem do titular e do banco (`withTeamExecution`). É o termo que faz um time treinado ganhar mais — o
   equivalente do quickSim. Guardado por time em `FamiliarityConfig` e definido por `applyTeamAttackConfig`;
   por isso as táticas têm de ser aplicadas **antes** de `createMatchState` (todos os caminhos fazem isso; o
   `/test` reconstrói o estado ao mudar a familiaridade).
3. **Pressão alta cansa mais:** custo de fôlego da ação `press` × 1,10 sempre que o `pressing_style` efetivo é
   `high_press` (`DefenseConfigValues.PRESS_STAMINA_MULT`, `tacticDrainMult`), com ou sem familiaridade.

`/lab`/calibrações que chamam `simulateMatch` sem `tactics` ficam neutras (execução 1).

## quickSim

`QuickSimInput.homeFamiliarity`/`awayFamiliarity`: as 4 linhas × (1 + 0,02 × fator). O avanço de dia não passa
nada (IA × IA; o clube do jogador sempre joga no motor completo), então a calibração do quickSim não muda.

## Telas

- Táticas (`FormationScreen`): painel "Familiaridade com o estilo", uma barra por chave, o estilo em uso
  destacado. Lê `squad.styleFamiliarity`.
- Desenvolvimento → Configuração de treinamento: chips "Foco de estilo" (sem escolha = estilo da tática).
- i18n: `familiarity.*` (en, pt-BR).

## `/test`, `/lab`

- `/test`: seletor de familiaridade por time (0/25/50/75/100) no painel de táticas; o `EnergyPanel` mostra o
  multiplicador de atributos e o de fôlego do press.
- `/lab`: `Variant.familiarity` (slider; ausente = 50) → pesos + execução (motor) e força (quickSim); rótulo
  `· fam N`. Nenhuma estatística nova em `Statistics.ts`: o efeito aparece em vitórias, gols e fôlego.

## Medição (`scripts/familiarity-measure.ts`)

Mesma liga, os dois lados no mesmo estilo, um em 100 e o outro em 50; cada par joga duas vezes com a
familiaridade trocada (mando igual), fôlego 88. Ver números na seção "Resultados".

```
bun scripts/familiarity-measure.ts premier_league 400 --style possession --seed 1 --out a.json
bun scripts/familiarity-measure.ts --sum a.json,b.json
bun scripts/familiarity-measure.ts premier_league 20000 --quick         # quickSim
FAMILIARITY_OVERRIDES='{"EXECUTION_STAT_SCALE":0.05}' bun scripts/familiarity-measure.ts ...
```

## Testes

```
bun test src/Domain/familiarity src/GameEngine/Configs/FamiliarityConfig.test.ts \
  src/Domain/advanceDay/dailyTraining.test.ts src/Domain/advanceDay/quickSim.test.ts \
  src/backend/familiarity.routes.test.ts src/lab/familiarityLabel.test.ts
```
