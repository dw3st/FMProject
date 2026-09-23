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

As saídas vão para `src/example_data/`:
- `squads/of_*/`;
- entradas novas em `leagueData.json`, `countries.json`, `databases.json` e `leagueSchedules.json`.

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

O motivo são os startKits. Um kit pré-simula o mundo, dia a dia, do início mais cedo (08-15, as europeias) até **2025-02-05**, a data de início do Brasileirão. Uma carreira nova cuja liga começa depois do início do mundo recebe um kit aleatório (`src/backend/startKits.ts`). Se uma liga de ano civil começasse antes de 02-05, a carreira nasceria com rodadas dessa liga no passado sem jogar. Por isso todas as ligas de ano civil começam exatamente em 02-05, e só as europeias têm rodadas jogadas dentro do kit.

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
- **`ScoutScreen`.** Ele carrega todos os elencos (`/api/saves/:id/all-squads`), o que fica pesado com 1227 clubes. Está anotado para o plano 4.
- **Caminhos no Windows.** Ainda há `new URL(...).pathname` em `routes.ts`, em `lab/` e em `emailLog`, que quebram no Windows nativo (`/C:/...`). `SaveService`, `advanceDay`, `startKits`, `runtimeDir` e `scripts/generateStartKits.ts` já usam `fileURLToPath`.

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
