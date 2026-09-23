# Player Movement Bounds

## Purpose

Movement bounds define the **spatial zone of responsibility** for each role. They are purely tactical constraints — nothing to do with player speed or physical limits. They ensure roles stay in their intended areas of the pitch regardless of what the AI decides to do.

---

## Bound Structure

Each player carries a `bounds` object set at team creation:

```ts
bounds = {
  minX, maxX,  // horizontal zone (yards from left goal line)
  minY, maxY,  // vertical zone (yards from top touchline)
}
```

---

## X Bounds — Role Zones

X bounds come from `roles.json` per role. Defined in Team A's frame of reference; mirrored for Team B.

| Role     | minX | maxX |
|----------|------|------|
| GK       | 2    | 16   |
| CB       | 8    | 50   |
| LB / RB  | 5    | 65   |
| LWB / RWB | 5   | 90   |
| CDM      | 18   | 68   |
| CM       | 22   | 85   |
| LM / RM  | 16   | 75   |
| CAM      | 28   | 90   |
| LW / RW  | 35   | 105  |
| ST       | 40   | 110  |

---

## Y Bounds — Formation Slot Zones

Y bounds are dynamic, centered on the player's formation slot Y position:

```ts
minY = Math.max(0,  slotY - yRange)
maxY = Math.min(74, slotY + yRange)
```

`yRange` comes from the role definition in `roles.json`. Formation slots can override it per slot. Notable values:

| Role     | yRange |
|----------|--------|
| GK       | 8      |
| CB       | 14     |
| LB       | 50     |  ← large to track wide runs
| RB       | 28     |
| LWB/RWB  | 32     |
| CDM      | 18     |
| CM       | 28     |
| LW / RW  | 22     |
| ST       | 22     |

---

## Where Bounds Are Enforced

Applied in four places in `gameState.ts`:

### 1. Formation movement (every tick)
```ts
target = {
  x: Math.max(player.bounds.minX, Math.min(player.bounds.maxX, tx)),
  y: Math.max(player.bounds.minY, Math.min(player.bounds.maxY, ty)),
};
```

### 2. Attacking positioning (`AttackingPositioning.ts`)
Raw target clamped to bounds before being returned.

### 3. Defensive positioning (`DefensivePositioning.ts`)
Raw target clamped to bounds before being returned.

### 4. Ball carrier movement
```ts
const newX = Math.max(bounds.minX, Math.min(bounds.maxX, x + dx * step));
const newY = Math.max(bounds.minY, Math.min(bounds.maxY, y + dy * step));
```
Special case: if bounds prevent meaningful movement (< 0.01 yards), the engine forces a pass instead of leaving the carrier frozen at the edge.

---

## Design Intent

- **Role identity** — a GK confined to 2–16 yds, a ST free from 40–110 yds. Roles stay in their lane.
- **Tactical not physical** — bounds represent zones of responsibility, not reach limits.
- **Y is slot-relative** — a LB on the left and a RB on the right each get their own Y zone centered on their slot, even though they share the same role yRange.
- **Team mirroring** — at team creation, Team B's X bounds are mirrored across the pitch center so role zones stay symmetric.
