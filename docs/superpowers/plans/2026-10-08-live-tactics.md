# Plano: Etapa 35 (mapa de calor e táticas ao vivo)

Spec: `docs/superpowers/specs/2026-10-08-live-tactics-design.md`.

1. `src/Domain/match/possessionHeatmap.ts` (+ teste): acumulador (grade 12×8, total + anel de 10 minutos),
   amostra a partir do `GameState`, normalização pelo `attackDir`, leitura com janela e espelhamento,
   (de)serialização para o snapshot.
2. `src/Domain/tactics/liveTactics.ts` (+ teste): troca de estilo/eixo (ajuste mínimo) e
   `applyLiveTactics(team, ...)`; teste de que não chama `fetch` e não toca o time B.
3. `Components/PossessionHeatmap.tsx` (cartão SVG, relê a cada 1 s) e `LiveTacticsPanel.tsx` (aba Tática).
4. `MatchScreen`: acumulação no `stateChanged`, cartão abaixo do Resumo, aba Tática, snapshot.
5. `TestScreen`: mapa de calor opcional.
6. i18n en/pt-BR, changelog 4.10, `package.json`, regras (`match-flow.md`, `tatics.md`), ROADMAP 35 ✅.
7. `bun run typecheck`, `bun run ui:audit`, testes das áreas.
