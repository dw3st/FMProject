# Telas de entrada (landing, login, /start) — Design

Data: 2026-09-30. Status: aprovado. Mockups: `.superpowers/brainstorm/1603-1790788603/content/`
(`landing-a2.html` opção 2, `login-start.html`).

## Objetivo

Reformular as três telas antes do jogo — landing (`/`), login e tela inicial (`/start`) — num estilo
minimalista, sem cara de template de IA: sem brilhos, blobs, grade de cards, frases de efeito. Mesmo
azul e fundo escuro do jogo. Pouquíssimo texto.

## Linguagem visual

- **Cores:** só os tokens do tema atual (`bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-primary`/`text-primary-foreground`). Nenhuma cor nova.
- **Nome do jogo (`Wordmark`):** "FM" + "PROJECT" em Barlow Condensed 700, "PROJECT" em
  `text-primary`. A fonte é embutida no projeto (arquivo woff2 servido pelo próprio app, `@font-face`
  em `index.css`), nunca do Google Fonts. Só o nome usa essa fonte; o resto continua na fonte atual.
- **Campo ao fundo (`PitchBackdrop`):** SVG do campo (retângulo, linha do meio, círculo central,
  duas grandes áreas) em traço `border`, ~88% da largura/altura, opacidade baixa, centralizado atrás
  do conteúdo, com os 22 jogadores como pontos (time A em `primary`, time B em cinza) bem apagados.
  Estático, `aria-hidden`, `pointer-events-none`. Numa tela estreita encolhe proporcionalmente.
- **Botão principal:** `bg-primary`, texto `primary-foreground`, `rounded` pequeno (4px), sem sombra
  nem glow, sem `scale` no hover — só troca de cor (150–200ms).
- **Movimento:** nenhum além do hover. Nada de animação de entrada.
- **Ícones:** só via `src/GameInterface/Icons.tsx` (a landing hoje importa `lucide-react` direto —
  corrigir).

## Landing (`/`, `src/GameInterface/LandingScreen.tsx`)

1. **Barra do topo:** `Wordmark` pequeno à esquerda, "Entrar" à direita (link para `/start`, que
   leva ao login quando não autenticado).
2. **Primeira tela (100vh):** `PitchBackdrop` ao fundo; centralizado: `Wordmark` grande,
   "Gestão de futebol" (uma linha, `text-muted-foreground`), botão "Jogar" (`/start`).
3. **Faixa de números:** uma linha fina com borda no topo: 83 ligas · 1.273 clubes · 36 mil
   jogadores · copas e continentais. Números vêm de constantes num único lugar (sem cálculo em
   runtime).
4. **Rodapé:** versão (`CURRENT_VERSION`), link do código-fonte e da licença (AGPL — obrigatório) e
   "Desenvolvido por westlab.dev" (link `https://westlab.dev`, nova aba, `rel="noopener"`).

Saem: brilhos (`glow-*`), badge, estatísticas fictícias, grade de recursos, FAQ, segundo CTA,
ícones de redes. As chaves i18n `landing.*` que deixarem de ser usadas são removidas das duas
línguas.

## Login (`src/GameInterface/LoginScreen.tsx`)

Uma coluna central (~280px) sobre o `PitchBackdrop`: `Wordmark` médio; rótulo "E-mail" visível
(não só placeholder) + campo; botão "Receber código"; uma linha curta de ajuda. O passo do código
(6 dígitos, "Enviado para …", "Usar outro e-mail") fica na mesma coluna, mesmo estilo. Comportamento
e rotas do login não mudam; erros aparecem junto do campo.

## Tela inicial (`/start`, `src/GameInterface/StartScreen.tsx`)

Coluna central (~340px) sobre o `PitchBackdrop`: `Wordmark` médio; botão "Novo jogo" em destaque;
rótulo "Jogos salvos" e lista simples — cada linha com escudo (`ClubLogo`), clube, liga · data,
"Continuar" e excluir (mantém o `ConfirmDialog` da 1.5.1); estado vazio discreto; limite de saves
como hoje. Rodapé: Configurações à esquerda, versão + "Novidades" (abre o changelog, e o aviso de
versão nova continua) à direita. Comportamento (carregar, excluir, limite, novo jogo) não muda.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/GameInterface/Components/Wordmark.tsx` | Novo — `size: "sm" \| "md" \| "lg"` |
| `src/GameInterface/Components/PitchBackdrop.tsx` | Novo — SVG do campo + pontos |
| `public`/assets da fonte + `src/index.css` | `@font-face` da Barlow Condensed 700 (woff2 local) |
| `LandingScreen.tsx`, `LoginScreen.tsx`, `StartScreen.tsx` | Reescritos no novo layout |
| `src/i18n/locales/en.json`, `pt-BR.json` | Chaves novas/removidas, sempre nas duas |

## Fora do escopo

Assistente de novo jogo; telas de dentro do jogo; captura real do jogo ou campo animado na landing
(refinamento futuro).

## Verificação

- `bunx tsc --noEmit -p .` e a suíte de testes existente.
- No navegador, desktop e 375px: as três telas, login completo (dev-login) e fluxo de excluir save.
- Contraste ≥ 4,5:1 no texto, foco visível no teclado, rótulos nos campos, sem rolagem horizontal.
- Changelog: entra como item na próxima entrada (visual novo das telas de entrada).
