# Set Pieces — Simplified (Position Only)

## 1. Core Rule

Set pieces define only:

* **where players stand before restart**

Nothing else.

No intent, no behavior flags.

---

## 2. Data Model

### FormationSetPieces

```
FormationSetPieces {
  formationId

  kickOff
  goalKick
  corner_Attack
  corner_Defend
  throwIn_Attack
  throwIn_Defend
  freeKick_Attack
  freeKick_Defend
}
```

---

### SetPieceLayout

```
SetPieceLayout {
  slots: List<SetPieceSlot>
}
```

---

### SetPieceSlot

```
SetPieceSlot {
  roleId      // ST, CM, CB, etc
  x           // 0–1 (pitch width)
  y           // 0–1 (pitch length)
}
```

That’s it.

---

## 3. Key Principles

### 3.1 Role-Based (not player-based)

* Layout is tied to **roles**
* At runtime → roles map to actual players

---

### 3.2 Normalized Coordinates

```
x: 0 → left
x: 1 → right

y: 0 → own goal
y: 1 → opponent goal
```

Flip automatically depending on side.

---

### 3.3 Deterministic Setup

* Players move to exact positions
* No randomness
* No micro-adjustments

You want stability first.

---

## 4. Example — Goal Kick (4-3-3)

```
goalKick: [
  { role: GK,   x: 0.5, y: 0.05 },

  { role: CB_L, x: 0.3, y: 0.15 },
  { role: CB_R, x: 0.7, y: 0.15 },

  { role: LB,   x: 0.1, y: 0.25 },
  { role: RB,   x: 0.9, y: 0.25 },

  { role: CM,   x: 0.5, y: 0.25 },

  { role: LW,   x: 0.2, y: 0.6 },
  { role: RW,   x: 0.8, y: 0.6 },
  { role: ST,   x: 0.5, y: 0.7 }
]
```

---

## 5. Example — Corner (Attack)

```
corner_Attack: [
  { role: LW,   x: 0.0, y: 1.0 },  // taker (implicit)

  { role: ST,   x: 0.5, y: 0.9 },
  { role: CB_L, x: 0.4, y: 0.85 },
  { role: CB_R, x: 0.6, y: 0.85 },

  { role: CM,   x: 0.5, y: 0.75 },

  { role: LB,   x: 0.2, y: 0.6 },
  { role: RB,   x: 0.8, y: 0.6 }
]
```

---

## 6. Runtime Flow

1. Detect set piece type
2. Load layout from formation
3. Map roles → players
4. Move players to positions
5. Wait until all players are "ready"
6. Resume normal decision system

Important:

👉 The moment the ball is touched → your normal AI takes over

---

## 7. Special Case (Minimal Handling)

You only need one implicit rule:

* The player closest to the ball position becomes the **taker**

No need to encode it.

---

## 8. Constraints (Keep It Clean)

* No action types
* No priorities
* No decision hints
* No dynamic offsets

---

## 9. Why This Works

This gives you:

* Clean separation: **structure vs intelligence**
* Easy tuning per formation
* No premature complexity
* Compatible with your future decision system (pass/carry/commitment)

---

## Estado atual (Etapa 14, 3.0)

Este documento descreve os **layouts fixos por formação** (`SetPieceLayouts.ts`), que continuam
valendo para saída de bola, tiro de meta, lateral, impedimento e o resto do campo na falta direta.
O escanteio e a falta cruzada não usam mais `corner_Attack`/`corner_Defend`: as posições são
calculadas por jogador (melhores no alto na área, marcação individual, barreira dinâmica na falta
direta) e o cobrador decide a cobrança (cruzar em uma de três zonas ou tocar curto). Ver
`.claude/rules/game-engine/set-pieces-play.md`.
