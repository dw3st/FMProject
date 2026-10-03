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
| Rótulo | `font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground` | Acima de campos, cabeçalhos de grupo, cabeçalho de tabela, legenda de um número |
| Texto | `font-sans text-sm` (padrão) | Conteúdo, linhas de tabela |
| Texto secundário | `text-sm text-muted-foreground` | Subtítulo de uma linha abaixo do título, metadados |
| Número de destaque | `font-display font-bold tabular-nums` | Placar, orçamento, nota grande |
| Número em linha | `tabular-nums` (no elemento ou num ancestral) | Dinheiro, notas, fôlego, contagens em listas e tabelas |

Nada de `font-mono` (salvo debug), nada de caixa-alta em texto corrido, nada de frases longas: um
subtítulo de uma linha no máximo. Todo texto em `uppercase` é rótulo (ou título) e vai em
`font-display`; nunca caixa-alta na fonte do corpo, nem `tracking` largo (`0.2em`) — o espaçamento
de rótulo é sempre `tracking-[0.08em]`. Texto grande (`text-2xl` ou mais: placar, número de
destaque) também é `font-display`. Nada de texto em gradiente nem com a cor do clube como fundo do
texto (`bg-clip-text`).

## Tamanho mínimo (legibilidade)

- Nenhum texto abaixo de **13px** nas telas do jogo, sem exceção: `text-xs` (12px) e `text-[Npx]`
  com N < 13 são proibidos fora das telas de debug. Só rótulos e cabeçalhos de tabela/abas usam
  `text-[13px]` (sempre `font-display` uppercase); texto corrido, linhas de tabela, botões, links e
  badges/pílulas (fôlego, moral, forma, status) usam no mínimo **14px** (`text-sm`).
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
- **Chip (botão-opção) — o padrão único:** o visual dos chips de "Intensidade" do Treino (LEVE / NORMAL /
  PESADO). `ui/Chip.tsx` guarda as classes (`CHIP_STYLE`, `chipClass`): `font-display` bold uppercase
  `tracking-[0.08em]` `text-sm`, pílula `rounded-lg` `px-3 py-1.5` com borda sutil; desligado
  `border-border/60 bg-card/40 text-muted-foreground` (hover borda primária e texto claro); ligado
  `border-primary bg-primary/15 text-primary`.
  - Um grupo de opções exclusivas (intensidade, foco de estilo, eixos táticos, Mundo/Meu país,
    Meus/Todos, tipo de relato) é `<OptionChips options value onChange>` (`ui/OptionChips.tsx`);
    uma opção solta ou um filtro liga/desliga ("Só à venda", "Só livres", formação personalizada,
    "Editar formação", nacionalidade) é `<Chip selected>`; uma grade de formações também usa `Chip`.
  - Nunca recriar o chip à mão (botão com borda e estado selecionado em primário): a auditoria acusa
    (`chip`, regra dura). Rótulos em caixa normal ("Balanced") também não: o texto do chip é sempre
    caixa-alta condensada. A opção escolhida nunca vira um botão primário preenchido.
  - Barras de abas e interruptores de duas/três posições de uma barra (velocidade e mentalidade da
    partida, Titulares/Reservas) são `SegmentedTabs`, não chips; cartões de escolha com descrição
    (estilo tático, idioma) são cartões.
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
  sublinhado (`ui/Tabs.tsx`) ficam só onde já existem (Elenco, Novo jogo, Equipe técnica). Um
  interruptor de duas opções dentro de um painel ou modal (Titulares/Reservas, Substituições/Formação,
  Todas/Não lidas) também é `SegmentedTabs` — com `fill` ocupa a largura toda e divide entre as abas;
  o rótulo da aba pode ter ícone. Nunca uma barra de abas feita à mão com a aba ativa em `bg-primary`.
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

## Auditoria (`bun run ui:audit`)

`scripts/ui-audit.ts` varre `src/GameInterface` e `src/pages` (fora as telas de debug: `/test`,
`DebugPanel`, heatmap, painéis de energia/quickSim, simulação do `/lab`) e imprime um relatório por
arquivo. `bun run ui:audit --hard` mostra só as violações duras; `--json` sai em JSON.

- **Duras** (falham o comando e `src/GameInterface/ui/uiAudit.test.ts`, que roda com
  `bun test src/GameInterface`): texto abaixo de 13px (`small-text`), `font-mono` fora do debug, chip feito à mão (`chip`),
  estilo de fonte inline (`style={{ fontSize | fontFamily | fontWeight | letterSpacing | lineHeight }}`
  ou atributo `fontSize` em SVG — `inline-font`).
- **Leves** (só relatório): 13px em texto que não é rótulo (`size-13`), `uppercase` sem
  `font-display` (`label-font`), texto grande sem `font-display` (`display-font`), número formatado
  sem `tabular-nums` (`tabular`), `<table>` sem `TABLE_STYLE`/`StatsTable`/`DataTable` (`table`),
  barra de abas feita à mão (`tabs`), botão primário cru fora do padrão (`button`), título fora das
  classes de título (`heading`), glow/gradiente/scale (`decorative`), tamanho arbitrário fora de 13px.
- Exceções justificadas ficam em `ALLOWLIST` no próprio script, com o motivo (hoje: os textos SVG do
  hexágono de nota e do mini-campo, em unidades do `viewBox`; o botão Continuar da barra superior de
  48px, com 36px de altura).

Toda tela nova ou alterada deve sair com o relatório limpo (0 duras, 0 leves); quem precisar de uma
exceção a acrescenta à `ALLOWLIST` com o motivo, nunca desliga a regra.
