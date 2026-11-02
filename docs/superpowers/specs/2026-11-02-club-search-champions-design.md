# Busca por time e histórico de campeões

Etapa 46 do `docs/ROADMAP.md`. Opções aprovadas pelo usuário em 2026-11-02 sobre os modelos: 1A (campo de busca) e 2A
(quadro do mundo). Nenhuma das duas tem efeito de partida (`/test` e `/lab` não mudam) nem muda o formato do save.

## 1. Busca por time (4.42)

**Tela:** campo "Buscar time" na linha do seletor de liga da tela Ligas, em toda aba.

- Campo vazio: os times do país da liga aberta. Com texto: os times do mundo cujo nome contém o texto (sem acento nem
  caixa), primeiro os que começam com ele, depois os que têm uma palavra começando com ele, até 30.
- Resultado agrupado por país (o da liga aberta primeiro, se tiver resultado): bandeira e país; escudo de 32px, nome e
  liga de cada time.
- Escolher um time abre a aba Tabela da liga dele, com a linha destacada e rolada até a vista. O elenco continua a um
  clique, na própria linha.

**Dados:** `GET /api/saves/:saveId/clubs` (membro do save) devolve `{ clubs: [{ id, name, league }] }` do índice de
squads do save, nunca do `leagueData`: um clube promovido aparece na liga em que joga agora. A tela só busca quando o campo
ganha foco. Lógica pura em `src/Domain/world/clubSearch.ts`.

## 2. Histórico de campeões (4.43)

**Fonte:** os títulos de `managers.json` (`ManagerTitle`), que todo técnico do mundo já acumula desde o começo da
carreira, com a temporada e o clube. Ficam de fora os acessos (`promotion`). Vantagens: nenhum arquivo novo, nenhum dado
a migrar, o técnico é o que estava no cargo no dia do título e os mundos existentes já aparecem completos. Os arquivos de
temporada não servem: guardam o `squad.coach`, que não acompanha as trocas de técnico, e pesam 112 MB num mundo de três
temporadas.

**Tela:** aba **Campeões** em Estatísticas (`/stats?tab=champions`).

- **Quadro:** competições nas linhas, temporadas nas colunas (a mais nova à direita), com escudo e clube em cada célula e
  um ponto em `chart-4` quando o técnico era humano. O nome do técnico fica no `title`. O clube do jogador fica em
  `text-primary`.
- **Colunas:** chave = ano de fim da temporada. "2026-27" e "2027" caem na mesma coluna, rotulada "2026-27"; um torneio de
  seleções de 2028 cai em "2027-28". Só temporadas com algum título visível.
- **Filtro** (`SelectCombobox`): Principais (padrão: continentais, torneios de seleções e a primeira divisão das 10
  ligas principais, `PUBLIC_WORLD.LEAGUES`), Continentais, Seleções, cada continente, cada país. Dentro de um país: ligas
  pela ordem de nível, depois a copa. Só aparecem linhas com algum título.
- **Seleções:** uma linha por torneio (Copa do Mundo, Eurocopa, Copa América), com a bandeira no lugar do escudo. Título
  de seleção vem do registro do técnico da seleção, com o `squadId` `nat_<nação>`.
- **Lista de uma competição:** clicar no nome abre a tabela Temporada, Campeão, Técnico (selo "Humano"), mais novas
  primeiro, e "Mais títulos" (clubes por contagem), com o botão de voltar ao quadro. O clube tem link para o elenco.
- **Sem títulos:** "Os primeiros campeões aparecem quando as competições terminarem."

**Dados:** `GET /api/saves/:saveId/champions` (membro do save) devolve `{ titles: [{ competition, season, on, squadId,
clubName, league, nation, managerName, human }] }`, com `league` nulo em seleção. Um título repetido (mesma
competição, temporada e clube) conta uma vez. Lógica pura em `src/Domain/champions/champions.ts`.

**Quando aparece:** copa, continental e seleção no dia da final; liga na virada do país. Os títulos de base não entram.

## Limitações

- O histórico começa no início da carreira do mundo; o mundo não tem títulos reais anteriores.
- Um clube sem técnico registrado no dia do título (save sem `managers.json`) não pontua e não aparece; só acontece em
  dado corrompido, já logado por `logError("managers")`.
