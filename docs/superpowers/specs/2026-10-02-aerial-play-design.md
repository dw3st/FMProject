# Etapa 13 — Jogo aéreo — Design

Data: 2026-10-02. Status: aprovado (pacote completo). Versão **2.8**. Depende da Etapa 12 (motor).
Regra do projeto: toda mecânica nova chega ao `/test`, ao `/lab` e ao `Statistics.ts`.

## 1. Bola alta

`PassState.kind` ganha `cross` e `long_ball` (além de normal e `through`). Bola alta voa mais devagar no
início e não é interceptável no meio do caminho (só no ponto de queda), exceto por quem está a < 2 jardas do
passador no lançamento (bloqueio).

## 2. Cruzamento

- Candidato do portador no terço final, faixa lateral (fora do corredor central) ou perto da linha de fundo.
- Alvos: 2–3 pontos na área (primeiro pau, marca do pênalti, segundo pau). Score = (atacantes na zona do
  alvo − defensores) + passe do cruzador + cabeceio dos atacantes próximos, comprimido como as outras ações
  (`CROSS_STRONG_RAW`), competindo em `decideBallHolder`.
- Atacantes na área fazem corrida para os alvos durante o voo (reaproveita o `chase` do through ball).

## 3. Disputa aérea

- Na queda, jogadores a ≤ `AERIAL_RADIUS` do ponto disputam: score = heading×0,45 + jump (atributo cru do
  elenco, hoje só usado pelo goleiro)×0,25 + força×0,15 + posição (distância ao ponto)×0,15.
- Goleiro: se o ponto está na pequena área ou ele chega primeiro, sai — agarra (posse) ou soca (bola solta)
  conforme reflexo/posicionamento.
- Vencedor atacante perto do gol → cabeçada (seção 4) ou ajeita (passe curto de cabeça). Vencedor defensor →
  afasta (bola solta longe do gol / escanteio se sair pela linha de fundo). Ninguém → bola solta.

## 4. Cabeçada

xG próprio: `computeXG` × `HEADER_XG_MULT` (≈0,55), ajustado por cabeceio do finalizador (no lugar de
`shootAccuracy`) e pressão. Mesma resolução com o goleiro.

## 5. Lançamento longo

Passe por cima da linha para um atacante ou espaço atrás da defesa; peso maior com `build_up: direct` (campo
novo nos pesos de tática, sem viés solto). Na chegada: disputa aérea se há defensor perto, senão bola solta
(corrida como o through ball).

## 6. quickSim

Fração dos gols de cabeça (`HEADER_GOAL_SHARE`, medida no motor) atribuída por `heading` entre os titulares;
estatísticas de cruzamento/disputa por Poisson, médias do motor.

## 7. Calibração

Por partida do motor: cruzamentos ~10–20, disputas aéreas ~15–30, gols de cabeça ~10–15% dos gols, lançamentos
longos ~5–15 (mais com `direct`). Gols e chutes dentro de ±5% do atual (200+ jogos premier_league,
150 of_championship). Script `scripts/aerial-calibrate.ts`.

## 8. Superfícies

`Statistics.ts`: `crosses`, `crossesCompleted`, `aerialDuels`, `aerialDuelsWon`, `headers`, `headerGoals`,
`longBalls`, `longBallsCompleted`; notas (disputa ganha +0,05, gol de cabeça = gol). `/test`: cenário
`cross-to-box`, overlay do alvo do cruzamento e do raio da disputa, log `aerial`. `/lab`: linhas em
`PairDetail`. MCP debug: `evaluate_cross` se viável. Docs `.claude/rules/game-engine/aerial.md`. Changelog 2.8.
