# Bloco A — moldura do jogo minimalista (+ aviso de tela, título, celular) — Design

Data: 2026-10-01. Status: aprovado. Primeiro de quatro blocos da Etapa 9 (A moldura → B novo jogo →
C táticas/posições → D telas restantes). Versão 1.9 (junto com o bloco B). Mockup aprovado:
`.superpowers/brainstorm/15-1790858757/content/shell.html`, opção A **mantendo os ícones**.

## 1. Moldura (`Layout.tsx`, `TopNavigation.tsx`, `StatusBar.tsx` e afins)

- **Barra superior** (altura ~48px, `border-b border-border`, fundo `bg-background`): `Wordmark
  size="sm"` à esquerda; abas com ícone (via `Icon`) + texto, sem caixa, sem brilho, sem caixa-alta
  forçada — ativa `text-foreground`, demais `text-muted-foreground hover:text-foreground`; à direita
  data + próximo jogo (texto apagado) e o botão Continuar `bg-primary`, sem glow, `rounded` 4px.
  O aviso de versão nova (pílula) e o item "Report" (testers) continuam, no mesmo tom.
- **Barra inferior** fina (~36px, `border-t`): orçamento, não lidas, jogadores, data, novidades,
  configurações — texto `text-muted-foreground text-sm`.
- Remover das peças da moldura: `glow-*`, gradientes, sombras coloridas, `scale` no hover, imports
  diretos de `lucide-react` (ícones só via `Icons.tsx`).
- Comportamento (navegação, avanço do dia, avisos, menus) não muda.

## 2. Componentes compartilhados (`src/GameInterface/ui/`)

`Panel` (borda fina, sem sombra), `DataTable` (cabeçalho apagado, linhas com `border-t`, linha
destacada opcional), `Button` (`primary` | `ghost` | `danger`), `Tabs` (texto, sublinhado fino na
ativa), `Notice` (aviso de uma linha: info/warning/error). Só tokens do tema. Nenhuma tela é
convertida neste bloco (bloco D) — apenas a Stats (já minimalista) passa a usar os componentes como
referência.

## 3. Aviso de tela não suportada (`ScreenSizeGate.tsx`)

Mínimo 1200×900 → **1024×600**. Visual novo: `Wordmark`, uma linha ("Use uma janela maior"),
"atual L×A · mínimo 1024×600"; sem ícone em caixa, sem badge "em breve". i18n en/pt-BR.

## 4. Título e celular

- `src/pages/landing/index.html`: `<title>FMProject</title>`.
- Landing, login, `/start` em 375×667 (emulação do navegador / DevTools): sem rolagem horizontal,
  textos legíveis, botões ≥ 40px, campo de fundo proporcional. Corrigir o que quebrar.

## Verificação

`bunx tsc --noEmit -p .`; `bun test src/GameInterface`; conferência visual de 3 telas do jogo
(dashboard, elenco, stats) com a moldura nova e do aviso de tela em janela pequena.
