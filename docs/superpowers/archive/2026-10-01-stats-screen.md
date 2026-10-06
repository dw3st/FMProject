# Tela Stats + estrelas + #24 + #7 — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

Spec: `docs/superpowers/specs/2026-10-01-stats-screen-design.md`. Branch `feat/stats`. Regras:
imports `@/`; Tailwind; ícones via `Icons.tsx`; i18n en + pt-BR; rótulos de liga/competição só por
`src/Domain/world/labels.ts`; commits por pathspec com
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; sem amend/`add -A`/stash/checkout/reset;
nunca matar todos os `bun`; nunca commitar `src/Data`.

### Task 1: rankings (domínio + rota)
`src/Domain/stats/rankings.ts` (+ teste) `buildCompetitionRankings`; rota
`GET /api/saves/:id/stats?competition=` (dono do save, slug validado, cache por dia/versão como o
scout). Commit `feat(stats): competition rankings`.

### Task 2: estrelas
`src/Domain/world/stars.ts` → `Record<id, "gold"|"blue"|"green">` (regras da spec) + teste; rota
`/stars`; `useStarPlayers` (Map), `StarBadge` com `kind` e legenda; todos os usos atualizados.
Commit `feat(stars): gold, blue and green stars` (`fixes #28`, `fixes #29`).

### Task 3: tela
`src/pages/stats/` + `StatsScreen.tsx` (abas Rankings / Meu time, seletor de competição, legenda das
estrelas); navegação aponta para `/stats`; registrar a rota no servidor como as outras páginas.
Commit `feat(ui): stats screen`.

### Task 4: #24
`LedgerEntry.ref` completo nos pontos que gravam (`financial.ts`, prêmios em `advanceDay.ts`,
`FinancialService`); `FinancesScreen` + preview `league_prize` montam o texto por `kind`+`ref` com
i18n; `label` só fallback. Testes. Commit `fix(finance): translated ledger labels` (`fixes #24`).

### Task 5: changelog + docs
Changelog 1.8 + `package.json` 1.8.0; `.claude/rules/game/stats.md` curto; ROADMAP Etapa 8 ✅.
`bunx tsc --noEmit -p .`; `bun test src/Domain src/backend src/GameInterface`.

### Task 6 (agente separado, em paralelo): #7
Medir Bundesliga e Serie A no mundo atual (`quicksim-spread.ts collect <liga> 200 2 <arquivo>
--fitness 88`, depois `analyze`). Relatar motor × quickSim. Dentro de ±10% nas duas → só documentar
em `.claude/rules/non-player-games.md` e fechar (`fixes #7` no commit de docs). Fora → relatar e
parar (a recalibração completa é decidida depois).
