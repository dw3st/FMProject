# Importador de elencos da ESPN (mundo 2026/27) — Design

Data: 2026-09-25. Status: aprovado no brainstorming (24 e 25/09/2026).

## Objetivo

Trocar o mundo de 2024/25 pelo de 2026/27, usando os elencos e as composições de liga atuais da API
pública (não oficial) da ESPN nas ligas que ela cobre. Nas outras ligas ficam os elencos de hoje.
Continua havendo uma database só, e os saves antigos deixam de valer (regra do projeto).

## Decisões

| Tema | Decisão |
|---|---|
| Mundo | Substitui o atual (sem segunda database) |
| Temporada | Europeias em `2026-27` (início 15/08/2026). Ano civil em `2027` (carreira começa 05/02/2027) |
| Composição das ligas | Segue a ESPN nas 34 ligas cobertas |
| Jogadores existentes | Mantêm id e atributos, e recebem 2 anos de curva de idade |
| Jogadores novos | Mediana da linha no clube (ou na liga) + ajuste de idade + ruído determinístico |
| Escudos | Baixados da ESPN para os clubes cobertos |
| Abordagem | Snapshot versionado + importador puro que roda depois do open-football |

## Cobertura

A ESPN cobre 34 das 83 ligas do jogo:

| Nosso slug | ESPN | | Nosso slug | ESPN |
|---|---|---|---|---|
| premier_league | eng.1 | | of_argentine_premier_division | arg.1 |
| of_championship | eng.2 | | of_a_league | aus.1 |
| la_liga | esp.1 | | of_austrian_bundesliga | aut.1 |
| of_spanish_second_division | esp.2 | | of_belgian_pro_league | bel.1 |
| bundesliga | ger.1 | | of_chilean_primera_division | chi.1 |
| serie_a | ita.1 | | of_colombian_first_division | col.1 |
| of_italian_serie_b | ita.2 | | of_danish_superliga | den.1 |
| ligue_1 | fra.1 | | of_greek_super_league | gre.1 |
| of_ligue_2 | fra.2 | | of_j_league | jpn.1 |
| brazil_serie_a | bra.1 | | of_liga_mx | mex.1 |
| brazil_serie_b | bra.2 | | of_eredivisie | ned.1 |
| of_major_league_soccer | usa.1 | | of_eliteserien | nor.1 |
| of_portuguese_primeira_liga | por.1 | | of_paraguayan_primera_division | par.1 |
| of_russian_premier_league | rus.1 | | of_peruvian_primera_division | per.1 |
| of_saudi_professional_league | ksa.1 | | of_south_african_psl | rsa.1 |
| of_allsvenskan | swe.1 | | of_turkish_super_league | tur.1 |
| of_uruguayan_first_division | uru.1 | | of_venezuelan_primera_division | ven.1 |

Em 14 delas o nosso número de clubes difere do da ESPN, quase sempre porque o seed do open-football
está incompleto (Championship 19 × 24, Ligue 2 11 × 18, África do Sul 9 × 16). Com a composição da
ESPN, essas ligas chegam ao tamanho real.

Ligas da ESPN que não temos (League One, Escócia, China, Equador…) ficam fora do escopo.

## Fluxo de dados

```
fetchEspn.ts ──► data_process/espn/snapshot.json   (rede, roda à mão)
                 data_process/espn/logos/<espnTeamId>.png

importOpenFootball.ts ──► src/example_data   (mundo 2024/25, sem mudança)
importEspn.ts ──► lê snapshot + example_data ──► regrava example_data (mundo 2026/27)
```

- `data_process/espn/leagueMap.json`: nosso slug ↔ código ESPN (a tabela acima).
- **`scripts/fetchEspn.ts`** é o único passo com rede. Usa `curl` (o `fetch` do Bun falhou contra a
  ESPN no Windows), com concorrência limitada. Por liga, grava os clubes (id, nome, nome curto,
  cores, escudo, estádio) e, por clube, o elenco (id, `displayName`, `fullName`, idade, data de
  nascimento, posição G/D/M/F, nacionalidade) e o técnico. Grava também a data do snapshot. O
  snapshot e os escudos vão para o git.
- **`scripts/importEspn.ts`** é determinístico, sem rede e sem `Math.random`. A lógica fica em
  módulos puros com teste em `scripts/espn/`:

| Módulo | Responsabilidade |
|---|---|
| `types.ts` | Tipos do snapshot |
| `normalize.ts` | Normalização de nomes (clube e jogador) |
| `matchClubs.ts` | Clube ESPN → squadId (override → nome no país → novo) |
| `matchPlayers.ts` | Jogador ESPN → jogador do mundo (override → nome + idade + linha) |
| `lineup.ts` | Composição nova de cada liga, movimentos entre ligas, saídas do mundo |
| `aging.ts` | Dois anos de curva de idade nos atributos |
| `estimate.ts` | Atributos de jogadores novos e dados de clubes novos |
| `logos.ts` | Cópia dos escudos e `logoIndex.json` |

## Correspondência de clubes

Nesta ordem, parando no primeiro acerto:

1. **Override:** `data_process/espn/clubOverrides.json` (`espnTeamId → squadId`).
2. **Nome normalizado** (sem acento, caixa ou pontuação; sem "FC", "AFC", "CF", "SC"; o sufixo
   "City"/"United" só cai quando não gera ambiguidade), procurado em **qualquer liga do mesmo
   país**. É assim que se acha o Coventry na nossa Championship.
3. **Sem acerto:** vira clube novo, com id e slug `es_<espnTeamId>` (ver Clubes novos).

Um squadId só pode ser escolhido por um clube da ESPN. Se houver colisão, o importador falha e
pede um override.

## Correspondência de jogadores

- **Onde procurar:** no mundo inteiro, não só no clube. Quem trocou de clube mantém os atributos.
- **Critério:** nome normalizado (`displayName` e `fullName` da ESPN contra `name` e `fullName`
  nossos) + idade compatível (idade ESPN − idade nossa entre 0 e 3) + linha compatível (G↔GK,
  D↔defensor, M↔meio, F↔atacante, pelo `getMainRole`). Com mais de um candidato, fica o de idade
  mais próxima e, no empate, o que já está no mesmo clube.
- **Override:** `data_process/espn/playerOverrides.json` (`espnAthleteId → playerId`).
- **Sem acerto:** jogador novo, com id `es_<espnAthleteId>`.
- **O que muda num jogador reconhecido:** idade, nacionalidade e `squadId` vêm da ESPN. Id, pé
  preferido e perfil ficam. A posição detalhada fica se for compatível com a linha da ESPN; senão,
  vira a posição principal da ESPN. Os atributos passam pela curva de idade.
- **Sem duplicatas:** um jogador colocado num clube coberto sai do elenco onde estava no resto do
  mundo. Se esse elenco ficar abaixo dos mínimos, é completado com jovens gerados (`roster.ts`).
- Jogadores de clubes cobertos que não aparecem na ESPN saem do mundo.

## Composição das ligas e pirâmides

- Em cada liga coberta, os clubes são os da ESPN. Um clube que a ESPN põe noutra liga coberta muda
  de pasta (`squads/{liga}/`), com o mesmo stem e o `leagueSlug` atualizado.
- **Clube que sai de uma liga coberta e não aparece em nenhuma outra liga coberta:**
  - se o país tem, no nosso mundo, uma divisão não coberta abaixo da liga de onde ele saiu, o clube
    desce para a mais alta delas (ex.: rebaixado da Série B vai para a nossa Série C);
  - senão, sai do mundo: o arquivo é apagado e os jogadores dele saem junto.
- As ligas não cobertas só perdem os clubes que subiram para ligas cobertas, recebem os que caíram e
  perdem os jogadores que foram para clubes cobertos.
- No `leagueData`, `standings`, número de rodadas e zonas são regenerados. A pirâmide
  (`pyramids.json`) e as zonas `prom`/`rel` são recalculadas com o `buildPyramid` /
  `zonesFromPyramid` de `scripts/openfootball/pyramid.ts`, respeitando o `pyramidOverrides.json`. A
  checagem de integridade do open-football roda de novo.
- **Temporada:** no `leagueData`, `season` passa de `2024-25` para `2026-27` e de `2025` para
  `2027`. O plano deve procurar e atualizar os anos fixos no código e nos comentários (por exemplo,
  `startKits.ts` e `generateStartKits.ts`).
- **Limite conhecido:** nas ligas de ano civil, a ESPN está na temporada 2026 em andamento. A
  temporada 2027 do jogo começa com a composição de 2026. Um `fetchEspn` feito depois de a ESPN
  virar o ano corrige isso.

## Atributos

### Curva de idade (jogadores reconhecidos)

Aplicada duas vezes, uma por ano, com a idade daquele ano (idade ESPN − 2, depois − 1).

| Idade no ano | ≤ 21 | 22–25 | 26–27 | 28–29 | 30–31 | 32–34 | 35+ |
|---|---|---|---|---|---|---|---|
| Δ da média de atributos por ano | +0,6 | +0,3 | +0,1 | 0 | −0,2 | −0,4 | −0,6 |

- **Crescimento:** o Δ vezes o número de atributos de campo vira um total de pontos, repartido
  pelos `dpWeights` do papel (`roles.json`) nos atributos que eles alimentam, com o teto suave
  `× (1 − (v/10)²)`.
- **Declínio:** o total é repartido com peso dobrado em `speed`, `acceleration` e `stamina`.
- **Goleiros:** usam os atributos de goleiro (`reflex`, `jump`, `pressing`, `acceleration`, `speed`)
  no lugar dos de campo.
- Os atributos ficam inteiros de 0 a 10. As frações são arredondadas com hash do id do jogador e do
  atributo (determinístico).
- O importador imprime a média de overall por faixa de idade antes e depois, para mostrar que o
  mundo não inflou nem murchou.

### Jogadores novos num clube existente

- **Base:** para cada atributo, a mediana dos jogadores reconhecidos da mesma linha
  (GK/DEF/MID/FWD) no clube, depois da curva de idade.
- **Idade:** ≤ 20 anos −1,0, 21–23 −0,5, 24–31 0, 32+ −0,3, aplicado a todos os atributos.
- **Ruído:** ±1 determinístico (hash) em até 4 atributos.
- **Posição detalhada:** vem da linha, preenchendo o que falta no elenco (DEF → CB/LB/RB, MID →
  CDM/CM/CAM, FWD → LW/ST/RW; GK → GK).
- **Pé:** por hash, 75% destro.
- **Perfil:** arquétipo e resumo pelo mesmo gerador do importador open-football.

### Clubes novos (`es_*`)

- **Base dos atributos:** o próprio clube se tiver 5 ou mais jogadores reconhecidos; senão, a
  mediana da linha na liga de destino, com −0,3 em todos os atributos.
- **Finanças:** `deriveClubEconomy` do open-football, com a reputação estimada pelo nível da liga
  (mediana dos clubes dela) e o tier da liga.
- **Cores:** `color`/`alternateColor` da ESPN.
- **Estádio:** da ESPN quando existir; senão, "Estádio {nome do clube}".
- **Técnico:** o da ESPN (`coach`); senão, o `coachName`.
- **País:** o da liga.

### Tamanho do elenco

Mesma regra do `roster.ts`: mínimos GK 3, DEF 7, MID 7, FWD 4 e 18 jogadores no total, com jovens
gerados quando faltar; máximo de 30, cortado pela mesma regra do open-football.

## Escudos

- **Download:** o `fetchEspn` baixa a variante `dark` quando ela existe, senão a padrão, já em
  128 px pelo redimensionador do CDN (`a.espncdn.com/combiner/i?img=<caminho>&w=128&h=128`).
- **Destino:** o importador copia para `src/example_data/logos/{liga de catálogo}/{slug}.png`, onde
  a liga de catálogo é a do clube no `leagueData` gerado. A rota `/api/logos/:league/:club` já tenta
  `.svg` e depois `.png`.
- **Nativos:** clubes que já têm `.svg` mantêm o SVG. Só entram os que faltam.
- **Front:** o importador gera `src/example_data/logoIndex.json` (squadIds com escudo). O
  `squadLogoUrl` deixa de recusar todo `of_*` e passa a consultar esse índice, então a UI só pede o
  escudo quando ele existe.
- **Cores de clubes existentes:** ficam como estão, e só as da ESPN entram quando faltarem.

## Erros e relatório

- O importador **falha** em: colisão de squadId, override apontando para id inexistente, snapshot
  ausente ou com liga faltando, id duplicado no mundo final, jogador em dois elencos, ou pirâmide e
  zonas inconsistentes.
- Uma liga do `leagueMap` que venha vazia no snapshot **não é aplicada**: a liga fica como está e o
  importador avisa.
- **Relatório no fim:** clubes reconhecidos por override e por nome, criados, movidos e removidos;
  jogadores reconhecidos, novos e removidos; média de overall por faixa de idade antes e depois.

## Testes

`bun test scripts/espn`:

- **normalize / matchClubs / matchPlayers:** normalização, ordem override → nome → novo, critérios
  de idade e linha, desempate, colisão.
- **lineup:** movimento entre ligas cobertas, descida para a divisão não coberta, saída do mundo,
  tamanhos e ausência de duplicatas.
- **aging:** determinismo, teto suave, sinal por faixa de idade, sem deriva da média numa amostra.
- **estimate:** novato na mediana da linha, ajuste de idade, base da liga para clube novo.
- **ponta a ponta:** um snapshot de fixture (2 ligas, 6 clubes) rodado contra um mundo de fixture.

## Regeneração

```bash
bun scripts/fetchEspn.ts            # só para atualizar o snapshot (rede)
bun scripts/importOpenFootball.ts
bun scripts/importEspn.ts
cp -R src/example_data/. src/Data/
bun run kits:generate 5
rm -f src/example_data/startKits/*
cp src/Data/startKits/* src/example_data/startKits/
```

Depois: `bun scripts/membership-smoke.ts`, `bun scripts/season-rollover-smoke.ts` e
`bun scripts/quicksim-spread.ts` numa amostra de ligas (tamanhos e elencos mudam, então o volume de
gols precisa continuar na faixa).

## Documentação

- Nova regra `.claude/rules/data/espn-import.md` (fontes, módulos, correspondência, regeneração).
- `.claude/rules/data/openfootball-import.md` passa a apontar para ela no passo a passo de
  regeneração e na seção de escudos.
- `.claude/rules/ui-world.md`: o `squadLogoUrl` passa a consultar o `logoIndex.json`.

## Fora do escopo

- Ligas da ESPN que não existem no jogo.
- Estatísticas da ESPN (gols, jogos) nos atributos.
- Atualização automática do snapshot (o `fetchEspn` roda à mão).
