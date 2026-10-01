# Padrão visual do jogo (obrigatório em toda tela)

Aprovado em 2026-10-01 (mockup `.superpowers/brainstorm/3221-1790860915/content/newgame-rich.html`,
referência de título: `PreSeasonLoadingScreen` "Preparing your world"). Toda tela nova ou alterada
segue isto; uma tela fora do padrão é bug de UI. Fontes e regra de tipografia: `frontend.md` →
Tipografia.

## Tipografia

| Papel | Classe | Uso |
|---|---|---|
| Título de tela | `font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none` | Um por tela, no topo ("ELENCO", "CRIE SEU TÉCNICO") |
| Título de seção/painel | `font-display font-black uppercase text-xl leading-none` | Blocos dentro da tela |
| Rótulo | `font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground` | Acima de campos, cabeçalhos de grupo, cabeçalho de tabela |
| Texto | `font-sans text-sm` (padrão) | Conteúdo, linhas de tabela |
| Texto secundário | `text-sm text-muted-foreground` | Subtítulo de uma linha abaixo do título, metadados |
| Número de destaque | `font-display font-bold tabular-nums` | Placar, orçamento, nota grande |

Nada de `font-mono` (salvo debug), nada de caixa-alta em texto corrido, nada de frases longas: um
subtítulo de uma linha no máximo.

## Componentes (`src/GameInterface/ui/`)

- **Botão primário:** `bg-primary text-primary-foreground font-semibold rounded h-10 px-5`, hover só
  de cor. **Secundário:** texto `text-muted-foreground hover:text-foreground`, sem borda. **Perigo:**
  texto `text-destructive`. Nunca `glow-*`, gradiente, `scale`, sombra colorida.
- **Cartão de escolha:** `rounded-md border border-border bg-card p-3`; selecionado
  `border-primary ring-1 ring-primary`. Título do cartão no estilo de título de seção (menor:
  `text-base`), uma linha de descrição.
- **Botão-opção (chip):** `rounded border border-border px-3 py-1.5`; selecionado
  `border-primary text-primary`.
- **Campo de texto:** sublinhado (`border-b border-border focus:border-primary bg-transparent`) ou caixa
  `rounded border border-border h-10 px-3`; sempre com rótulo visível acima.
- **Tabela:** cabeçalho no estilo rótulo; linhas `border-t border-border py-2`; linha destacada
  (clube do jogador / selecionada) `bg-primary/10` e texto `text-primary` no nome.
- **Painel:** sem caixa por padrão (só espaçamento e um título de seção); quando precisar de limite,
  `border border-border rounded-md` sem fundo forte e sem sombra.
- **Barras (força, fôlego):** trilho `bg-border h-1.5 rounded`, preenchimento `bg-primary`.
- **Abas:** texto; ativa `text-foreground` com sublinhado `border-b-2 border-primary`.

## Logo (FMPROJECT)

Sempre o `Wordmark`, em só dois tamanhos: **`lg`** nas telas de entrada (landing, start, login, novo
jogo, carregamento — centralizado, igual à landing) e **`sm`** em barras (moldura do jogo, topo da
landing, coluna lateral). Nenhum outro tamanho, nenhum logo desenhado à mão.

## Escudos, bandeiras, ícones

Escudo: 32px em listas, 64px em destaque de perfil, 36px na lista de saves. Bandeira: 20px.
Ícones só via `Icons.tsx`, 16px em barras e listas.

## Cores

Só os tokens do tema (`background`, `foreground`, `muted-foreground`, `border`, `card`, `primary`,
`destructive`, `chart-*`). Cor por posição: `getDetailedPositionColor`. Cor de clube só em escudo/
brasão gerado.

## Layout

Fundo `bg-background`. Telas de entrada (landing, login, start, novo jogo, carregamento) centralizadas
sobre o `PitchBackdrop`. Telas do jogo dentro da moldura (`Layout`), conteúdo com `px-6 py-5`,
título de tela no topo à esquerda. Espaço entre blocos `gap-6`/`mt-6`.
