# Etapa 19 — Equilíbrio entre formações (#63) — Design

Data: 2026-10-03. Status: aprovado. Versão **3.4**.

## Problema (medição da Etapa 18, motor, mesmo elenco, contra o 4-3-3)

4-3-2-1 +22 p.p., 4-1-2-1-2 +20, 4-2-2-2 +18, 4-4-2 +13 … 3-4-3 −8; o 4-3-3 perde para quase tudo. Formações
com linha de três / dois atacantes: ~+34% de gols no jogo espelho (IA proibida de usá-las pela penalidade de
volume em `aiFormation`).

## Meta

- Toda formação dentro de **±8 p.p.** de vantagem (V% − D%) contra a média das outras, com elencos iguais.
- **4-3-3 no meio da faixa** (continua padrão do novo jogo e da IA), não a mais fraca.
- **Volume de gols e chutes do motor dentro de ±5%** do atual (premier_league + of_championship, rodadas
  somadas — o motor não tem semente). Gols no espelho de cada formação dentro de ±15% da média.

## Fases

1. **Diagnóstico** (sem mudar comportamento): script `scripts/formation-matrix.ts` — matriz 17×17 (ou 17 contra
   um conjunto de referência: 4-3-3, 4-4-2, 4-2-3-1, 3-5-2) com V/E/D, gols, posse, chutes por zona (central/
   lateral, dentro/fora da área), progressão pelo meio × pelas pontas, cruzamentos, roubadas por zona,
   through balls e de onde vêm os gols. Relatório do mecanismo em `.claude/rules/game/formations.md`.
2. **Correção pela causa** com alavancas existentes do motor e da config tática (posicionamento defensivo,
   compactação, cobertura do corredor central, cobertura das costas dos alas/linha de três, valor do jogo pelas
   pontas e dos cruzamentos, pesos de passe por zona) — **sem bônus/malus por id de formação**, sem campos de
   viés soltos (regra de `tactical-config.md`). Ajuste de posições de slot das formações só onde a forma está
   errada (ex.: alas da linha de três).
3. **Liberar a IA:** retirar a penalidade de volume de gols de `aiFormation` (ou reduzir ao mínimo) e
   reconferir a distribuição; recalibrar o quickSim (`quicksim-spread`) se o volume por formação mudar.
4. **`/lab`:** tela/aba "Matriz de formações" reaproveitando o runner, para acompanhar o equilíbrio.

## Verificação

Matriz antes/depois documentada; volume de gols/chutes ±5%; testes do motor; smoke de temporada.
Changelog 3.4, ROADMAP etapa 19 ✅ (#63).
