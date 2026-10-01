# Bloco C2 — formação e táticas (#21) — Design

Data: 2026-10-01. Status: aprovado. Etapa 9, parte C2. Versão **2.1**. Visual: `.claude/rules/ui-standard.md`.

## 1. Arrastar para trocar

Na tela de formação: arrastar jogador → vaga (atribui), → outro titular (troca), banco ↔ campo.
Pointer events (mouse e toque). O clique continua funcionando. Lesionado continua bloqueado.

## 2. Formação livre (grade de zonas)

- Botão "Editar formação": as vagas ficam arrastáveis e encaixam numa grade de **5 faixas de largura ×
  6 de profundidade** (campo do próprio time). A zona define a posição detalhada, por tabela fixa
  (`src/Domain/formation/zones.ts`): profundidade 1 = GK (só o centro), 2 = defesa (LB/CB/CB/CB/RB, alas
  LWB/RWB na faixa 3 das pontas), 3 = CDM/… etc. Uma vaga por zona.
- Validação: exatamente 1 GK, 10 de linha, ≥ 3 defensores, ≥ 1 atacante. Botão salvar desabilitado com
  o motivo enquanto inválida.
- Dado: `TacticsSave.customFormation?: { slots: { x: number; y: number; role: string }[] }` (x/y = centro
  da zona, mesmas unidades das formações prontas); `formation: "custom"` quando ativa. As formações
  prontas continuam disponíveis como ponto de partida.
- Motor e quickSim: a formação personalizada vira um `Formation` comum (slots com role/x/y; limites de
  movimento pelo role, como hoje). Partida ao vivo, simulada, prévia e `/lab`/`/test` aceitam.

## 3. Instruções (eixos)

- Os quatro eixos ficam editáveis: pressão (`pressing_style`), linha (`defensive_line`), largura
  (`width`), saída de bola (`build_up`). Escolher estilo preenche os quatro (`axesFor(style)`); mudar um
  grava `TacticsSave.axesOverride?: Partial<TacticalAxes>` → rótulo "Personalizado (base X)".
- `applyTeamTacticsConfig`/`applyTeamAttackConfig` recebem os eixos efetivos =
  `axesWithMentality({ ...axesFor(style), ...axesOverride }, mentality)`; o **estilo** continua sendo o
  que dirige as intenções (`TEAM_TACTICAL_STYLE`), como hoje.
- Mentalidade ao vivo inalterada.

## Verificação

Testes: zona → role, validação, conversão para `Formation`, eixos efetivos no motor. `/lab`: variante com
formação personalizada e eixos avulsos. Navegador: arrastar, editar formação inválida/válida, salvar,
jogar uma partida com ela. Changelog 2.1; docs `.claude/rules/tatics.md`; `fixes #21`.
