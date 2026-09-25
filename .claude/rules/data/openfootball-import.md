# Importador open-football

## O que é

`scripts/importOpenFootball.ts` é um script **offline**. Ele converte o `data_process/openfootball/seed-real.json` do projeto open-football (Apache-2.0; ver `data_process/openfootball/NOTICE.md`) em ligas, clubes e jogadores no formato nativo do FMProject. A lógica fica em módulos puros e testados em `scripts/openfootball/`:

| Módulo | Responsabilidade |
|---|---|
| `types.ts` | Tipos do seed |
| `ids.ts` | Normalização de nomes, ids, slugs, hash determinístico |
| `roster.ts` | Mapeamento de posição, corte de elenco, jovens de preenchimento |
| `calibration.ts` | Casamento seed ↔ FMProject e regressões |
| `derive.ts` | Atributos, perfil, finanças, estádio, técnico |
| `leagues.ts` | Filtro de ligas, zonas, países, calendários |
| `pyramid.ts` | Pirâmide por país e zonas `prom`/`rel` derivadas dela |

As saídas vão para `src/example_data/`:
- `squads/`: o importador apaga a pasta inteira e a regrava — copia os elencos nativos de
  `data_process/native/squads` e escreve por cima os elencos `of_*` derivados do seed;
- `leagueData.json`, `countries.json`, `databases.json` e `leagueSchedules.json`: as entradas nativas
  vêm de `data_process/native/`, as `of_*` são derivadas do seed;
- `pyramids.json` (pirâmide por país).

A calibração é gravada em `data_process/openfootball/calibration.json`.

O script é **determinístico**, porque não usa `Math.random` e usa hash dos ids. As ligas nativas
(Brasil A/B/C e as 5 grandes europeias) são copiadas byte-a-byte de `data_process/native`, exceto as
`zones` de acesso/rebaixamento, sempre regeneradas a partir da pirâmide. As 7 ligas do seed que se
sobrepõem a elas servem só para calibrar.

Este importador sozinho produz um mundo **intermediário**, na temporada 2024/25 (ver "Regra de
calendário" abaixo): 83 ligas, 1227 elencos e cerca de 36 mil jogadores. Ele nunca roda isolado na
cadeia real — `scripts/importEspn.ts` (`.claude/rules/data/espn-import.md`) roda logo depois e avança
esse mundo para a temporada 2026/27, terminando com 1273 elencos.

### Convenção de ids (fixa)

- **liga** = `of_` + slug do seed com `-` → `_` (ex.: `of_championship`);
- **clube** = `of_` + id do seed com `-` → `_` (ex.: `of_uy_albion`);
- **jogador** = `of_` + id do seed com `-` → `_`;
- o **`slug` do clube** é igual ao id do clube, o que evita a leitura dupla em `getSquad`.

Os ids de squad e de jogador são únicos no mundo inteiro. O arquivo `squads/{liga}/{id}.json` tem nome = `id` = `standings[].squadId`.

---

## Como regenerar

A cadeia completa (open-football + ESPN + startKits) está em `.claude/rules/data/espn-import.md`.
Os elencos nativos vêm de `data_process/native/`; `src/example_data/squads` é só saída.

Qualquer mudança no mundo (importador, calibração, calendário, elencos nativos) **invalida os startKits**. Eles guardam uma fotografia do mundo inteiro, por isso é preciso regenerá-los sempre. Nunca commite `src/Data/` nem saves.

---

## Regra de calendário

O calendário de todas as ligas fica em `src/example_data/leagueSchedules.json`, e `src/Domain/season/leagueScheduleConfig.ts` o lê. Uma liga só vira `activeLeagues` se estiver nesse calendário **e** em `leagueData.json`.

- **Ligas de ano civil** (América do Sul, Escandinávia, etc.) usam `season: "2025"` e começam em **02-05**.
- **Ligas europeias** usam `season: "2024-25"` e começam em **08-15**, cruzando o ano.
- Toda rodada fica dentro de `[início, fim]` da liga: `generateLeagueCalendar` puxa para dentro as rodadas que o `baseWeekOffset` e o encaixe no dia de jogo empurrariam para fora (`fitRoundsToWindow`). O país vira no fim, então uma rodada depois dele nunca seria jogada.

Essas datas ("2025"/"02-05", "2024-25"/"08-15") são do mundo **intermediário** que este importador
produz sozinho. `scripts/importEspn.ts` roda em seguida e avança a temporada de todo o mundo em 2 anos
(`bumpSeason`: "2024-25" → "2026-27", "2025" → "2027"), então o mundo final e os startKits gerados
sobre ele usam 2026-27/2027, com a carreira começando em **2027-02-05**.

O motivo das datas fixas são os startKits. Um kit pré-simula o mundo, dia a dia, do início mais cedo
(08-15, as europeias, na temporada 2026-27) até a data de início do Brasileirão (**2027-02-05** no
mundo final). Uma carreira nova cuja liga começa depois do início do mundo recebe um kit aleatório
(`src/backend/startKits.ts`). Se uma liga de ano civil começasse antes de 02-05, a carreira nasceria
com rodadas dessa liga no passado sem jogar. Por isso todas as ligas de ano civil começam exatamente
em 02-05, e só as europeias têm rodadas jogadas dentro do kit.

---

## Pirâmide e zonas derivadas

O importador também grava `src/example_data/pyramids.json`: por país com dois níveis ou mais, os
níveis, os grupos e quantos sobem (`promote`) e caem (`relegate`) em cada grupo. É a fonte do
acesso e rebaixamento no jogo (`.claude/rules/game/membership.md`).

- **Módulo:** `scripts/openfootball/pyramid.ts` (+ teste). `buildPyramid(ligas, { boundaries })`
  monta a pirâmide, `pyramidGroupOf` acha o grupo de uma liga e `zonesFromPyramid` gera as zonas.
- **Entrada:** toda liga do `leagueData` (nativas e `of_*`) com país, número de clubes e nível. O
  nível vem de `TL_LEAGUES` para as nativas e de `tierOf` (com `tierOverrides.json`) para as do
  seed. Depois `pyramidOverrides.json` pode mudar o nível **só na pirâmide**, sem mexer nas
  finanças calibradas.
- **Contagens coerentes:** entre N e N+1 os dois lados somam igual.
  - N+1 com um grupo: `min(base(N), base(N+1))`, com `base` = 3 para ligas de 16 clubes ou mais e
    2 abaixo disso.
  - N+1 com K ≥ 2 grupos: cada grupo promove 1 e N rebaixa K, repartidos o mais igual possível.
  - Nenhum grupo passa de metade dos seus clubes; o importador avisa quando corta.
- **`data_process/openfootball/pyramidOverrides.json`:**
  - `{ "<slug>": { "tier": n } }` muda o nível de uma liga na pirâmide (hoje os grupos 2, 3 e 4 da
    Rússia B ficam no nível 4);
  - `boundaries: { "<País>": { "1-2": n, "2-3": n } }` fixa a contagem de uma fronteira (hoje o
    Brasil sobe e desce 4). Num nível de baixo com K ≥ 2 grupos a contagem tem que ser K.
  - Slug ou país desconhecido faz o importador falhar.
- **Zonas derivadas:** as zonas `prom`/`rel` de todas as ligas (inclusive as nativas, que de resto
  ficam intactas) são regeneradas a partir da pirâmide. Zonas continentais (`ucl`, `lib`…) ficam
  como estavam. A checagem de integridade falha se alguma zona de acesso/rebaixamento divergir da
  pirâmide, ou se uma liga de país sem pirâmide tiver essas zonas (exceto as nativas fora de
  pirâmide, que mantêm as zonas escritas à mão).
- O fim do importador imprime cada pirâmide com `✓` quando as fronteiras batem.

Mudou a pirâmide ou os overrides? Rode o importador de novo, copie para `src/Data/` e regenere os
startKits (a pirâmide e as zonas não ficam nos kits, mas o `leagueData` e o mundo mudam juntos).

---

## Calibração

Os atributos e as finanças são **derivados**, não originais. O seed só traz `overall`, posição, idade, pé e reputação. Os 13 atributos de 0 a 10 do FMProject são estimados por regressão.

- **Pares.** O casamento por nome encontra cerca de 3.075 jogadores e 114 clubes que existem nos dois datasets (Brasil A/B e as 5 grandes).
- **Overrides de clube.** `data_process/openfootball/clubOverrides.json` (`squadId nativo → id do clube no seed`) corrige casos em que o mesmo clube existe nos dois datasets mas o nome nunca bate — nem por igualdade nem por conter um o outro — porque é uma grafia diferente da mesma cidade/clube (`"Bayern München"` × `"Bayern Munich"`: o NFKD de `normName` tira o trema e vira "munchen", uma palavra diferente de "munich"; `"Wolves"` × `"Wolverhampton Wanderers"`: nenhuma substring em comum). `matchClubsWithOverrides` (`scripts/openfootball/calibration.ts`) aplica os overrides antes do `matchClubs` de cada liga do seed, e só quando o clube do override pertence à MESMA liga do seed que está sendo casada — um clube nativo cujo único homônimo no seed está numa divisão diferente (`"Fulham"`/`"Leeds United"`: no seed da Premier League o seed não tem esses dois clubes, só na Championship, uma diferença real de temporada entre os dois datasets, não um problema de grafia) fica sem par, de propósito. Hoje 5 entradas: `39→gb-wolves`, `157→de-bayern-munich`, `531→es-athletic-bilbao`, `94→fr-rennes`, `1062→br-atletico-mineiro`. Efeito nos ajustes: pares de calibração 2.937→3.075 jogadores, 109→114 clubes; multiplicadores de tier e medianas de economia mudaram menos de 1% (5 clubes a mais entre ~110 usados no ajuste de finanças).
- **Atributos.** Para cada papel e atributo há uma regressão `stat = a + b·overall + c·leagueRep`, com ruído determinístico de `sd` residual.
  - `leagueRep` é a reputação da liga no seed dividida por 1000. É a **covariável de reputação de liga**, necessária porque o OVR do seed é normalizado dentro de cada liga.
  - Na derivação, `leagueRep` é limitado ao intervalo de calibração. O **piso é 2,8** (`leagueRepFloor` = `repMin − REP_FLOOR_MARGIN`), para não extrapolar para ligas muito fracas.
- **Finanças.** Orçamento, TV, comercial, seguidores e capacidade vêm de uma reta em log contra a reputação do clube, ajustada nos clubes da primeira divisão.
- **Multiplicadores de tier.** `tierMultipliers` reduz as finanças nas divisões 2 e 3. É calibrado contra as Séries B e C nativas. Por exemplo, o orçamento fica em cerca de ×0,23 no tier 2 e ×0,05 no tier 3.
- **Correção manual de tier.** `data_process/openfootball/tierOverrides.json` corrige o tier de ligas do seed classificadas errado. Hoje há uma entrada: `argentine-second-division-group-b` → 3.

Tudo fica em `data_process/openfootball/calibration.json`: pares, coeficientes, `leagueRepFloor`, `clubFits`, `tierMultipliers` e `tierOverrides`. O arquivo é auditável e regenerado a cada rodada.

---

## Recalibração dos nativos (nível do seed, perfil nativo)

A calibração acima estima **atributos** dos jogadores `of_*` a partir do seed. A recalibração é
diferente: ela corrige o **nível** dos jogadores **nativos** (`data_process/native/squads`) que
têm par no seed, porque os atributos nativos originais classificam mal os craques (o seed já
ordena bem: Kane e Mbappé 99, Dembélé 98, Saka/Salah/Haaland 97…, enquanto no mundo nativo puro o
Mbappé era o 137º por overall). Ver
`docs/superpowers/specs/2026-09-25-native-star-recalibration-design.md`.

- **Módulo puro:** `scripts/openfootball/recalibrate.ts` (+ teste): `fitLevelPredictor`,
  `predictLevel`, `quantileTargets`, `applyShift`/`findShift` e `shiftToOverall`. Não toca disco;
  o importador é quem lê/escreve.
- **Pares.** Parte dos mesmos pares nativos↔seed de `matchClubs`/`matchPlayers` (Série B incluída,
  ~2.900 jogadores) — a calibração de atributos dos `of_*` continua só com esses. Só para a
  recalibração, um passo extra (`matchPlayersByTokenSubset`, `scripts/openfootball/calibration.ts`)
  acha pares adicionais dentro do mesmo clube: um jogador do seed casa com um nativo ainda sem par
  quando todo token do nome do seed (2+ tokens) aparece no `name` ∪ `fullName` do nativo e as idades
  diferem no máximo 1, exigindo par único dos dois lados. Cobre nativos abreviados com nome completo
  cheio de nomes do meio — `"H. Kane"` / `fullName` `"Harry Edward Kane"` contra o seed `"Harry
  Kane"` — que `matchPlayers` não casa porque as chaves normalizadas nunca são iguais.
- **Regra, por papel principal (GK/DEF/MID/FWD), nesses pares:**
  1. **Previsor de nível:** `z = a + b·seedOverall + c·leagueRep`, ajustado contra o overall do
     jogo (`Player.computeOverallAvg`) do nativo **antes** de qualquer mudança. Papel com menos de
     3 pares fica sem previsor e seus jogadores não são tocados.
  2. **Escala por quantis:** dentro do papel, ordena os pares por `z` (desempate pelo id) e
     devolve a cada um, na mesma ordem, um valor de um multiset de referência — do maior para o
     menor. A ordem (quem recebe qual nota) vem do `z` do seed; a ESCALA vem do multiset.
     **O multiset é o overall "of_* sombra"** de cada jogador do par — `derivePlayer(seedPlayer,
     ..., coeffs, leagueRep, { noise: false })` (o mesmo `derivePlayer` que gera todo `of_*` real,
     só sem o termo de ruído gaussiano por atributo) — não o overall nativo pré-recalibração.
     *Por quê não o nativo:* o teto de cada papel (o maior valor do multiset, dado a quem tiver o
     maior `z`) ficava preso a qualquer valor nativo pré-existente mais alto daquele papel — e
     esse valor não tinha nenhuma relação com o seed. Na 1ª rodada da recalibração (só nativo como
     multiset) o teto de Ataque (6,74) era do "Yan Diomande" (seedOverall 85, exatamente o jogador
     que o bug original relatava como 1º errado do mundo), enquanto o teto de Defesa (6,25) e de
     Meio (6,39) eram de outros nomes pouco conhecidos — nada a ver com quem o `z` realmente
     escolhia como melhor do papel (conferido à parte: os 5 melhores por `z` de cada papel SÃO os
     verdadeiros craques do seed — Courtois/Donnarumma/Oblak no gol, Van Dijk/Saliba na defesa,
     Salah/Rice/Rodri no meio, Mbappé/Saka/Haaland/Kane no ataque — o previsor de nível funciona; o
     problema era só a escala do alvo). Usar o "of_* sombra" tira esse viés: o teto passa a vir da
     MESMA regressão `seedOverall/leagueRep → atributo` que gera o resto do mundo, então um
     seedOverall 99 tem, por construção, um teto compatível com um `of_*` real de seedOverall 99.
     `{ noise: false }` é essencial — com o ruído normal do `derivePlayer` ligado, um craque
     específico podia cair mal na distribuição aleatória (ex.: Kane saiu com `finishing` baixo e
     `passing` alto num sorteio, um perfil às avessas para um centroavante) e o teto do papel virava
     de novo um acidente, só que do ruído em vez do nativo velho. Sem ruído, o valor é a reta de
     regressão pura — determinístico e sem essa loteria por jogador.
  3. **Deslocamento único:** acha a posição específica onde o jogador rende mais
     (`Player.bestSpecificRole` sobre os atributos nativos originais) e soma um único `s` a todo
     atributo com peso > 0 no `attrWeights` dessa posição (`src/Data/roles.json`), contínuo,
     limitado a 0..10, achado por bisseção até `Player.computeOverallAvg` bater com o alvo
     (tolerância 0,01). Depois arredonda cada atributo com hash do id do jogador — mesmo esquema
     sem viés de `scripts/espn/estimate.ts` (`floor(v + unitHash(...))`). O perfil (a forma dos 13
     atributos) continua o nativo; só o nível muda.
  4. Nativo sem par no seed, ou de um papel sem previsor, não muda.
- **Onde entra no importador:** depois de copiar `data_process/native/squads` para
  `src/example_data/squads` (a calibração de atributos dos `of_*`, seção 2, já rodou e usa os
  atributos nativos **originais** — não é afetada). A seção 3.5 recalibra e regrava só os arquivos
  de elenco nativo que tiveram algum jogador mudado, no mesmo formato (indentação 2) dos arquivos
  nativos; `overallAvg` em cache é removido dos jogadores mudados. `data_process/native` nunca é
  tocado — é sempre a fonte original.
- **Relatório no fim do importador:** pares e coeficientes do previsor por papel, jogadores
  recalibrados, e depois (lendo o mundo inteiro já escrito, `of_*` incluído) o top 20 do mundo e a
  posição de Mbappé, Kane, Haaland, Salah, Vini, Bellingham, Yamal, Wirtz, Doku e Diomande.
- **Nenhuma rescisão sem par continua sem mudar.** Kane e Bellingham (assim como Van Dijk e Rodri,
  abaixo) sempre tiveram par — o gargalo era outro em cada caso; ver `.claude/rules/data/espn-import.md`
  para os casos de jogador sumindo no `importEspn` (Salah, Rodri).
- **Resultado (rodada com `clubOverrides` + teto "of_* sombra", ~2026-09-25):** Mbappé 137º (mundo
  nativo original) → 34º; Kane, que nunca tinha par porque o clube (Bayern München/Munich) não
  casava, agora casa e recalibra (ver acima); Van Dijk é o #1 por `z` entre 1019 zagueiros e recebe
  o teto do papel; Rodri é o #3 por `z` entre 1064 meio-campistas. O `z` acerta quem é craque; a
  posição final no mundo (não apenas dentro do papel) ainda reflete: (a) quantos outros craques de
  `seedOverall` parecido competem pelo mesmo teto de papel (o Meio tem 5 jogadores com
  `seedOverall ≥ 95` disputando a faixa alta — Salah, Rice, Rodri, Bruno Fernandes, Ødegaard —
  então até o 3º colocado fica numa nota moderada), e (b) o envelhecimento do `importEspn` (Van
  Dijk e Kane, ambos com 30+ anos, perdem nota na fase de idade — ver espn-import.md — depois de já
  terem sido corretamente recalibrados). Isso é esperado e aceito pelo design (opção "100% do seed"
  aprovada); o previsor de nível e a escala por quantis fazem o que devem.

---

## Limitações conhecidas

- **Escudos.** Os clubes cobertos pela ESPN têm escudo em `logos/espn/`; os demais `of_*` usam o brasão de cores. Ver `.claude/rules/data/espn-import.md`.
- **Jovens de preenchimento.** O seed tem clubes com só 7 jogadores. O `roster.ts` gera jovens para cumprir os mínimos por papel (GK 3, DEF 7, MID 7, FWD 4) e completar até 18 jogadores. O máximo é 30.
- **Serie A e Ligue 1.** As re-derivações desses elencos saem mais baixas que os valores nativos. Isso afeta só a checagem de calibração, porque os elencos nativos não são substituídos.
- **Caminhos no Windows.** Resolvido: todo caminho de dados usa `fileURLToPath`, nunca `new URL(...).pathname`, que gera `/C:/...` no Windows nativo. Mantenha esse padrão em código novo.

---

## Olheiros (`ScoutScreen`)

O `ScoutScreen` não carrega mais todos os elencos. Ele chama `POST /api/saves/:id/scout-search`
(`src/Domain/scout/scoutQuery.ts` + `src/backend/scoutSearch.ts`), que filtra, ordena e pagina no
servidor: 100 linhas por página, cerca de 59 KB por página, contra os ~24,7 MB do antigo
`/api/saves/:id/all-squads`. As linhas, nacionalidades e ids na lista de venda ficam num cache por
save, com chave `currentDate` mais a versão de escrita de `src/backend/dal/saveDataVersion.ts`
(`bumpSaveDataVersion`, chamado a cada gravação de elenco/mercado), então transferências e edições
na lista de venda no meio do dia invalidam o cache.

---

## Bench do avanço de dia

`scripts/bench-advance-day.ts` cria uma carreira pelo mesmo caminho do wizard (Premier League, com start kit), avança N dias, imprime uma tabela por dia e apaga o save no fim.

```bash
bun scripts/bench-advance-day.ts [--days 14] [--buffered] [--compare]
```

- sem flag: cada dia roda direto no `FileSystemDAL`;
- `--buffered`: cada dia roda num `BufferingSaveDAL`, gravado ao fim do dia, como faz `POST /api/advance-day/:saveId`;
- `--compare`: roda as duas versões a partir do mesmo snapshot e compara os resultados determinísticos.

Na rota ao vivo, o dia inteiro é uma unidade de trabalho: `advanceOneDay` recebe o serviço do dia, e a inbox (`emitInboxMessage(..., service)`) também passa por ele. O `flush` grava tudo e deixa o `meta` (com o `currentDate`) por último. Se alguma gravação falhar, o `meta` não é gravado, o dia não conta como avançado e a rota responde 500.

Números com o mundo inteiro:

| Situação | Tempo por dia |
|---|---|
| Antes das otimizações (sem buffer por dia) | ~4–5 s |
| Depois, dia de rodada do usuário (sem o motor completo) | 1,63–1,69 s |
| Depois, demais dias | 1,27 s |
| Motor completo (a liga do usuário numa rodada) | +~6,4 s |

As outras ligas usam o quickSim. Só a partida da liga do próprio usuário usa o motor completo.
