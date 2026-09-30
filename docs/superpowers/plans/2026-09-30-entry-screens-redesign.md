# Telas de entrada (landing, login, /start) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** landing, login e `/start` no estilo aprovado (nome condensado, campo apagado ao fundo,
coluna central, pouquíssimo texto), sem mudar comportamento.

**Architecture:** dois componentes burros compartilhados (`Wordmark`, `PitchBackdrop`) usados pelas
três telas; a fonte vem do pacote `@fontsource/barlow-condensed` (bundlada pelo Bun, nunca Google
Fonts). Só tokens do tema existente.

**Tech Stack:** React 19, Tailwind v4, Bun, i18next.

Spec: `docs/superpowers/specs/2026-09-30-entry-screens-redesign-design.md`. Mockups aprovados:
`.superpowers/brainstorm/1603-1790788603/content/landing-a2.html` (opção 2) e `login-start.html`.
Branch `feat/entry-redesign`. Regras: imports `@/`; Tailwind (sem `style={{}}` salvo valor
dinâmico); ícones só via `src/GameInterface/Icons.tsx`; i18n em `en.json` **e** `pt-BR.json`;
commits por pathspec terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
sem amend, sem `git add -A`, sem stash/checkout/reset; nunca matar todos os `bun`; nunca commitar
`src/Data`.

### Task 1: fonte + `Wordmark` + `PitchBackdrop`

**Files:** `package.json`/`bun.lock` (dep nova), `src/index.css`,
`src/GameInterface/Components/Wordmark.tsx`, `src/GameInterface/Components/PitchBackdrop.tsx`,
`src/GameInterface/Components/Wordmark.test.tsx`.

- [ ] `bun add @fontsource/barlow-condensed`; em `src/index.css` importar só o peso 700
  (`@import "@fontsource/barlow-condensed/700.css";`) e declarar `--font-wordmark: "Barlow Condensed",
  system-ui, sans-serif;` no `@theme inline` (classe `font-wordmark`). Conferir no `bun run build`
  (ou no dev) que o woff2 é servido pelo próprio app.
- [ ] `Wordmark.tsx`:

```tsx
const SIZE = { sm: "text-lg", md: "text-4xl", lg: "text-6xl sm:text-7xl" } as const;

export function Wordmark({ size = "md", className = "" }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={`font-wordmark font-bold tracking-wide leading-none text-foreground ${SIZE[size]} ${className}`}>
      FM<span className="text-primary">PROJECT</span>
    </span>
  );
}
```

- [ ] `PitchBackdrop.tsx` — SVG `viewBox="0 0 200 130"`, `aria-hidden`, `pointer-events-none`,
  `absolute inset-0 m-auto w-[88%] h-[88%]`, `preserveAspectRatio="xMidYMid meet"`; traço
  `stroke-border` 1px, sem preenchimento: retângulo externo (1,1,198,128), linha do meio (x=100),
  círculo central (100,65,r=18), grandes áreas (1,38,26,54) e (173,38,26,54). Pontos r=2: time A
  `fill-primary`, time B `fill-muted-foreground`, os dois grupos `opacity-50`; wrapper com
  `opacity-40`. Posições (A): (10,65) (38,25) (36,55) (36,78) (40,106) (72,40) (70,95) (118,30)
  (116,100) (78,68) (128,64); (B): (190,65) (160,28) (158,56) (156,82) (162,104) (138,44) (142,80)
  (84,18) (88,112) (104,52) (96,84).
- [ ] Teste (`Wordmark.test.tsx`, `renderToStaticMarkup` de `react-dom/server`): renderiza "FM" e
  "PROJECT", e o `PitchBackdrop` tem `aria-hidden="true"` e 22 `<circle>` de jogador (+1 do círculo
  central = 23).
- [ ] `bunx tsc --noEmit -p .`; `bun test src/GameInterface/Components/Wordmark.test.tsx`; commit
  `feat(ui): Wordmark and PitchBackdrop`.

### Task 2: landing

**Files:** `src/GameInterface/LandingScreen.tsx`, `src/i18n/locales/en.json`, `pt-BR.json`.

- [ ] Reescrever `LandingScreen.tsx`:
  - topo fixo fino: `Wordmark size="sm"` (link `/`) à esquerda, "Entrar" (`landing.signIn`, link
    `/start`) à direita, `text-muted-foreground hover:text-foreground`;
  - `section` `min-h-screen relative flex flex-col items-center justify-center` com
    `PitchBackdrop` e, por cima (`relative`), `Wordmark size="lg"`, `<p>` "Gestão de futebol"
    (`landing.tagline`, `text-muted-foreground mt-2`), botão "Jogar" (`landing.play`, `<a href="/start">`,
    `mt-6 bg-primary text-primary-foreground rounded px-7 h-10 inline-flex items-center font-semibold
    transition-colors hover:bg-primary/90 focus-visible:outline-2`);
  - faixa `border-t border-border` com os números em linha (quebra em coluna no celular):
    `const WORLD_NUMBERS = [["83", "landing.leagues"], ["1.273", "landing.clubs"], ["36 mil", "landing.players"]]`
    + "copas e continentais" (`landing.cups`). Em inglês "36k". Os valores numéricos formatados
    ficam nas próprias chaves i18n (`landing.statLeagues: "83 ligas"` etc.) para não formatar número à mão;
  - rodapé: `v{CURRENT_VERSION}` (`@/GameInterface/changelog/changelog`), link do código-fonte e da
    licença (manter `SOURCE_REPO_URL`/`LICENSE_URL` atuais), "Desenvolvido por westlab.dev"
    (`<a href="https://westlab.dev" target="_blank" rel="noopener">`).
  - remover todo import de `lucide-react`, `useState`, FAQ, recursos, badge, stats fictícias,
    classes `glow-*`.
- [ ] i18n: adicionar `landing.signIn/tagline/play/statLeagues/statClubs/statPlayers/statCups/
  sourceCode/license/developedBy` em en e pt-BR; remover as chaves `landing.*` que nenhum arquivo
  usa mais (`grep -rn "landing\." src` para conferir).
- [ ] `bunx tsc --noEmit -p .`; commit `feat(ui): minimal landing page`.

### Task 3: login

**Files:** `src/GameInterface/LoginScreen.tsx`, locales.

- [ ] Manter toda a lógica (estados, requests, passos e-mail → código). Trocar só o layout:
  `min-h-screen relative flex items-center justify-center bg-background` + `PitchBackdrop`; coluna
  `relative w-full max-w-[280px] px-4`: `Wordmark size="md"` centralizado (`mb-7 block text-center`),
  `<label>` visível acima do campo (`text-xs text-muted-foreground`), input
  `h-10 w-full rounded border border-border bg-transparent px-3 focus-visible:border-primary`,
  botão cheio `bg-primary` (mesmo estilo da landing), linha de ajuda `text-xs text-muted-foreground`.
  Passo do código idem, com "Enviado para …" e "Usar outro e-mail" como link de texto. Erro logo
  abaixo do campo (`text-destructive text-xs`, `role="alert"`).
- [ ] Remover brilhos/`glow-*`/gradientes do arquivo; ícones só via `Icon`.
- [ ] `bunx tsc --noEmit -p .`; testes do login existentes (`bun test src/GameInterface`); commit
  `feat(ui): minimal login`.

### Task 4: tela inicial

**Files:** `src/GameInterface/StartScreen.tsx`, locales.

- [ ] Manter toda a lógica (lista, carregar, excluir com `ConfirmDialog`, limite de saves, novo
  jogo, settings, `ChangelogModal` + `ChangelogNoticePill`). Layout: fundo + `PitchBackdrop`; coluna
  `relative w-full max-w-[340px] px-4`: `Wordmark size="md"` (`mb-6`), botão cheio "Novo jogo"
  (largura total; desabilitado com a mensagem de limite como hoje), rótulo "Jogos salvos"
  (`text-xs text-muted-foreground mt-6 mb-2`), lista `<ul>`: cada `<li>` `flex items-center gap-3
  py-3 border-t border-border` (última com `border-b`) com `ClubLogo` pequeno, nome do clube,
  `liga · data` (`text-xs text-muted-foreground`, data do save formatada pelo locale), botão de
  texto "Continuar" (`text-primary`) e botão de excluir só com ícone (`Icon name` de fechar/lixeira,
  com `aria-label`). Estado vazio: uma linha `text-xs text-muted-foreground`.
  Rodapé `absolute bottom-4 inset-x-6 flex justify-between text-xs text-muted-foreground`:
  Configurações à esquerda; à direita versão + "Novidades" (abre o changelog) + a pílula de aviso.
- [ ] Remover o texto "Football simulation" e brilhos. Alvos clicáveis ≥ 40px de altura.
- [ ] `bunx tsc --noEmit -p .`; `bun test src/GameInterface`; commit `feat(ui): minimal start screen`.

### Task 5: changelog + verificação

- [ ] `changelog.ts`: nova entrada `1.6` só se a Etapa 6 não abrir antes — senão, entrada `1.5.2`
  com item "Novo visual da página inicial, do login e da tela inicial" / "New look for the landing,
  login and start screens"; `package.json` acompanha. (Decisão do controlador: usar **1.5.2**.)
- [ ] Navegador (dev server + dev-login), desktop e 375px: landing, login (e-mail → código), `/start`
  (carregar, excluir com confirmação, novidades). Sem rolagem horizontal, foco visível no teclado,
  console sem erros. Contraste do texto `muted-foreground` sobre o fundo ≥ 4,5:1.
- [ ] Commit `chore: changelog 1.5.2`.
