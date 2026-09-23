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

Used in: squad table, dashboard player card, scout table, squad screen, development screen, ClubSidebar.

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
}
```

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
