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
    crescimento dessas idades), 30–34 → 0,35, 35+ → 0,7. As tabelas de idade não mudaram. (Recalibrado na 4.7 para
    28–29 → 1,0 e 30–34 → 0,39: ver "Áreas de treino".)
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

---

## Áreas de treino (4.7)

Etapa 31a (comissão técnica, `docs/superpowers/specs/2026-10-08-coaching-staff-design.md`, `.claude/rules/game/staff.md`).
As categorias de DP passam a 7 (`DP_CATEGORIES`, `src/GameEngine/PlayerDevelopment.ts`), cada uma uma área de treino:

| Área | Categoria | Atributos |
|---|---|---|
| Goleiros | `goalkeeping` | reflex, jump, pressing |
| Defesa | `defending` | tackling, pressing |
| Ataque | `shooting` | finishing |
| Técnica | `technical` | dribbling |
| Tática | `passing` | passing, vision |
| Físico | `physical` | speed, acceleration, strength, stamina |
| Bola parada | `setPieces` | heading |

- **Pesos pela posição natural:** `dpWeightsFor(player)` (`src/Domain/development/dpWeights.ts`) lê
  `roles.json[preferredRole(player)].dpWeights`. Antes partida, treino e base liam `positions[0]`, que no mundo é a
  linha ("Defender"…): todo jogador de linha caía em `DEFAULT_DP_WEIGHTS`. Muda a distribuição por atributo (cada um
  segue o próprio papel), não o total de DP.
- **Multiplicador de área** (`areaMultsOf(squad)`, `src/Domain/staff/staff.ts`): só no crescimento da categoria
  (partida, treino, base), nunca no declínio por idade: `DP(categoria) = (crescimento × multÁrea − declínio) × peso`.
  3★ = 1 (neutro), 1★ ×0,7, 5★ ×1,25, área vaga ×0,4. A IA usa as estrelas implícitas do tier.
- **Pesos do goleiro:** `goalkeeping 0,31 · passing 0,12 · technical 0,27 · physical 0,30` (os de antes com
  `defending` trocado por `goalkeeping`). A spec previa `goalkeeping 0,50`: o overall do goleiro é quase só reflex e
  jump, então com 0,50 ele crescia 1,7–1,8× o overall de um jogador de linha (meta 0,6–1,4×).
- **`decayDpScale` recalibrado:** 28–29 1,5 → **1,0**, 30–34 0,35 → **0,39** (35+ 0,7 igual). Físico divide o DP
  entre 4 atributos e o cabeceio ganhou área própria: cada atributo recebe uma parte menor e a semente de meio passo
  (progresso zerado na virada) esconde mais da variação. Sem o ajuste, 27 anos saía −29% e 31 −21% do ritmo de antes.

Medição (`bun scripts/development-pace.ts [--areas <1..5|vaga>]`, caso "realista"; "antes" =
`--module`/`--roles` com as cópias do commit anterior). Δ em 3 temporadas; "linha" = média dos três perfis de linha.

| Média dos 13 atributos (linha) | 18 | 21 | 24 | 27 | 31 | 33 |
|---|---|---|---|---|---|---|
| Antes (5 categorias) | 0,385 | 0,308 | 0,256 | 0,051 | −0,121 | −0,382 |
| 3★ (neutro) | 0,390 | 0,313 | 0,251 | 0,049 | −0,126 | −0,377 |
| Diferença | +1,3% | +1,6% | −2,0% | −3,9% | +4,1% | −1,3% |

| Áreas | 18 | 21 | 24 | 27 | 31 | 33 | base 16 anos (3 temporadas) |
|---|---|---|---|---|---|---|---|
| Vagas (×0,4) | 0,144 | 0,095 | 0,069 | −0,008 | −0,138 | −0,377 | 0,215 / 0,438 / 0,585 |
| 1★ (×0,7) | 0,310 | 0,210 | 0,154 | 0,026 | −0,138 | −0,377 | 0,369 / 0,677 / 0,923 |
| 2★ | 0,346 | 0,246 | 0,187 | 0,031 | −0,133 | −0,377 | 0,454 / 0,769 / 1,062 |
| 3★ | 0,390 | 0,313 | 0,251 | 0,049 | −0,126 | −0,377 | 0,500 / 0,885 / 1,192 |
| 4★ | 0,428 | 0,341 | 0,279 | 0,064 | −0,123 | −0,377 | 0,554 / 0,954 / 1,262 |
| 5★ (×1,25) | 0,469 | 0,372 | 0,300 | 0,074 | −0,123 | −0,377 | 0,608 / 1,038 / 1,362 |

O DP da área é exatamente ×0,4 / ×1,25 (teste); a variação realizada fica em 27–37% (vagas) e ×1,20 (5★) do
crescimento de 3★ aos 18–24, porque a virada zera o progresso e a parte menor de cada atributo some na semente de meio
passo. Na base (progresso nunca zerado) as vagas dão 43–49%. O declínio aos 33 é idêntico em todas as linhas (a área
nunca toca o declínio); aos 31 o pouco crescimento que resta é o que muda.

Goleiro (reflex 5, jump 5, pressing 5, passing 4, o resto 3), 3★:

| Goleiro | 18 | 21 | 24 | 27 | 31 | 33 |
|---|---|---|---|---|---|---|
| Δ reflex (= Δ jump) | +0,6 | +0,4 | +0,4 | +0,1 | −0,2 | −0,5 |
| Δ overall | 0,598 | 0,399 | 0,379 | 0,100 | −0,199 | −0,498 |
| Δ overall da linha | 0,466 | 0,364 | 0,292 | 0,047 | −0,142 | −0,406 |
| Goleiro / linha | 1,28× | 1,10× | 1,30× | | | |
| Antes (5 categorias): Δ overall | 0,145 | 0,101 | 0,101 | 0 | −0,038 | −0,091 |

Antes o goleiro não evoluía reflex nem jump (Δ 0 em toda idade) e o overall dele quase não andava (0,31× o da linha).

---

## Condição do CT na DP de partida (Etapa 34, instalações vivas)

O clube do jogador com os itens de DP do CT (campos de treino, academia, refeitório) abaixo de 40% de condição também
ganha menos DP de partida: × `effectAt(CT_MATCH_DEV_MIN 0,82, média da condição)` (× 0,91 a 20%), em
`finalizeSquadsAfterMatch` junto do auxiliar, renascido, profissionalismo e moral (`trainingGroundEffectsOf().matchDevMult`).
Só o crescimento; o declínio por idade não muda. IA e condição ≥ 40%: × 1. Medição (`bun scripts/development-pace.ts
--ct 20 [--sessions 200]`): Δ da média dos 13 atributos −6,5% na média de 18/21/24 anos, linha e goleiro. Ver
`.claude/rules/game/facilities.md` → M3.

## Torneios de base (Etapa 36)

Um jogo de base dá DP de crescimento com os fatores de uma partida × `YOUTH_COMP.DP_MULT` (1,0 até 21 anos) ou
`DP_MULT_OVERAGE` (0,18 acima), sem declínio por idade (ele já vem dos jogos do clube). Medição em
`.claude/rules/game/youth-competitions.md` → "Medições".
