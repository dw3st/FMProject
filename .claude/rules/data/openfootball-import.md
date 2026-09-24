# Importador open-football

## O que é

`scripts/importOpenFootball.ts` é um script **offline**. Ele converte o `data_process/openfootball/seed-real.json` do projeto open-football (Apache-2.0; ver `data_process/openfootball/NOTICE.md`) em ligas, clubes e jogadores no formato nativo do TouchLines. A lógica fica em módulos puros e testados em `scripts/openfootball/`:

| Módulo | Responsabilidade |
|---|---|
| `types.ts` | Tipos do seed |
| `ids.ts` | Normalização de nomes, ids, slugs, hash determinístico |
| `roster.ts` | Mapeamento de posição, corte de elenco, jovens de preenchimento |
| `calibration.ts` | Casamento seed ↔ TouchLines e regressões |
| `derive.ts` | Atributos, perfil, finanças, estádio, técnico |
| `leagues.ts` | Filtro de ligas, zonas, países, calendários |
| `pyramid.ts` | Pirâmide por país e zonas `prom`/`rel` derivadas dela |

As saídas vão para `src/example_data/`:
- `squads/of_*/`;
- entradas novas em `leagueData.json`, `countries.json`, `databases.json` e `leagueSchedules.json`;
- `pyramids.json` (pirâmide por país).

A calibração é gravada em `data_process/openfootball/calibration.json`.

O script é **determinístico**, porque não usa `Math.random` e usa hash dos ids. Ao rodar de novo, ele apaga as saídas anteriores (`of_*` / `source` open-football) e as regrava. As ligas nativas (Brasil A/B/C e as 5 grandes europeias) não são tocadas. As 7 ligas do seed que se sobrepõem a elas servem só para calibrar.

O mundo atual tem 83 ligas, 1227 elencos e cerca de 36 mil jogadores.

### Convenção de ids (fixa)

- **liga** = `of_` + slug do seed com `-` → `_` (ex.: `of_championship`);
- **clube** = `of_` + id do seed com `-` → `_` (ex.: `of_uy_albion`);
- **jogador** = `of_` + id do seed com `-` → `_`;
- o **`slug` do clube** é igual ao id do clube, o que evita a leitura dupla em `getSquad`.

Os ids de squad e de jogador são únicos no mundo inteiro. O arquivo `squads/{liga}/{id}.json` tem nome = `id` = `standings[].squadId`.

---

## Como regenerar

```bash
bun scripts/importOpenFootball.ts          # regrava src/example_data (squads, leagueData, countries, schedules, calibration)
cp -R src/example_data/. src/Data/         # sincroniza o runtime (src/Data é gitignored)
bun run kits:generate 5                    # pré-simula 5 startKits em src/Data/startKits (~50 s por kit; 5 kits ≈ 4 min)
rm -f src/example_data/startKits/*         # remove kits e manifests antigos
cp src/Data/startKits/* src/example_data/startKits/   # copia os kits novos para commit
```

Qualquer mudança no mundo (importador, calibração, calendário, elencos nativos) **invalida os startKits**. Eles guardam uma fotografia do mundo inteiro, por isso é preciso regenerá-los sempre. Nunca commite `src/Data/` nem saves.

---

## Regra de calendário

O calendário de todas as ligas fica em `src/example_data/leagueSchedules.json`, e `src/Domain/season/leagueScheduleConfig.ts` o lê. Uma liga só vira `activeLeagues` se estiver nesse calendário **e** em `leagueData.json`.

- **Ligas de ano civil** (América do Sul, Escandinávia, etc.) usam `season: "2025"` e começam em **02-05**.
- **Ligas europeias** usam `season: "2024-25"` e começam em **08-15**, cruzando o ano.
- Toda rodada fica dentro de `[início, fim]` da liga: `generateLeagueCalendar` puxa para dentro as rodadas que o `baseWeekOffset` e o encaixe no dia de jogo empurrariam para fora (`fitRoundsToWindow`). O país vira no fim, então uma rodada depois dele nunca seria jogada.

O motivo são os startKits. Um kit pré-simula o mundo, dia a dia, do início mais cedo (08-15, as europeias) até **2025-02-05**, a data de início do Brasileirão. Uma carreira nova cuja liga começa depois do início do mundo recebe um kit aleatório (`src/backend/startKits.ts`). Se uma liga de ano civil começasse antes de 02-05, a carreira nasceria com rodadas dessa liga no passado sem jogar. Por isso todas as ligas de ano civil começam exatamente em 02-05, e só as europeias têm rodadas jogadas dentro do kit.

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

Os atributos e as finanças são **derivados**, não originais. O seed só traz `overall`, posição, idade, pé e reputação. Os 13 atributos de 0 a 10 do TouchLines são estimados por regressão.

- **Pares.** O casamento por nome encontra cerca de 2.900 jogadores e cerca de 109 clubes que existem nos dois datasets (Brasil A/B e as 5 grandes).
- **Atributos.** Para cada papel e atributo há uma regressão `stat = a + b·overall + c·leagueRep`, com ruído determinístico de `sd` residual.
  - `leagueRep` é a reputação da liga no seed dividida por 1000. É a **covariável de reputação de liga**, necessária porque o OVR do seed é normalizado dentro de cada liga.
  - Na derivação, `leagueRep` é limitado ao intervalo de calibração. O **piso é 2,8** (`leagueRepFloor` = `repMin − REP_FLOOR_MARGIN`), para não extrapolar para ligas muito fracas.
- **Finanças.** Orçamento, TV, comercial, seguidores e capacidade vêm de uma reta em log contra a reputação do clube, ajustada nos clubes da primeira divisão.
- **Multiplicadores de tier.** `tierMultipliers` reduz as finanças nas divisões 2 e 3. É calibrado contra as Séries B e C nativas. Por exemplo, o orçamento fica em cerca de ×0,23 no tier 2 e ×0,05 no tier 3.
- **Correção manual de tier.** `data_process/openfootball/tierOverrides.json` corrige o tier de ligas do seed classificadas errado. Hoje há uma entrada: `argentine-second-division-group-b` → 3.

Tudo fica em `data_process/openfootball/calibration.json`: pares, coeficientes, `leagueRepFloor`, `clubFits`, `tierMultipliers` e `tierOverrides`. O arquivo é auditável e regenerado a cada rodada.

---

## Limitações conhecidas

- **Sem escudos.** Os clubes `of_*` não têm arquivo em `Data/logos/`. O `ClubLogo` desenha o brasão com as cores do clube.
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
