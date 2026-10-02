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

## Tamanho mínimo (legibilidade)

- Nenhum texto abaixo de **13px** (`text-[13px]`) nas telas do jogo; texto de tabela e de badge/pílula
  (fôlego, moral, forma, status) no mínimo **14px** (`text-sm`). Proibido `text-[10px]`, `text-[11px]`,
  `text-xs` em dado que o jogador precisa ler (só rótulos de cabeçalho podem ser `text-xs`, e em
  maiúsculas condensadas).
- Barras de fôlego/força: altura mínima 6px, largura mínima 64px, sempre com o número ao lado.
- Badges de estado (moral, forma, trato): texto `text-sm`, padding `px-2 py-0.5`, sem caixa-alta minúscula.
- Alvos clicáveis: altura mínima 32px em tabelas, 40px em botões.

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
- **Tabela (ranking, classificação, listas de jogadores/clubes):** o visual da tabela de Ligas
  (`StandingsTable`) é o padrão. As classes ficam em `ui/leagueTableStyle.ts` (`TABLE_STYLE`,
  `TABLE_CELL`) e nunca são copiadas à mão: uma tabela nova importa de lá (ou usa as peças de
  `Components/StatsTable.tsx`, que já as aplicam a um `<table>`). O visual:
  - caixa `card-arcade rounded-md overflow-hidden` (fundo de cartão, borda fina);
  - cabeçalho com fundo `bg-secondary/30`, borda inferior e texto de rótulo (`font-display`
    bold uppercase `text-[13px]` `tracking-[0.08em]` muted), `px-4 py-3` nas pontas;
  - linhas separadas por `divide-y divide-border/50`, `py-2.5`, hover `bg-secondary/30`;
  - nome do clube/jogador `font-semibold text-foreground` no tamanho base (16px, nunca `text-sm`),
    escudo de 32px (`w-8 h-8`) ao lado;
  - posição `font-bold` muted e centralizada; números secundários centralizados e muted;
  - a coluna que importa (pontos, gols, nota, a coluna ordenada) em `font-black font-display
    text-primary`;
  - linha do clube do jogador / selecionada: `bg-primary/10` e nome em `text-primary`.
  As tabelas densas de elenco (`SquadTable`, `DataTable` da Base/Equipe técnica) seguem o seu próprio
  formato compacto.
- **Painel:** sem caixa por padrão (só espaçamento e um título de seção); quando precisar de limite,
  `border border-border rounded-md` sem fundo forte e sem sombra.
- **Barras (força, fôlego):** trilho `bg-border h-1.5 rounded`, preenchimento `bg-primary`.
- **Abas de tela:** a barra de abas de Ligas é o padrão — `ui/SegmentedTabs.tsx`: abas em
  `font-display` bold uppercase `text-[13px]` dentro de um contêiner `rounded-lg border border-border
  bg-secondary/20 p-1`; a ativa vira um cartão (`bg-card text-foreground shadow-sm`). Um seletor
  secundário dentro de uma aba usa o mesmo componente com `compact`/`wrap`. As abas de texto com
  sublinhado (`ui/Tabs.tsx`) ficam só onde já existem (Elenco, Novo jogo, Equipe técnica).
- **Seletor de competição/liga:** sempre com rótulo acima no estilo rótulo (`SelectCombobox`
  com `label`, ex. "LIGA", "COMPETIÇÃO").
- **Título de tela:** um só, o nome da tela ("LIGAS", "ESTATÍSTICAS"); nunca acrescentar o nome da
  aba ativa ao título.

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
