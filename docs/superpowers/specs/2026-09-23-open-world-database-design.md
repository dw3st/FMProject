# Base de dados "open world" — Design

**Data:** 2026-09-23
**Status:** aprovado

## Objetivo

Ampliar o mundo do TouchLines de 8 ligas para cerca de 80, com os clubes e jogadores do
`seed-real.json` do SportsManagerInterativo (dataset open-football: 91 ligas, 1236 clubes,
54 423 jogadores). O mundo fica mais aberto:

- toda liga tem calendário, tabela e resultados;
- dá pra começar a carreira em qualquer liga;
- existe acesso e rebaixamento entre as divisões de um mesmo país.

## Decisões

| Decisão | Escolha |
|---|---|
| Simulação | Híbrida. A liga do jogador e até 3 ligas "seguidas" usam o motor completo (`full`); as demais usam um simulador rápido (`fast`) |
| Jogáveis | Todas as ligas importadas |
| Acesso/rebaixamento | Entra neste trabalho |
| Forma de importar | Importador offline que gera arquivos no formato nativo (abordagem A) |
| Ligas que já existem | As 8 atuais ficam como estão (dados reais da API-Football). O seed só entra onde o TouchLines não tem nada |
| Compatibilidade de save | Nenhuma. Saves antigos ficam inválidos (regra do CLAUDE.md) |

## 1. Importador e derivação de atributos

**Fonte:** `data_process/openfootball/seed-real.json`, copiado do SportsManagerInterativo junto
com `LICENSE-open-football.txt` e `NOTICE-open-football.txt`.

**Script:** `scripts/importOpenFootball.ts` (Bun), rodado manualmente. Ele grava em
`src/example_data/` e é idempotente: todo arquivo gerado leva `source: "open-football"`, e uma
nova execução substitui apenas esses arquivos.

### Filtros

- Descarta ligas com menos de 8 clubes.
- Pula as ligas que o TouchLines já tem. Um mapa explícito em
  `data_process/openfootball/overlap.json` liga o slug do seed ao slug do TouchLines (Premier
  League, Bundesliga, La Liga, Serie A, Ligue 1, Brasileirão A/B). Não há casamento por nome.
- Elenco com no máximo 30 jogadores. Primeiro garante 3 goleiros e a profundidade mínima por
  setor da tabela do tier `low` em `sellList` (GK 3, DEF 7, MID 7, FWD 4); o resto das vagas
  vai para os maiores OVR.

### Calibração

A média dos 13 atributos de um jogador de linha no TouchLines fica entre 1,5 e 4,1 em 10 (do
10º ao 90º percentil). Não dá pra usar escala linear a partir do OVR.

1. Nas ligas sobrepostas, casa os jogadores do seed com os do TouchLines pelo nome normalizado
   (sem acento, minúsculo), dentro do mesmo clube.
2. Para cada papel do TouchLines e cada atributo, ajusta uma reta `atributo = a + b × OVR` por
   mínimos quadrados.
3. Se um papel tiver menos de 30 pares, usa os coeficientes do papel-irmão do mesmo setor
   (por exemplo, LWB usa LB).
4. Salva os coeficientes em `data_process/openfootball/calibration.json` para auditoria e
   ajuste manual.

### Derivação por jogador

- `atributo = clamp(round(a + b × OVR + ruído), 0, 10)`. O `ruído` fica em ±0,5, com semente
  no hash de `playerId + atributo`: é determinístico e evita que jogadores com o mesmo OVR
  saiam idênticos.
- As posições do seed (`DL`, `WBL`, `AML`…) viram os papéis do TouchLines (`LB`, `LWB`,
  `LW`…) por uma tabela fixa no script, ordenadas pelo nível de proficiência do seed.
- Idade, pé e nome vêm do seed. `potential` é descartado, porque o sistema de desenvolvimento
  não usa potencial oculto.
- `profile.archetype` e `profile.summary` são gerados a partir do papel e dos 2 atributos mais
  altos, por templates.

### Clube

- Cores: `colorBg` e `colorFg`. `logo` fica ausente.
- `venue.capacity` e `finances` derivados da reputação da liga e do clube, pelo modelo de
  tiers do `finance.md` (LOW, MEDIUM, HIGH, ELITE).
- `coach.name` gerado de forma determinística pelo `clubId`.

### Saídas

| Arquivo | Conteúdo |
|---|---|
| `squads/{leagueSlug}/{clubSlug}.json` | Elencos novos |
| `leagueData.json` | Entradas novas com `zones` (`prom` e `rel`, coerentes com a pirâmide) |
| `countries.json` | Países novos (`playable: true`) + `continent` |
| `leagueSchedules.json` | Substitui `LEAGUE_SCHEDULE_CONFIGS`. Todas as ligas de um país compartilham a data de início |
| `pyramids.json` | Pirâmide por país (seção 3) |
| `databases.json` | Contadores do banco "Official" atualizados |
| `startKits/*` | Regenerados com `bun run kits:generate` |

Calendário: por padrão, o europeu (ago → mai, `crossYear: true`). Países de ano civil
(`crossYear: false`, fev/mar → nov/dez) ficam listados no script: Brasil, Argentina, Chile,
Uruguai, Paraguai, Peru, Colômbia, Venezuela, EUA, Japão, Noruega, Suécia, Finlândia e Islândia. O `baseWeekOffset` escalona as ligas dentro de cada país.

## 2. Simulador rápido

**Arquivos:** `src/Domain/advanceDay/quickSim.ts` e
`src/GameEngine/Configs/QuickSimConfig.ts`.

`quickSimMatch(home, away, homeLineup, awayLineup, rng): PlayedMatchRecording` é uma função
pura. O resultado passa por `buildMatchEventFromRecording`, que já chama
`finalizeSquadsAfterMatch`. Energia, `seasonLog` e desenvolvimento funcionam sem código novo.

### Modelo

1. **Força por setor** dos 11 escalados, com desconto de energia:
   - ataque = média de finalização, drible, velocidade e aceleração dos FWD e dos MID ofensivos;
   - meio = média de passe, visão e pressão dos MID;
   - defesa = média de desarme, pressão, força e cabeceio dos DEF e dos CDM;
   - goleiro = média de reflexo, salto e pressão do GK.
2. **Gols esperados:**
   `xG_casa = BASE_GOALS × (ataque_casa × meio_casa) / (defesa_fora × goleiro_fora) × HOME_ADVANTAGE`.
   O `xG_fora` usa a mesma fórmula, sem o fator de mando. Os gols saem de uma Poisson.
3. **Autor do gol:** sorteado entre os escalados, com peso `ROLE_GOAL_WEIGHT[papel] × finalização`.
   **Assistência:** sorteada entre os outros escalados, com peso `ROLE_ASSIST_WEIGHT[papel] × passe`,
   e sem assistência com probabilidade `NO_ASSIST_RATE`.
4. **Estatísticas por jogador** (passes, chutes, desarmes, interceptações): geradas em
   proporção ao papel e à força do setor. A nota final aplica as mesmas regras de rating do
   `player-scores.md` sobre essas estatísticas.
5. **Energia:** queda média por jogo igual à do motor (`ENERGY_DRAIN`).

### Calibração

O script `scripts/quicksim-calibrate.ts` joga N partidas pelos dois caminhos, motor e
`quickSim`, com os mesmos elencos, e compara média de gols, % de vitória do mandante e % de
empates. Meta: o `quickSim` fica a ±10% do motor nas três métricas.

### Modo por liga

- O modo é **derivado** por `resolveSimMode(leagueSlug, meta)` (`src/Domain/advanceDay/simMode.ts`), nunca gravado.
- É `full` a liga do clube do jogador e as primeiras 3 ligas de `meta.followedLeagues`. As outras são `fast`.
- Jogos do clube do jogador são sempre `full`.

### Log do dia

Partidas `fast` gravam um `MatchEvent` compacto: `score`, `scorers` e `fixtureId`, com
`playerStats`, `teamStats` e `playerRatings` omitidos. O tipo ganha `compact?: true`, e as telas
que exibem detalhes tratam esse caso ("Resumo indisponível — liga simulada").

### Superfícies obrigatórias

- **`Statistics.ts`:** artilharia e tabela recebem os resultados `fast` pelo mesmo caminho
  dos `full`.
- **`/lab`:** variante "quickSim vs motor" em `scenarioRunner`, com gols/jogo, % de mandante
  e % de empates em `SummaryBars`. Os campos entram em `TeamRawStats` e `VariantSummary`.
- **`/test`:** cenário em `TestCases.ts` + painel com o breakdown (forças por setor, xG, gols
  sorteados) para dois elencos.

## 3. Pirâmide com acesso e rebaixamento

### Pertencimento por save

- A pasta `saves/{id}/squads/{liga}/` é a verdade: um clube joga na liga da pasta onde está
  o arquivo dele. Não existe `leagueMembership.json` (seriam duas fontes que podem divergir).
- O `SquadIndex` (`src/backend/squadIndex.ts`, via `SaveService.getSquadIndex`) resolve
  pertencimento e localização: `byId`, `inLeague`, `resolve`. Ele substitui toda leitura de
  `leagueData.standings` usada para saber quem joga onde, em `advanceDay.ts`, `routes.ts` e
  `SaveService.ts`.
- Mudar um clube de liga é `SaveService.moveSquad` (grava na liga nova, `deleteSquad` na
  antiga; no `BufferingSaveDAL` a remoção vira tombstone até o flush).
- O `leagueData.json` é só catálogo (nome, cores, zonas), incluindo a **liga de origem para
  escudos**: os arquivos de escudo ficam em `Data/logos/{liga de origem}/`.

### `pyramids.json`

Gerado pelo importador em `src/example_data/pyramids.json` (copiado para `src/Data/`), com chave
pelo nome do país em `leagueData`:

```json
{
  "Italy": {
    "country": "Italy",
    "levels": [
      { "tier": 1, "groups": [{ "leagueSlug": "serie_a", "promote": 0, "relegate": 3 }] },
      { "tier": 2, "groups": [{ "leagueSlug": "of_italian_serie_b", "promote": 3, "relegate": 3 }] },
      { "tier": 3, "groups": [
        { "leagueSlug": "of_italian_serie_c_a", "promote": 1, "relegate": 0 },
        { "leagueSlug": "of_italian_serie_c_b", "promote": 1, "relegate": 0 },
        { "leagueSlug": "of_italian_serie_c_c", "promote": 1, "relegate": 0 }
      ] }
    ]
  }
}
```

- Cada nível tem uma ou mais ligas (grupos). Só entram países com dois níveis ou mais.
- As ligas nativas entram com o slug do TouchLines (`premier_league`, `serie_a`,
  `brazil_serie_b`…), as importadas com o slug `of_*`.
- Correções manuais ficam em `data_process/openfootball/pyramidOverrides.json`:
  - nível por liga (hoje: os grupos B da Rússia no nível 4);
  - `boundaries`: contagem de uma fronteira por país (hoje: Brasil 4 sobem / 4 descem).
- As zonas `prom`/`rel` de exibição de **todas** as ligas são regeneradas a partir da
  pirâmide (as zonas continentais, como `ucl` e `lib`, ficam como estavam).

### Regra de troca

- Entre o nível N e o N+1 as duas contagens são sempre iguais (`scripts/openfootball/pyramid.ts`):
  - N+1 com um grupo só: `min(base(N), base(N+1))` clubes em cada sentido, com `base` = 3 para
    ligas de 16 clubes ou mais e 2 abaixo disso;
  - N+1 com K ≥ 2 grupos: cada grupo promove o campeão e o nível N rebaixa K no total,
    repartidos entre os grupos de N o mais igual possível;
  - nenhum grupo sobe ou desce mais que metade dos seus clubes;
  - `boundaries` em `pyramidOverrides.json` substitui a contagem de uma fronteira.
- `planPromotionRelegation(pirâmide, tabelas finais)` (`src/Domain/season/promotionRelegation.ts`,
  puro) devolve a lista de `ClubMove` (`squadId`, `from`, `to`, `promoted | relegated`):
  - os `relegate` últimos de cada grupo descem e os `promote` primeiros sobem;
  - cada clube que muda é mandado para o grupo mais "em falta" do nível de destino (saldo de
    chegadas − saídas, depois menos clubes, depois slug). Assim cada grupo recebe tantos quanto
    perde e mantém o tamanho (Itália: os 3 rebaixados da B vão um para cada grupo da C).
- O nível mais baixo não rebaixa. Países com um único nível não trocam nada.

### Momento da troca

- A virada é **por país** (`src/Domain/season/countryRollover.ts`, puro, chamado por
  `advanceOneDay`):
  - `findDueRollovers` decide, depois de jogado o dia, quais ligas viram. Uma liga terminou quando
    `addOneDay(data) > end`;
  - um país da pirâmide só vira no dia em que a **última** liga dele termina
    (`countryReadyForTransition`). Até lá as ligas que já terminaram ficam paradas, sem jogos
    (Itália: B e C terminam em 05-17, a A em 05-18, e o país inteiro vira em 05-18);
  - uma liga fora de qualquer pirâmide vira sozinha, no dia do seu próprio fim.
- Ordem da virada de um país, tudo dentro do mesmo dia bufferizado:
  1. **tabelas finais** de cada liga na composição antiga;
  2. **plano**: `planCountryRollover` → `planPromotionRelegation`, as mudanças de nível e a
     composição esperada de cada liga;
  3. **reset**: `runSeasonTransition` de cada liga com a composição **antiga** (arquivo da
     temporada, título, `playerLogs`, idade + 1, `seasonLog` zerado, TV das IAs). Os squads
     resetados são gravados por id onde estão (`saveSquadById`), e o clube que troca de nível já
     recebe as receitas do nível novo aqui;
  4. **mudanças**: `moveSquad` de cada clube do plano;
  5. **índice**: `dropSquadIndex` + `getSquadIndex` relê a nova composição (a pasta é a verdade);
  6. **calendário novo** (`buildNextSeasonCalendar`) e tabela zerada de cada liga, já com a
     composição **nova**;
  7. `activeLeagues` recebe o ano, o início e o fim da próxima temporada.
- **Idempotência:** uma liga virada tem o `year`/`end` da próxima temporada em `activeLeagues`,
  então não conta mais como terminada. Se a virada foi gravada mas a meta não, o ano do
  `league meta` em disco denuncia e só o estado é ressincronizado.
- **Clube do jogador:** se ele trocou de divisão, `meta.leagueSlug`, `leagueName` e
  `followedLeagues` seguem o clube. Quando o país do jogador vira, as transferências são arquivadas
  por liga e limpas, e a inbox é limpa. Depois entram as mensagens da categoria `season` (`champion`, `promoted`,
  `relegated`). A resposta do dia traz `seasonEnded`, `archiveYear`, `moves`, `playerMove` e
  `playerChampionOf`.
- **Sem pulo de data.** `currentDate` avança sempre um dia. Não existe mais o salto para o início
  da próxima temporada, que deixava rodadas de outras ligas no passado sem jogar. Para atravessar
  a entressafra existe o **avanço rápido**.
- **Janela da temporada.** O gerador de calendário (`generateLeagueCalendar`) garante que toda
  rodada fica dentro de `[start, end]` (`fitRoundsToWindow`). Uma rodada depois do `end` nunca
  seria jogada, porque o país vira no `end`.

### Avanço rápido

- `POST /api/saves/:id/advance-until` com corpo opcional `{ "maxDays": n }` (padrão 7, máximo 14)
  (`src/backend/advanceUntil.ts`).
- Cada dia é exatamente a unidade de trabalho de `POST /api/advance-day`: `runBufferedDay`, com um
  `BufferingSaveDAL` próprio e um `flush` no fim. A data nunca pula.
- O alvo é o **próximo dia de jogo do jogador**, e o avanço **para nesse dia**: a véspera foi
  simulada e a partida não. O jogador segue pelo fluxo normal de dia de jogo (pré-jogo).
  Com o calendário do jogador esgotado, o alvo é o dia seguinte à virada do país, e depois o alvo
  é recalculado a partir do calendário novo.
- **Trava por dia:** `withSaveLock` envolve a checagem da posição e o dia, não o lote inteiro.
  Um lote pode levar uns 20 s, e o "Parar" do frontend ou um `advance-day` normal não esperam o
  lote todo. Checar o alvo dentro da mesma trava impede que outro avanço empurre o save para o
  dia de jogo entre a checagem e o dia.
- Resposta: `newDate`, `daysAdvanced`, `target`, `matchDate`, `done` e `seasonEvents` (uma
  entrada por virada do país do jogador dentro do lote). O frontend (`useAdvanceDay`) repete a
  chamada até `done`, mostra a barra de progresso e, se houve virada, o aviso de fim de temporada
  antes do pré-jogo.
- Custo: ~1,5–2 s por dia comum e ~6,5 s num dia de rodada do jogador (motor completo).

### Finanças

- Troca de divisão multiplica `broadcasting` e `commercial` do clube por
  `TIER_BROADCAST_MULT[novo] / TIER_BROADCAST_MULT[antigo]` (`src/Domain/advanceDay/tierFinances.ts`:
  nível 1 = 1, 2 = 0,35, 3 = 0,12, 4 = 0,05). `total` volta a ser a soma. `budget` e `followers`
  não mudam.
- Vale para o jogador e para as IAs, no reset da virada (passo 3).

## 4. Telas

- **Novo Jogo (`NewGameWizard.tsx`):**
  - passo País com campo de busca e grupos por `continent`;
  - passo Clube com abas por divisão/grupo, lidas de `pyramids.json`;
  - cards de clube com cores, escudo ou brasão e força média.
- **Classificação (`LeagueTableScreen.tsx`):** seletor em dois níveis (país → divisão), que abre
  na liga do jogador. Zonas coloridas e selo `rápida` nas ligas `fast`. Estrela de seguir no
  cabeçalho (até 3 ligas, nunca a própria) — não há uma seção "Ligas seguidas" em Configurações,
  porque `SettingsOverlay` não tem sessão de save; a estrela fica onde a liga já está selecionada.
- **Escudos:** sem `logo`, `squadLogoUrl` devolve `undefined` e `ClubIdentity` desenha o
  brasão com as cores. Implementar o fallback se ainda não existir.
- **i18n:** países e ligas via `t(key, { defaultValue })`. `pt-BR.json` ganha os nomes dos
  países.

## Testes

`bun test` cobre:

- **Importador:** reta por papel, fallback de papel-irmão, limites de 0 a 10, determinismo do
  ruído, corte de elenco com profundidade mínima, filtro de ligas pequenas e ligas sobrepostas.
- **`quickSim`:** com semente fixa, dá resultado determinístico. Soma dos gols dos jogadores
  igual ao placar. Média de gols em 1000 jogos dentro da faixa configurada.
- **Pirâmide:** tamanhos preservados, K grupos, nível mais baixo, país com um nível, clube do
  jogador subindo e caindo.
- **Transição do país:** só dispara quando a última liga termina.

## Critérios de aceite

- Novo Jogo lista todos os países importados e permite começar em qualquer divisão.
- Um dia de rodada com o mundo inteiro jogando leva menos de 2 s no container. Medir durante
  a implementação; se não bater, abrir otimização antes de seguir.
- `quickSim` a ±10% do motor em gols/jogo, % de vitória do mandante e % de empates.
- Ao fim da temporada, times sobem e descem, e as ligas mantêm o tamanho.
- A data nunca pula; o avanço rápido atravessa a entressafra dia a dia e para no dia de jogo.
- As 8 ligas atuais continuam com os mesmos dados.

## Fora de escopo

- Copas, continental e supercopa (projeto separado).
- Escudos reais para os clubes importados.
- Ajustes no `marketRotation` para um mercado com ~1000 clubes (observar e ajustar depois).
- Limites de estrangeiros ou regras específicas de país.
