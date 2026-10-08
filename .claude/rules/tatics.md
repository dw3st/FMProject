# Tactics & Role System

## Two-tier role model

Player roles operate at two levels. The UI always uses the right level for context.

### Main roles (display everywhere)

| Main Role  | Abbr | Tailwind colour  |
|------------|------|-----------------|
| GK         | GK   | `text-chart-4`  |
| Defender   | DEF  | `text-blue-400` |
| Midfielder | MID  | `text-primary`  |
| Forward    | FWD  | `text-destructive` |

Used in: squad table, dashboard player card, scout table, squad screen, development screen, dashboard club card.

### Detailed roles (formation selection only)

Sub-genres of the main roles. Used only when a user is selecting a formation or viewing the formation pitch.

| Detailed role | Main role  |
|---------------|-----------|
| GK            | GK        |
| CB, LB, RB, LWB, RWB | Defender  |
| CDM, DM, CM, CAM, AM, LM, RM | Midfielder |
| LW, RW, ST, CF | Forward  |

The engine (`FormationSlots.ts`, `TeamLineup.ts`) always works with detailed roles internally.

### Source of truth

- `src/Data/roles.json` — each entry has `mainRole`, `dpWeights`, `attrWeights`, formation `position`
  and the engine tuning (`engine`: bounds, biases, intent weights).
- `src/Domain/roles.ts` — `MainRole`, `getMainRole()` (pure; used by Domain, backend and UI).
- `src/GameInterface/positionHelpers.ts` — display only: `getPositionColor()`,
  `getDetailedPositionColor()`, `MAIN_ROLE_ABBR`, `MAIN_ROLE_BADGE_CLASSES`, `positionLabel()`.

**Never duplicate** role mapping or colour logic in components. Import from `@/Domain/roles` / `positionHelpers`.

---

## Tactics save (`tactics.json`)

Stored at `Data/saves/{saveId}/tactics.json`. Separate from the light `SaveMeta`.

```ts
interface TacticsSave {
  tactical_style:   TacticalStyle;           // drives the axes and the team intents
  formation:        string;                  // ready-made id ("4-3-3") or "custom"
  customFormation?: CustomFormation;         // zone grid, when formation === "custom"
  axesOverride?:    Partial<TacticalAxes>;   // axes edited on top of the style
  lineup:           string[];                // ordered playerIds — index = formation slot index
  assistantRotation?: boolean;               // rest tired starters automatically
  setPieceTakers?:  { corners?: string; freeKicks?: string; penalties?: string }; // absent = automatic
  slotInstructions?: ({ variant?: RoleVariantId; press?: "less" | "normal" | "more" } | null)[]; // index = slot
  lineupPresets?:   Partial<Record<"A" | "B" | "C", LineupPreset>>; // saved lineups (#84)
}

interface LineupPreset {
  formation:        string;                  // ready-made id or "custom"
  customFormation?: CustomFormation;         // when formation === "custom"
  lineup:           string[];                // up to 11 player ids, slot order ("" = empty)
  slotInstructions?: (SlotInstruction | null)[];
  savedOn:          string;                  // game date, YYYY-MM-DD
}
```

`lineupPresets` (#84): block "Escalações salvas" of the formation screen (`LineupPresetsPanel`), three
slots A/B/C. "Salvar" stores the screen's formation (free formation included), XI and slot instructions
(`buildLineupPreset`); "Usar" applies one through `applyLineupPreset` and saves formation, lineup and
instructions in one `PUT` — a saved player who left the squad, is injured or suspended is swapped for the
best available player of the slot (`fitnessAdjustedValue`; `replaceUnavailableStarters` for the last two)
and the screen lists the swaps — a starter nobody can replace stays and is listed "sem reserva" (`in: ""`).
Overwrite and delete ask for confirmation, and so does "Usar" over an unsaved XI. The tactics `PUT` runs
under `withSaveLock`. The `PUT` takes the whole object (`null` slot = delete,
`null` = clear all) and validates each preset with `parseLineupPresets` (`src/Domain/tactics/lineupPresets.ts`:
known formation or a valid free formation, ≤ 11 unique string ids (≤ 64 chars), a real date (`isRealIsoDate`), instructions checked against the
preset's own formation); 400 on any error. Presets are never read by a match; a club change (new
`tactics.json`) drops them.

`setPieceTakers` (Etapa 14): three selectors on the tactics screen (`SetPieceTakersPanel`), "Automatic"
by default; validated by `parseSetPieceTakers` on `PUT /api/saves/:id/tactics`; reaches the engine as
`GameState.setPieceTakers` (simulated matches and the live match). The AI never sets it. See
`.claude/rules/game-engine/set-pieces-play.md` → "Cobradores".

`slotInstructions` (Etapa 27): per-slot role variant (18 variants, e.g. inverted full-back, target man)
and individual pressing; validated per slot by `parseSlotInstructions` on `PUT /api/saves/:id/tactics`
(misfit variant → 400), sanitized on a formation change (`sanitizeSlotInstructions`). Man-marking is
per match (`SaveMeta.matchMarking`, `POST /api/saves/:id/match-marking`). The AI never sets either. See
`.claude/rules/game/player-instructions.md`.

API: `GET /api/saves/:id/tactics` · `PUT /api/saves/:id/tactics`. The file is written on the
first `PUT`; until then the save's `formation`/`tactical_style` (`SaveMeta`) and an empty lineup
stand in.

---

## Tactical axes (`TacticalAxes`)

The style (`axesFor(style)`), the live mentality and `axesOverride` resolve into four axes
(`game-engine/tactical-config.md` has the weight tables):

| Axis             | Options                              | Effect in engine |
|------------------|--------------------------------------|-----------------|
| `pressing_style` | `low_block` / `mid_block` / `high_press` | pressing range, press intensity, tackle aggression |
| `defensive_line` | `deep` / `normal` / `high`           | block height     |
| `width`          | `narrow` / `normal` / `wide`         | horizontal spread, off-ball width |
| `build_up`       | `direct` / `balanced` / `possession` | pass and carry weights, long-ball weight |

---

## dpWeights (development points distribution)

Each detailed role in `roles.json` defines how development points (match, training, youth) are
split across five categories, each feeding attributes (`PlayerDevelopment.ts` → `CATEGORY_STATS`):

```
shooting → finishing, heading     passing → passing, vision     defending → tackling, pressing
technical → dribbling             physical → speed, acceleration
```

Weights sum to 1.0 and reflect role identity: a CB grows defending, a ST grows shooting.
`Domain/advanceDay/matches.ts`, `dailyTraining.ts` and `youth.ts` read `dpWeights` keyed by
`player.positions[0]` (fallback `DEFAULT_DP_WEIGHTS`).

---

## Lineup

`lineup` is an ordered array of playerIds (up to 11), where `lineup[i]` maps to formation slot `i`.

- Formation screen lets users drag/click to assign players to slots.
- `buildTeam()` in `gameState.ts` uses the lineup first; falls back to `pickForRole()` if a slot is unset or the player is unavailable.
- Match-setup endpoint returns `myLineup` to the frontend.

---

## Formação livre e eixos (C2, versão 2.1)

Spec: `docs/superpowers/specs/2026-10-01-formation-tactics-design.md`.

- `TacticsSave.customFormation?: { slots: { x, y, role }[] }` + `formation: "custom"`; `TacticsSave.axesOverride?: Partial<TacticalAxes>`.
- `src/Domain/formation/zones.ts`: grade de 5 faixas x 6 profundidades, tabela fixa zona -> posição, `validateCustomFormation` (1 GK, 10 de linha, >= 3 defensores, >= 1 atacante, uma vaga por zona), `customToFormation` (vira um `Formation` comum; ordem dos slots = ordem do `lineup`), `parseCustomFormation`/`parseAxesOverride` (PUT), `CUSTOM_PRESETS` (/lab e /test).
- `formationForTactics(tactics)` (`matchFormations.ts`) substitui `formationForSimId` onde há tactics do jogador (partida simulada, `match-setup`, rotação).
- Eixos efetivos: `effectiveAxes(style, override)`; `axesWithMentality(style, mentality, override?)`, `applyTeamTacticsConfig/applyTeamAttackConfig(team, style, mentality, override?)`. O **estilo** continua dirigindo as intenções.
- UI: `FormationScreen` (arrastar via `useDragDrop`/`lineupDrop.ts`, botão "Editar formação", painel "Instruções da equipe"). `/lab`: `Variant.customFormation`/`axesOverride`; `/test`: formações `free:<preset>` e seletores de eixos.
- quickSim e jogos simulados do jogador só usam a formação (papéis dos slots); os eixos só valem no motor completo, como antes.

---

## Formações prontas e escolha da IA (Etapa 18, #59)

Detalhes e números: `.claude/rules/game/formations.md`.

- 17 formações prontas (`FORMATION_IDS`, `src/Domain/matchFormations.ts`): 3-4-1-2, 3-4-2-1, 3-4-3,
  3-5-2, 4-1-2-1-2, 4-1-4-1, 4-2-2-2, 4-2-3-1, 4-3-1-2, 4-3-2-1, 4-3-3, 4-4-1-1, 4-4-2, 4-5-1, 5-2-3,
  5-3-2, 5-4-1. Todas escolhíveis na tela de Formação, na troca ao vivo (`SubstitutionPanel`), no
  `/test` e no `/lab`; bolas paradas feitas à mão só para 4-3-3, 4-4-2 e 3-5-2, as demais geradas
  das vagas (`generateSetPieces`).
- Equilíbrio contra o 4-3-3 com o mesmo clube dos dois lados (Premier, 400–800 jogos): as antigas
  vão de −8,3 (3-4-3) a +18,1 p.p. (4-2-2-2) de vantagem V−D; as novas de +1,0 (5-2-3) a +22,5
  (4-3-2-1). Tabela completa em `formations.md`.
- **A IA não joga mais sempre 4-3-3:** cada clube escolhe por temporada (`chooseAiFormation`) pelo
  encaixe do elenco, popularidade, estilo e volume de gols, guardado em `Squad.aiFormation`; contra um
  adversário bem mais forte usa a forma defensiva. O clube do jogador usa `TacticsSave.formation`.

---

## Táticas ao vivo (Etapa 35, 4.9)

Na partida ao vivo, a aba "Tática" do painel de substituições muda o estilo e os quatro eixos só para o
jogo (time A, com a mentalidade por cima e a familiaridade do clube); nunca grava `tactics.json`. Ver
`.claude/rules/match-flow.md` → "Live heat map and live tactics".
