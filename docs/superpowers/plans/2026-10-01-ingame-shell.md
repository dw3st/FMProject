# Bloco A — moldura do jogo — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

Spec: `docs/superpowers/specs/2026-10-01-ingame-shell-design.md`. Branch `feat/ingame-shell`. Regras:
imports `@/`; Tailwind (sem `style={{}}` salvo valor dinâmico); ícones só via `Icons.tsx`; i18n en +
pt-BR; commits por pathspec com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sem
amend/`add -A`/stash/checkout/reset; nunca matar todos os `bun`; nunca commitar `src/Data`.
Referência de tom: `StartScreen.tsx`, `StatsScreen.tsx`, `Components/Wordmark.tsx`.

- [ ] **Task 1 — componentes:** `src/GameInterface/ui/{Panel,DataTable,Button,Tabs,Notice}.tsx`
  (+ teste de render simples com `renderToStaticMarkup`). Commit `feat(ui): shared minimal components`.
- [ ] **Task 2 — moldura:** `Layout.tsx`, `TopNavigation.tsx`, `StatusBar.tsx` (e o que mais a moldura
  usar, ex. `ClubSidebar` se fizer parte dela) conforme a spec §1; manter comportamento. Commit
  `feat(ui): minimal in-game shell`.
- [ ] **Task 3 — aviso de tela:** `ScreenSizeGate.tsx` (1024×600, visual novo, i18n). Commit
  `feat(ui): smaller screen gate, new look`.
- [ ] **Task 4 — título + celular:** `<title>FMProject</title>` na landing; revisar classes de landing,
  login e start para 375px (sem `min-w` fixos, sem rolagem horizontal, botões ≥ 40px). Commit
  `fix(ui): entry screens on small phones`.
- [ ] `bunx tsc --noEmit -p .`; `bun test src/GameInterface`.
