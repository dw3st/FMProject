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

The engine (`Formation.ts`, `TeamLineup.ts`) always works with detailed roles internally.

### Source of truth

- `src/Data/roles.json` — each entry has `mainRole`, `dpWeights`, and formation `position` data.
- `src/GameInterface/positionHelpers.ts` — `getMainRole()`, `getPositionColor()`, `getPositionGroup()`, `MAIN_ROLE_ABBR`, `POSITION_GROUP_ORDER`.

**Never duplicate** `getPositionColor` or group logic in individual components. Import from `positionHelpers`.

---

## Tactics save (`tactics.json`)

Stored at `Data/saves/{saveId}/tactics.json`. Separate from the light `SaveMeta`.

```ts
interface TacticsSave {
  formation:      string;    // "4-3-3"
  pressing_style: PressingStyle;
  defensive_line: DefensiveLine;
  width:          TeamWidth;
  build_up:       BuildUpStyle;
  offside_trap:   boolean;
  lineup:         string[];  // ordered playerIds — index = formation slot index
  setPieceTakers?: { corners?: string; freeKicks?: string; penalties?: string }; // player ids; absent = automatic
}
```

`setPieceTakers` (Etapa 14): three selectors on the tactics screen (`SetPieceTakersPanel`), "Automatic"
by default; validated by `parseSetPieceTakers` on `PUT /api/saves/:id/tactics`; reaches the engine as
`GameState.setPieceTakers` (simulated matches and the live match). The AI never sets it. See
`.claude/rules/game-engine/set-pieces-play.md` → "Cobradores".

API: `GET /api/saves/:id/tactics` · `PUT /api/saves/:id/tactics`

Migration: if `tactics.json` is missing, `SaveService.getTactics()` builds it from `SaveMeta` fields automatically.

---

## Tactical settings (TacticsConfig)

| Field            | Options                              | Effect in engine |
|------------------|--------------------------------------|-----------------|
| `pressing_style` | `low_block` / `mid_block` / `high_press` | pressing range, press intensity |
| `defensive_line` | `deep` / `normal` / `high`           | block height     |
| `width`          | `narrow` / `normal` / `wide`         | horizontal spread |
| `build_up`       | `direct` / `balanced` / `possession` | pass risk, progression bias |
| `offside_trap`   | `true` / `false`                     | defensive line advance |

---

## dpWeights (development points distribution)

Each detailed role in `roles.json` defines how development points earned from a match are split across the five base attributes:

```
shooting, passing, defending, positioning, physical
```

Weights must sum to 1.0. They reflect role identity — a CB grows defending; a ST grows shooting.

`advanceDay.ts` reads `roleEntry.dpWeights` from `roles.json` keyed by `player.positions[0]`.

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
