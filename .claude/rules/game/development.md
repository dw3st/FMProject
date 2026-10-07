# Feature: Player Development System

## 1. Core Principles

* No hidden potential
* Growth is driven by:

  * Match performance (main)
  * Age
  * Role
* Attributes range: **0 → 10**
* Progression becomes harder at higher levels
* Players peak around **28**
* Decline starts after and becomes inevitable at **32+**

---

## 2. Data Model

```text
Player {
  age
  role

  attributes {
    shooting
    passing
    defending
    positioning
    physical
  }

  progress {
    shootingDP
    passingDP
    defendingDP
    positioningDP
    physicalDP
  }
}
```

---

## 3. DP Generation (Performance-Based)

After each match:

```text
earnedDP = baseDP * performanceMultiplier * minutesFactor
```

### Performance Multiplier (based on match rating)

* 8.5+ → 2.0
* 7.0+ → 1.0
* 6.0+ → 0.5
* <6.0 → 0

### Minutes Factor

* Full match → 1.0
* Partial → proportional
* No play → 0

---

## 4. Age System (Growth + Decline)

### Growth Multiplier

```text
16–18  → 1.8
19–21  → 1.5
22–25  → 1.2
26–27  → 0.8
28     → 0.4
29–31  → 0.1
32+    → 0.0
```

---

### Age Decay (per update)

```text
16–27  → 0
28     → low
29     → low+
30–31  → medium
32–34  → high
35+    → very high
```

---

### Final DP

```text
netDP = (earnedDP * ageGrowthMultiplier) - ageDecay
```

* Can be positive (growth) or negative (decline)

---

## 5. Role-Based Distribution

Each role defines how DP is split.

### Example

#### Striker (ST)

* Shooting → 45%
* Positioning → 25%
* Physical → 15%
* Passing → 10%
* Defending → 5%

#### Midfielder (CM)

* Passing → 35%
* Positioning → 25%
* Physical → 15%
* Defending → 15%
* Shooting → 10%

#### Defender (CB)

* Defending → 45%
* Positioning → 30%
* Physical → 15%
* Passing → 10%
* Shooting → 0–5%

---

## 6. Performance Modifier (Simple)

You chose: **based only on final match rating**

This affects total DP (not per attribute):

```text
totalDP = baseDP * performanceMultiplier
```

No per-action complexity.

---

## 7. Attribute Progression Scaling

Each attribute has increasing cost.

```text
dpRequired = baseCost * (1 + value^2 * scale)
```

### Effect

* 0 → 1 = easy
* 5 → 6 = medium
* 9 → 10 = very hard

---

## 8. High Attribute Slowdown (Soft Cap)

Reduce effectiveness at high values:

```text
effectiveDP = netDP * (1 - (value / 10)^2)
```

---

## 9. Progress System

Each attribute tracks its own DP:

```text
progressDP += effectiveDP
```

---

### Level Up

```text
if progressDP >= requiredDP:
  value += 1
  progressDP -= requiredDP
```

---

### Level Down (Decline)

```text
if progressDP < 0:
  value -= 1
  progressDP += requiredDP(previous level)
```

---

## 10. Full Update Flow

For each player after match/week:

1. Calculate `earnedDP` (performance + minutes)
2. Apply age growth multiplier
3. Subtract age decay → `netDP`
4. Apply high-attribute penalty
5. Split DP using role weights
6. Add DP to each attribute
7. Resolve level up/down per attribute

---

## 11. Lifecycle Result (Expected Behavior)

* Young players improve quickly
* Mid-age players improve slowly
* Peak at ~28
* 29–31 → must perform to maintain
* 32+ → decline inevitable
* High stats (8–10) are rare and hard to sustain

---

## 12. Constraints (Important)

* No random growth
* No hidden potential
* No per-action stat system (for now)
* Role defines identity
* Performance defines speed

---

## Final Summary

This system guarantees:

* Predictable progression
* Emergent player stories
* Controlled balance
* Low complexity

---

---

## Personalidade (Etapa 26)

Profissionalismo multiplica a DP de partida, treino e base (×0,85..×1,15) e o declínio por idade (×1,1..×0,9).
Ver `.claude/rules/game/personality.md`.

---

## Passo de 0,1 (4.5)

Desde a 4.5 os atributos têm uma casa decimal e evoluem em passos de 0,1 (um ponto na tela 0–100), em
`src/GameEngine/PlayerDevelopment.ts`:

- **Passo e custo:** `ATTR_STEP = 0.1`; `dpRequired(v) = BASE_COST × 0,1 × (1 + v² × SCALE)`, no valor contínuo (dez
  passos custam um ponto antigo, cobrado a cada décimo). Valores com `roundAttr` a cada passo; as mudanças de uma
  chamada saem agregadas por atributo (`StatLevelChange.delta` decimal). A `DevelopmentScreen` usa o mesmo `dpRequired`.
- **Semente:** progresso sem histórico (e o zerado na virada) começa no meio do **passo** (`dpRequired(v) × 0,5`). A
  semente com o valor absoluto antigo (meio ponto = cinco passos) seria convertida na hora em +0,4..0,5 em todo atributo.
- **Por que as escalas:** a virada zera o progresso (`seasonTransition`). Com passo de 1 ponto, um atributo só se
  movia na temporada quando o DP passava de meio ponto: essa zona morta escondia boa parte do crescimento e quase todo
  o declínio dos 30–34. Sem ela, o mesmo DP subia ~2× e caía ~3× mais rápido.
  - `GROWTH_DP_SCALE = 0,43` multiplica o DP ganho (partida e treino).
  - `decayDpScale(idade)` multiplica o declínio por idade: 28–29 → 1,5 (a zona morta também escondia o pouco
    crescimento dessas idades), 30–34 → 0,35, 35+ → 0,7. As tabelas de idade não mudaram.
- **Base:** o progresso da base nunca é zerado (sem zona morta), então `developYouthSeason` divide a
  `GROWTH_DP_SCALE` de volta: um jovem de 16 anos segue em +0,50 / +0,85 / +1,15 acumulado em 3 temporadas (antes
  +0,46 / +0,92 / +1,15).

Medição (`bun scripts/development-pace.ts [--module <cópia antiga>]`), caso realista: 3 temporadas, progresso
zerado e idade +1 a cada virada, 38 partidas (uma em três com nota 7,2, as outras 6,4) e uma sessão normal por
partida; Δ da média dos 13 atributos, média de três perfis (meia com tudo 5, atacante, zagueiro):

| Idade inicial | 18 | 21 | 24 | 27 | 31 | 33 |
|---|---|---|---|---|---|---|
| Antes (passo de 1 ponto) | 0,385 | 0,282 | 0,256 | 0,051 | −0,128 | −0,385 |
| Depois (passo de 0,1) | 0,385 | 0,308 | 0,256 | 0,051 | −0,121 | −0,382 |

Por perfil os números antigos andam em múltiplos de 1/13 (zona morta: o atacante tem Δ 0 aos 27 e aos 31), por isso a
calibração é pela média. Sem virada (idade fixa, progresso carregado; não é o que o jogo faz) o ritmo novo fica em
cerca da metade do antigo no crescimento.
