# Rotação — assistente (+ #10) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** o clube do jogador ganha sugestão de rotação na prévia e um modo automático; #10 fecha a
porta da rede local. Versão 1.6.

Spec: `docs/superpowers/specs/2026-09-30-rotation-assistant-design.md`. Branch `feat/rotation`.
Regras: imports `@/`; Tailwind; ícones via `Icons.tsx`; i18n en + pt-BR; commits por pathspec com
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sem amend/`add -A`/stash/checkout/reset;
nunca matar todos os `bun`; nunca commitar `src/Data`. Contexto: `.claude/rules/game/fitness.md`
(seção 4), `.claude/rules/game/injuries.md` (seção 5).

### Task 1: `suggestRotation` (pura)
`src/Domain/lineupHelpers.ts` (+ teste): extrair do `autoFillLineupWithFitness` a lógica de troca
por fôlego para `suggestRotation(slots, lineupIds, players, date): { out: string; in: string }[]`,
e fazer `autoFillLineupWithFitness` usá-la (comportamento da IA idêntico — testes existentes
passam sem mudança). Testes novos: cansado trocado; goleiro isento acima de 60 e sem reserva ≥ 85;
sem reserva claramente melhor → vazio; reserva lesionado nunca entra; reserva usado uma vez só.
Commit `feat(rotation): suggestRotation`.

### Task 2: dados + backend
- `TacticsSave.assistantRotation?: boolean` (padrão false), GET/PUT de táticas.
- `SaveMeta.rotationOverride?: { date: string; swaps: {out,in}[]; optOut?: boolean }`.
  `POST /api/saves/:id/rotation-override` `{ date, swaps, optOut? }` (dono do save; `date` =
  `currentDate`; valida que cada troca está em `suggestRotation` do dia — rejeita 400 senão).
- `resolveUserLineup(..., date, { assistantRotation, override })`: depois de `replaceInjuredStarters`,
  se `override?.date === date` aplica `override.swaps` (ou nada se `optOut`); senão, se
  `assistantRotation`, aplica `suggestRotation`. Devolve também `rotationApplied: {out,in}[]`.
- `POST /api/match-setup` devolve `rotationSuggestion` (sugestões ainda não aplicadas) e
  `rotationApplied`; `computeMatchSimulationLineups` passa o mesmo para o jogo simulado.
- Testes: override vale só na data; auto ligado aplica; 3 jogos em 7 dias com auto ligado poupa ≥1
  titular no 3º (molde de `src/backend/fitness.congestion.test.ts`).
Commit `feat(rotation): assistant rotation in lineups`.

### Task 3: telas
- `MatchPreviewScreen`: bloco "Poupar N cansados?" (sai X (fôlego%) → entra Y (fôlego%)) com
  Aplicar (POST override com as trocas) / Ignorar; se `rotationApplied` não vazio: "O assistente
  poupou N jogadores" + lista + Desfazer (POST override `optOut: true`). Estilo do aviso de fôlego
  já existente. `MatchScreen` usa a escalação resolvida pelo `match-setup` (já inclui o override).
- Tela de táticas: toggle "Assistente escala por fôlego" salvo em `assistantRotation`.
- i18n en/pt-BR. Commit `feat(ui): rotation suggestion and assistant toggle`.

### Task 4: #10, smoke, changelog, docs
- `docker-compose.yml`: `"127.0.0.1:9400:3000"`.
- Smoke (`scripts/season-rollover-smoke.ts`): ligar `assistantRotation` no clube do jogador; checar
  que ao menos uma partida teve XI diferente da escalação salva por fôlego.
- Changelog 1.6 (pt/en, curto: sugestão de rotação na prévia; assistente pode escalar por fôlego) +
  `package.json` 1.6.0. `.claude/rules/game/fitness.md` ganha a seção do assistente; ROADMAP Etapa 6 ✅,
  #10 fechado (commit com `fixes #10`).
