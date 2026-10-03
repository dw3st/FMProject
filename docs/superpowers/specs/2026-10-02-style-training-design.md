# Etapa 15 — Treino de estilos de jogo (#43) — Design

Data: 2026-10-02. Status: aprovado. Versão **2.10**. Regra do projeto: `/test`, `/lab`, `Statistics.ts`.

## 1. Familiaridade

`Squad.styleFamiliarity?: Record<FamiliarityKey, number>` (0..100), só no clube do jogador.
`FamiliarityKey` = os `TacticalStyle` existentes + `high_line_trap` + `long_ball`. Ausente = valor inicial
(`INITIAL_FAMILIARITY` 50; o estilo salvo em `tactics.json` na criação começa em 70). IA: familiaridade
implícita `AI_FAMILIARITY` (75) no próprio estilo, 50 nos demais — nada gravado.

## 2. Treino

`TrainingConfig.styleFocus?: FamiliarityKey` na tela de treino. Cada sessão de treino (dia de treino do
clube) soma `GAIN_PER_SESSION` (≈ 2) × multiplicador do auxiliar (`staffEffectsOf().devMult`) ao foco, com teto
suave (ganho × (1 − v/100)); os demais caem `DECAY_PER_DAY` (≈ 0,15) até um piso de 30. Puro em
`src/Domain/familiarity/`.

## 3. Efeito no motor

`familiarityFactor(v)` linear: 0 em 50, +1 em 100, −1 em 0. Aplicado nos pesos de tática do estilo do time
(`applyTeamAttackConfig`/`applyTeamTacticsConfig`) como um ajuste pequeno e direcionado:
- posse: `LANE_WEIGHT`/acerto de passe curto (até ±3%);
- pressão alta: `PRESS_INTENSITY` (até ±0,05) e custo de fôlego do press (+10% sempre que pressão alta);
- contra-ataque/direto: peso de progressão (até ±3%);
- `high_line_trap`: `DEFENSIVE_LINE_HEIGHT` e consciência de impedimento;
- `long_ball`: peso do lançamento longo (Etapa 13).
O estilo (não a familiaridade) continua dirigindo as intenções. Mentalidade aplica por cima, como hoje.
quickSim: fator de força do time × (1 + 0,02 × familiarityFactor) — pequeno.

## 4. Meta de efeito

100 vs 50 de familiaridade no mesmo estilo, mesmo elenco: +2 a +4 p.p. na taxa de vitória (`/lab`, 400 jogos).
Gols e chutes de um confronto 50×50 inalterados por construção (fator 0 em 50).

## 5. Telas

Táticas: barras de familiaridade por estilo (a do estilo atual destacada). Treino: seletor "Foco de estilo".
Inbox semanal opcional não. `/lab`: `Variant.familiarity?: number` (slider). `/test`: seletor de
familiaridade por time no painel de táticas. Docs `.claude/rules/game/style-training.md`. Changelog 2.10.
