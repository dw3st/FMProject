# Torneios de base e reservas (Etapa 36)

Etapa 36 do `docs/ROADMAP.md`. Desenho aprovado em 2026-10-07 (decisões da etapa) e detalhado em 2026-10-09. Versão
**4.14**. A Etapa 37 (inscrição por competição) depende desta: ela vai ler as competições de base como mais uma
competição com inscritos. Regras atuais que esta etapa toca: `.claude/rules/game/youth.md`, `cups.md`,
`continental.md`, `membership.md`, `fitness.md`, `development.md`, `morale.md`, `injuries.md`, `discipline.md`,
`stats.md`, `non-player-games.md`, `ui-standard.md`, `changelog.md`.

## Decisões

| Tema | Decisão |
|---|---|
| Competições | Um **sub-21** e um **sub-19** por país, só com os clubes da **liga de nível 1** do país (`topLeagueOf`) |
| Formato | Turno e returno (todos contra todos, ida e volta), uma rodada por semana; tabela de liga (`standings.json`) |
| Onde mora | `saves/{id}/leagues/u21_<país>` e `u19_<país>` (meta, rodadas, `date-index`, `standings.json`); **nunca** em `meta.activeLeagues` |
| Ciclo de vida | Geradas na criação da carreira, arquivadas e regeneradas quando a liga de nível 1 do país vira (como as copas) |
| Simulação | Sempre quickSim (só resultado, tabela e quem se destacou), nunca o motor completo, nem para o clube do jogador |
| Escalação | Automática: sub-19 = jovens ≤ 19; sub-21 = jovens ≤ 21 e reservas sem minutos; clube do jogador com a base (`squad.youth`) + elenco e convocações manuais; IA com jovens/reservas do elenco + jovens gerados na hora, nunca gravados |
| Calendário | Meio de semana sem jogo do time principal do clube; dia comum por rodada, com o jogo de um clube ocupado movido para o dia livre mais próximo; adiamento automático no dia; cancelamento se não houver dia livre |
| Efeitos | DP (evolução), fôlego/carga, moral (minutos de jovens e reservas do clube do jogador) e lesões; **cartões não contam para nada** (nem suspensão na base, nem `seasonLog`) |
| Sem efeito | Bilheteria, prêmio, diretoria, torcida, histórico do clube, ranking de técnicos, prêmios de fim de temporada, inbox |
| Telas | Aba **Base** na tela de Ligas (sub-21 / sub-19), jogos do clube na semana do Painel (marcados como base), jogos de base na ficha e na tabela da Base do Elenco, bloco de convocação |
| `/test`, `/lab` | Sem efeito de partida (só quickSim): nada a exibir; `Statistics.ts` não muda |
| Saves antigos | Sem migração (protótipo): save sem as pastas não tem torneios de base |

## 1. Identidade e dados

### Slugs

`youthCompSlugOf(country, age)` = `u21_` / `u19_` + o país normalizado exatamente como `cupSlugOf` (sem acento,
minúsculo, não alfanumérico → `_`). `isYouthCompSlug(slug)` = começa com `u21_` ou `u19_`; `youthCompAgeOf(slug)`
→ `"u21" | "u19"`. `isCupSlug` e `isContinentalSlug` continuam falsos para esses slugs.

### Tipos

```ts
// src/types/youthCompTypes.ts
export type YouthCompAge = "u21" | "u19";

export interface YouthLeader {
  name: string;
  squadId: string;
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number;   // média = ratingSum / apps
  generated?: true;    // jovem gerado na hora (clube da IA): não existe no mundo
}

export interface YouthCompMetaData {
  country: string;
  age: YouthCompAge;
  /** Clubes da liga de nível 1 na geração (a tabela usa esta lista, não o índice de squads). */
  clubs: string[];
  /** Temporada encurtada: só o turno (§2.4). */
  singleLeg?: true;
  /** Nome e cores de cada clube na geração (linhas da tabela). */
  teams: Record<string, { name: string; colors: [string, string] }>;
  /** Artilharia e notas da competição, por jogador (reais e gerados). */
  leaders: Record<string, YouthLeader>;
  championId: string | null;
}
```

- `LeagueSeasonMeta.kind` aceita `"youth"`; `LeagueSeasonMeta.youth?: YouthCompMetaData`.
- `Fixture.cancelled?: true` (jogo de base sem dia livre: `played: true`, `result: null`, fora da tabela) e
  `Fixture.postponedFrom?: string` (data original de um jogo adiado).
- `PlayerSeasonLog.youthCup?: { appearances; goals; assists; ratingSum }` — só os jogos de base, **fora** dos totais
  da temporada (diferente de `cup`/`continental`, que estão dentro dos totais). Assim rankings
  (`buildCompetitionRankings`: liga = total − copa − continental), estrelas, histórico (`historyRowFromLog`), prêmios,
  forma (`recentRatings`) e a média do `seasonLog` não mudam por construção. Zera na virada como o resto do log.
- `PlayerMoraleLog.youthMinutes?: number[]` — minutos nos últimos 5 jogos de base (mais novo por último).
- `SaveMeta.youthCallUps?: { u21?: string[]; u19?: string[] }` — convocações do clube do jogador para o próximo
  jogo de cada competição.
- `StoredDayLog.youthMatches?: YouthMatchLog[]` — os jogos de base do dia, **fora** de `events`:

```ts
export interface YouthMatchLog {
  competition: string;
  fixtureId: string;
  home: string;
  away: string;
  score: { home: number; away: number } | null;   // null = cancelado
  scorers: { playerId: string; name: string; squadId: string; goals: number; generated?: true }[];
  best: { playerId: string; name: string; squadId: string; rating: number; generated?: true } | null;
  /** Jogadores reais de cada lado (os gerados ficam de fora). */
  players: { home: string[]; away: string[] };
  postponedFrom?: string;
}
```

Por que fora de `events`: todo consumidor de `MatchEvent` do dia (diretoria e torcida, moral, gols da temporada,
prêmios, histórico do clube, resumo do dia, recordes) trata um jogo do clube como jogo oficial do time principal. Um
array próprio isola a base sem tocar em nenhum deles.

### Leitura do calendário

`SaveService.getActiveRoundsForDate(saveId, date)` e `getFixturesForDate` passam a **excluir** os slugs de base
(opção `{ includeYouth: true }` para quem precisa). `getYouthFixturesForDate(saveId, date)` lê só as pastas de base.
Sem isso, a rota `match-marking`, o `match-setup`, o `GET /api/saves/:id` (jogos de hoje) e o smoke achariam um jogo
de base como "o jogo do clube hoje". `listCompetitionSlugs` continua listando tudo (o smoke de dupla marcação
enxerga a base de propósito).

## 2. Geração

`createYouthCompetitions` (`src/backend/youthCompWorld.ts`), para cada país com liga de nível 1 ativa e ≥ 2 clubes,
e para cada idade:

1. **Clubes:** `index.inLeague(topLeagueOf(country))`, ordenados por id (numérico).
2. **Rodadas:** turno e returno pelo método do círculo (`roundRobinPairings`, puro, mesma rotação de
   `generateLeagueCalendar`; o returno inverte o mando), embaralhando a ordem dos clubes com
   `mulberry32(seedFrom("${saveId}:${year}:${slug}"))`. 20 clubes = 38 rodadas de 10 jogos.
3. **Janela:** `[início da liga + 7 dias, fim da liga − 7 dias]` (`WINDOW_MARGIN_DAYS`), sempre ≥ amanhã quando
   gerada no meio de uma temporada (ver §8, "sem kit").
4. **Datas** (`scheduleYouthSeason`, puro):
   - Semanas (segunda a domingo) inteiras dentro da janela → `W`; `R` rodadas. `W ≥ R`: uma por semana, a rodada `r`
     na semana `floor(r × W / R)`. `R ≤ 2W < 2R`: duas por semana nas semanas que precisam (pares de dias
     comuns: sub-21 ter + sex, sub-19 seg + qui). `2W < R`: **só o turno** (`R/2` rodadas,
     `meta.youth.singleLeg = true`), com até 3 por semana (seg, qua, sex). Se nem assim couber, a competição não é gerada naquela temporada (`logError`). Só acontece numa
     competição regerada no meio da temporada (§8).
   - **Ocupação por clube** (`busyByClub`): datas de todo jogo do time principal conhecido na geração — todas as
     rodadas da liga do clube (`date-index` da liga; o clube joga todas), todas as datas de fase da copa do país
     (`meta.cup.stages[].date`, inclusive as ainda não sorteadas: conservador) e as 13 datas da continental em que o
     clube está nos grupos.
   - **Dia comum da rodada:** entre os dias preferidos da idade (sub-21: ter, qua, seg, qui, sex; sub-19: qui, qua,
     sex, ter, seg), o de menor custo `Σ por jogo (HUGE se algum dos dois clubes joga pelo time principal no dia +
     ADJ se joga na véspera ou no dia seguinte)` (`HUGE = 1000`, `ADJ = 1`); empate pela ordem de preferência.
   - **Jogo de um clube ocupado no dia comum:** vai para o dia de meio de semana (seg–sex) mais próximo da mesma
     semana em que nenhum dos dois clubes joga pelo time principal; sem ele, qualquer dia livre dos dois até 6 dias
     depois do dia comum e antes da rodada seguinte; sem nenhum, fica no dia comum e o adiamento do dia (abaixo)
     decide. A mesma rodada pode ter jogos em dias diferentes; o `date-index` liga cada data à rodada.
   - Determinístico (nenhum sorteio nas datas).
5. **Gravação:** como `writeCup` + `standings.json` zerado (`computeStandings` com as linhas de `meta.youth.teams`).

Os dias preferidos diferentes (sub-21 começa na terça, sub-19 na quinta) separam as duas competições de um mesmo
clube na maioria das semanas. Um jogador nunca joga as duas no mesmo dia (§4).

### Regeneração

`youthCompsToRegenerate(tier1States, youthYear)` (puro, molde de `countriesToRegenerate`): regenera o país quando
a liga de nível 1 já está num ano maior que o da competição. Roda no mesmo gatilho das copas
(`due.units.length > 0 || due.resync.length > 0`), **depois** do bloco das continentais (para enxergar as datas da
continental nova quando ela já existir). Antes de regenerar: grava um `SeasonArchive` (mesmo formato de liga, com a
tabela final e um título para o campeão, `playerLogs: {}`) com `writeLeagueSeasonArchive`. O campeão é o 1º da tabela
na regeneração (gravado em `meta.youth.championId` antes de arquivar). Título de base não entra em histórico de
jogador, de clube nem no ranking de técnicos.

**Lacuna conhecida:** um país europeu vira antes de a Europa regenerar a Champions/Europa League, então a base nova
não conhece as datas continentais da temporada nova; o adiamento do dia (§3) cobre esses choques.

## 3. O dia (`playYouthDay`, chamado pelo `advanceDay`)

Depois do laço de partidas do time principal (o dia já sabe `teamsPlayingToday`) e **antes** do laço de
treino/descanso.

1. `getYouthFixturesForDate(currentDate)`, sem os jogados.
2. **Adiamento:** um jogo em que um dos clubes joga pelo time principal hoje (`teamsPlayingToday`) vai para o
   próximo dia (até `MAX_POSTPONE_DAYS = 14` e antes do fim da competição) em que nenhum dos dois clubes tem jogo do
   time principal nem outro jogo de base da mesma competição (lendo os `date-index` da liga, da copa do país e da
   continental do clube). A rodada é regravada com a data nova e `postponedFrom`; o `date-index` ganha a data. Sem
   dia: **cancelado** (`played: true`, `result: null`, `cancelled: true`), fora da tabela. Na prática só a lacuna
   continental de §2 gera adiamentos; o smoke conta adiamentos e cancelamentos.
3. Ordem: todos os jogos do **sub-19** do dia, depois os do **sub-21**; quem jogou um jogo de base hoje não entra no
   segundo.
4. **Escalação** (§4) de cada lado a partir do squad atual (o de `squadWrites` se o clube já mudou hoje).
5. `quickSimMatch` com um "squad da partida" (o squad do clube com `players` = os 11 escolhidos, inclusive os
   gerados), papéis do 4-3-3, `pitchCondition` neutro (90), sem moral nem familiaridade, liga (sem mata-mata).
6. **Pós-jogo da base** (`applyYouthMatch`, §5) nos jogadores reais; os gerados são descartados (só entram em
   `leaders` e no log).
7. Squads alterados vão para `squadWrites` (o laço de treino passa a ler de lá, §6). As rodadas, a tabela
   (`computeStandings` sobre todas as rodadas da competição) e `meta.youth.leaders` são gravados uma vez por
   competição jogada no dia.
8. `youthMatches` do log do dia; `youthParticipants` (ids reais que jogaram) volta para o `advanceDay`.
9. Convocações do clube do jogador da idade jogada (ou cancelada) são consumidas: `meta.youthCallUps[age] = []`.

## 4. Escalação

Formação fixa 4-3-3 (`slotRoles`), linhas necessárias GK 1, DEF 4, MID 3, FWD 3. Pura em
`src/Domain/youthComps/youthLineup.ts`.

### Quem pode jogar

- Sempre fora: indisponível (`isUnavailable`: lesionado ou suspenso no time principal), emprestado **a outro**
  clube (não está no elenco), quem já jogou um jogo de base hoje.
- Fora, salvo convocação: fôlego < `MIN_FITNESS` (60) e os **titulares do time principal**: IA = o XI de
  `autoLineupForFormation(squad, formação da temporada da IA ou 4-3-3, data)`; clube do jogador = `tactics.lineup`
  (XI automático se vazio).
- **"Sem minutos"** (reserva acima da idade, só no sub-21): `seasonLog.appearances ≤ NO_MINUTES_SHARE (0,4) ×` o maior
  número de jogos de um jogador do elenco na temporada (aproximação dos jogos do clube). No começo da temporada
  (máximo 0) todo não titular conta como sem minutos.

### Prioridade (por linha, até completar a linha)

| | Sub-19 | Sub-21 |
|---|---|---|
| 1 | Convocados do clube do jogador (≤ 19) | Convocados do clube do jogador (qualquer idade) |
| 2 | Base (`squad.youth`) ≤ 19 | Elenco ≤ 21 não titular |
| 3 | Elenco ≤ 19 não titular | Base 20–21, depois base ≤ 19 que não jogou o sub-19 hoje |
| 4 | Gerados | Reservas > 21 sem minutos, no máximo `OVERAGE_MAX = 5` |
| 5 | — | Gerados |

Dentro de um grupo: menos jogos na temporada primeiro, depois maior nota na posição natural, depois id. A
convocação é a prioridade 1, mas cada convocado ainda ocupa só uma vaga da própria linha (`MainRole`); até 11
convocados por idade, e os que sobram numa linha cheia ficam de fora (a tela avisa quando um convocado não jogou).
Escolhidos os 11, `autoFillLineup` distribui pelas vagas do 4-3-3.

### Jovens gerados (IA e também o clube do jogador, se faltar gente numa linha)

`youthFillers(seed, squad, age, line, n)` — mesma receita de `generateIntake` (nível = média da linha do elenco −
`YOUTH.LEVEL_OFFSET` + bônus de tier, ruído determinístico, `statsFor`, nome do próprio elenco, nacionalidade do
clube), idade 16–19 (sub-19) ou 17–21 (sub-21). **Desvio de detalhe (ponto 1, decidido):** a semente é
`${saveId}:${squadId}:${slug}:${ano}:${linha}:${i}` — uma "turma" estável por clube, competição e temporada
(`FILLER_POOL` GK 2, DEF 5, MID 4, FWD 3), da qual cada rodada toma os primeiros que faltam. Com a semente por rodada
(texto do desenho), cada rodada teria jogadores novos e a artilharia ficaria cheia de nomes de um jogo só. Ids
`ygen_<squadId>_<slug>_<ano>_<linha>_<i>`. Nunca gravados no elenco; só em `meta.youth.leaders` (com `generated`) e
no log do dia.

## 5. Pós-jogo da base (`applyYouthMatch`)

Para cada jogador real que jogou (nos dois lados, em `players` ou `youth` do squad):

- `seasonLog.youthCup`: `appearances + 1`, gols, assistências, `ratingSum + nota`. Nada nos totais.
- **Fôlego e carga:** `applyMatchFitness(log, { idade, stamina, recoveryMult do staff × CT }, { endEnergy, minutes:
  90 })` — os mesmos efeitos de uma partida (a carga sobe 90; quem joga a base na quarta chega mais cansado ao
  sábado, de propósito).
- **DP:** `applyDevelopment(p, nota, dpWeightsFor(p), devMult × matchDevMult × rebornDpMult × personalDpMult ×
  YOUTH_COMP.DP_MULT, professionalismDecayMult, areaMultsOf(squad))`. `DP_MULT` começa em **0,6** (jogo de nível
  mais baixo) e é medido (§9). O declínio por idade não muda (ele já é anual).
- **Lesões:** as do quickSim, com `injuryReturnDate` e os multiplicadores do médico e da fisioterapia como no
  pós-jogo normal; lesão de jogador do clube do jogador vai para a inbox `injury` (afeta o time principal).
- **Cartões:** ignorados (`recording.cards` descartado). Nem `seasonLog.yellowCards`, nem suspensão, nem cumprimento:
  a base não cumpre a suspensão do time principal e não gera suspensão própria.
- **Cura:** `clearHealed` antes (como no pós-jogo).
- Quem não jogou: nada aqui (treina ou descansa no laço do dia).
- Moral (clube do jogador, só `players`): o minuto entra em `moraleLog.youthMinutes` (§7).

`leaders`: soma por jogador (reais e gerados). "Quem se destacou" da partida: artilheiros e a maior nota.

## 6. Treino do dia e a base

- O laço de treino/descanso do `advanceDay` lê o squad de `squadWrites` quando existe (hoje relê do disco e
  apagaria o pós-jogo da base) e recebe `skipPlayerIds = youthParticipants`: quem jogou a base hoje não treina nem
  descansa (já teve o dia de jogo).
- **Recuperação da base (`squad.youth`):** os jovens da base nunca passavam pelo laço diário (só pela virada). Com
  jogos, o fôlego deles cairia e não voltaria. `buildTrainingEvent` e `buildRestEvent` passam a aplicar `recoverDay`
  (curva de descanso, sem DP de treino) aos jovens da base com `seasonLog` e que não jogaram hoje.

## 7. Moral (clube do jogador)

- `PlayerMoraleLog.youthMinutes` guarda os minutos dos últimos 5 jogos de base de quem está em `players`.
- Na segunda, `minutesDelta` para os papéis `youth`, `backup` e `rotation`: com `p` = jogos completos do time
  principal na janela e `y` = jogos completos de base em `youthMinutes` (escalados para a janela de 5), o delta é
  `min(0, delta(p + MORALE_YOUTH_WEIGHT (0,5) × y))` quando `delta(p) < 0`; senão o de hoje. A base só reduz a perda
  por falta de minutos, nunca dá o bônus de "jogou acima do esperado". `key`/`starter` não mudam. Sem jogo novo do
  time principal na semana (`newMatches`) nada muda, como hoje.
- Os jovens da base (`squad.youth`) não têm moral (`morale.md`): sem efeito.
- A IA não tem moral.

## 8. Criação da carreira, kits e troca de clube

- `createSave`: gera os torneios de base **depois** das copas e das continentais (precisa das datas delas), cada
  país com o próprio try/catch (`logError("youthComps", …)`).
- **Start kits:** `buildKitWorld` inclui as pastas de base (como as copas). Os kits precisam ser **regenerados** (a
  pré-simulação de agosto a fevereiro joga as rodadas de base das ligas europeias; sem isso uma carreira com kit
  nasceria com ~25 rodadas de base no passado sem jogar). Ponto 2, decidido: regenerar.
- **Sem kit / kit antigo (rede de segurança):** `ensureYouthCompetitions(saveId, currentDate)` depois de
  `applyRandomStartKit` (rota `presimulate`): uma competição que falta é criada, e uma com jogo não jogado datado antes
  de `currentDate` é regerada com a janela começando amanhã (compressão de §2.4).
- Troca de clube / demissão (`jobWorld`): `meta.youthCallUps` some.

## 9. Medições obrigatórias

1. **Custo do avanço do dia** (`bun scripts/bench-advance-day.ts --days 14 --buffered`, carreira da Premier):
   antes (Tarefa 0, na `main`) e depois. Meta: dia sem jogo do usuário **≤ +10%**; dia com jogo do usuário ≤ +10%.
   Esperado: ~170 jogos de base por dia no mundo (60 países × 2 × ~10 jogos ÷ 7), quickSim ~0,04 ms cada; o custo
   vem das gravações (rodadas, tabela e meta de ~20–40 competições no dia) e da escalação da IA.
2. **Evolução** (`bun scripts/youth-comp-measure.ts`): ritmo de evolução de um jovem da base (17 anos) e de um
   reserva (23 anos) numa temporada com e sem os jogos de base (todos os jogos, nota ~N(6,4; 0,6), as funções reais
   de DP). Aceite: o jovem que joga ganha **+0,10 a +0,30** na média dos 13 atributos a mais que o que não joga; o
   reserva, no máximo o que ganharia jogando 1/3 dos jogos oficiais do time principal. Ajustar `DP_MULT` até caber e
   registrar a tabela em `.claude/rules/game/youth-competitions.md`.
   **Medido (2026-10-09, mesma máquina, carreira da Premier sem kit, `--buffered`, médias por dia em ms):**

   | Janela | Caso | `main` (f1c83cbc) | branch | Δ |
   |---|---|---|---|---|
   | 14 dias × 3 | dia sem jogo do usuário | 1777 (1795 / 1775 / 1760) | 1889 (1881 / 1903 / 1884) | +6,3% |
   | 14 dias × 3 | dia de rodada do usuário | 9559 | 9634 | +0,8% |
   | 28 dias × 1 | dia sem jogo do usuário | 1663 | 1823 | +9,6% |
   | 28 dias × 1 | dia de rodada do usuário | 8654 | 8532 | −1,4% (ruído) |

   Os jogos de base só começam na 2ª semana (janela = início da liga + 7). Num dia cheio de base (~290 jogos no mundo,
   terça do sub-21 / quinta do sub-19) o dia custa +450–700 ms (+28% a +46%); o resto da semana quase nada. Otimizado
   antes de medir: XI do time principal da IA calculado só quando um candidato precisa e memoizado por conteúdo,
   `statsFor` memoizado (jovens gerados), o que levou `playYouthDay` de ~3,6 para ~1,6 ms por jogo. O que sobra é
   leitura das 38 rodadas de cada competição jogada no dia (tabela recalculada inteira) e a escalação.
   **Evolução — medido:** ver `.claude/rules/game/youth-competitions.md` → "Medições" (`DP_MULT` 1,0 até 21 anos,
   `DP_MULT_OVERAGE` 0,18 acima; um fator único não cumpre as duas metas).
3. **Volume do mundo:** jogos de base por temporada, adiamentos e cancelamentos (`season-rollover-smoke`). Meta:
   cancelamentos < 1% dos jogos.

## 10. Telas

- **Ligas → aba "Base"** (ao lado de Copa e Continental; só com o país tendo torneios de base): seletor
  `SegmentedTabs` compacto "Sub-21 / Sub-19"; tabela no padrão de `TABLE_STYLE` (a linha do clube do jogador
  destacada); resultados por rodada (data, placar, "adiado", "cancelado"); "Destaques": top 10 artilheiros e top 10
  notas (mínimo 3 jogos), jogadores reais com link para a ficha, gerados sem link. Rota
  `GET /api/saves/:id/youth-comps/:slug`.
- **Painel (Semana):** os jogos de base do clube aparecem no dia, com o selo "Base sub-21/sub-19", o adversário e o
  resultado. Vêm de `season.youthCalendar` (separado de `season.calendar`, que dirige o dia de jogo, o Continuar e a
  prévia — um jogo de base nunca vira "dia de jogo").
- **Ficha do jogador:** no bloco da temporada, a linha "Base" (J, G, A, nota) quando `seasonLog.youthCup` existe.
  **Elenco → Base:** colunas J e G de base na `YouthTable`.
- **Convocação:** bloco "Jogos da base" na aba Base do Elenco (só o clube do jogador): o próximo jogo de cada
  competição (data, adversário) e chips dos jogadores elegíveis (elenco + base) para marcar até 11 por idade; aviso de
  convocado que não jogou. Rotas `GET`/`PUT /api/saves/:id/youth-callups`.
- i18n `youthComps.*` (en, pt-BR). `bun run ui:audit` limpo.

## 11. Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/youth-comps?country=<país>` | `{ u21: slug \| null, u19: slug \| null }` do país (pelo `leagueData`) |
| `GET /api/saves/:id/youth-comps/:slug` | `{ meta, fixtures, standings, names, leaders }`; 400 slug que não é de base; 404 sem a competição |
| `GET /api/saves/:id/youth-callups` | `{ next: { u21?, u19? }, callUps, eligible: { u21: [...], u19: [...] } }`; 409 `noClub` |
| `PUT /api/saves/:id/youth-callups { u21?: string[], u19?: string[] }` | Grava; 400 `invalidPlayers` (fora do elenco/base, repetido, mais de 11, idade > 19 no sub-19); 409 `noClub`; `withSaveLock` |

Todas com `requireSaveOwner`.

## 12. Smoke (`scripts/season-rollover-smoke.ts`, seção "Base")

- Na criação: um sub-21 e um sub-19 para todo país com liga de nível 1 ativa de ≥ 2 clubes, cada um com
  `2 × (n − 1)` rodadas (ou `n − 1` quando comprimido) e `n` linhas na tabela.
- Todo dia: nenhum jogo de base não jogado com data anterior a `currentDate` (cancelado conta como jogado); nenhum
  clube com jogo de base no mesmo dia de um jogo do time principal (lendo todas as pastas).
- Jogadores do clube do jogador aparecem em `youthMatches.players` ao longo da temporada; pelo menos um tem
  `seasonLog.youthCup.appearances > 0`; nenhum jogador do mundo com `youthCup` maior que os jogos de base do clube.
- Tabela coerente: soma de V = soma de D, pontos = 3V + E, jogos = jogos jogados da competição; a tabela gravada é
  igual à recalculada.
- Uma convocação pela rota faz o convocado jogar o próximo jogo de base do clube (se disponível) e some depois.
- Na virada do país do jogador: o sub-21 e o sub-19 têm o ano novo, a temporada antiga arquivada com 1 título, e
  nenhum jogo da temporada nova antes da data da virada.
- Informativo: jogos de base, adiamentos e cancelamentos da corrida (falha se cancelamentos ≥ 1%).

## 13. Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/youthCompTypes.ts` | Tipos (§1) |
| `src/Domain/youthComps/youthCompConfig.ts` | Constantes (`YOUTH_COMP`) |
| `src/Domain/youthComps/youthCompIds.ts` (+ teste) | Slugs |
| `src/Domain/youthComps/youthSchedule.ts` (+ teste) | `roundRobinPairings`, `scheduleYouthSeason` |
| `src/Domain/youthComps/generateYouthComp.ts` (+ teste) | Meta + rodadas + date-index; `youthCompsToRegenerate`; arquivo |
| `src/Domain/youthComps/youthLineup.ts` (+ teste) | Elegibilidade, prioridade, gerados, escalação |
| `src/Domain/youthComps/youthMatch.ts` (+ teste) | `applyYouthMatch`, `updateLeaders`, `youthMatchLog`, adiamento puro |
| `src/Domain/youth/youth.ts` | Exporta `statsFor` e o helper de um jovem gerado (reuso, sem mudar a safra) |
| `src/backend/youthCompWorld.ts` (+ teste) | E/S: criar, regenerar, garantir, `playYouthDay` |
| `src/backend/youthCompRoutes.ts` (+ teste) | Rotas |
| `src/backend/SaveService.ts`, `advanceDay.ts`, `saves.ts`, `startKits.ts`, `jobWorld.ts`, `moraleWorld.ts` | Integração |
| `src/Domain/advanceDay/dailyTraining.ts`, `dailyRest.ts` | `skipPlayerIds`, recuperação da base |
| `src/Domain/morale/morale.ts` | `youthMinutes` |
| `src/GameInterface/LeagueTableScreen.tsx`, `Components/YouthCompView.tsx`, `Dashboard/WeekCalendar.tsx`, `PlayerScreen.tsx`, `Components/YouthTable.tsx`, `Squad/YouthCallUpsPanel.tsx` | Telas |
| `scripts/youth-comp-measure.ts`, `scripts/season-rollover-smoke.ts` | Medição e smoke |

## Pontos decididos (2026-10-09)

Os cinco pontos abertos foram aceitos pelo usuário como estavam propostos:

1. **Decidido:** jovens gerados por clube, competição e temporada (uma turma estável; cada rodada usa os primeiros que
   faltam), não por rodada. Nada é gravado no elenco.
2. **Decidido:** os start kits são regenerados no fim da etapa (Task 13), com a rede de segurança de §8 para kits
   antigos.
3. **Decidido:** datas continentais da temporada nova cobertas pelo adiamento do dia; cancelamento só sem dia livre em
   14 dias, com o limite de 1% dos jogos conferido no smoke.
4. **Decidido:** a base (`squad.youth`) não tem moral; o DP de partida da base fica por cima do treino anual e é
   controlado por `DP_MULT`, medido (§9.2).
5. **Decidido:** cartões da base são ignorados (nem suspensão, nem `seasonLog`).

Texto original dos pontos:

1. **Jovens gerados por temporada, não por rodada.** O desenho diz "determinístico pelo save/clube/rodada"; a spec
   usa uma turma estável por clube, competição e temporada (cada rodada usa os primeiros que faltam), para a
   artilharia e as notas terem sentido. Nada é gravado no elenco nos dois casos. Se o usuário preferir por rodada,
   troca-se só a semente e os gerados saem dos destaques.
2. **Regenerar os start kits.** Sem kits novos, a rede de segurança (§8) regera as competições a partir da data de
   início da carreira, com menos semanas (compressão: 2 rodadas por semana ou só o turno). Com kits novos (~29 MB de
   LFS por regeneração), as europeias chegam com as rodadas de agosto a fevereiro jogadas. O plano regenera os kits.
3. **Datas continentais da temporada nova** desconhecidas na virada de um país europeu: coberto pelo adiamento do dia;
   cancelamento só sem nenhum dia livre em 14 dias (medido no smoke).
4. **Base (`squad.youth`) sem moral** e com DP de partida por cima do treino anual da base (`developYouthSeason`): o
   ritmo da base sobe para quem joga; controlado por `DP_MULT` (§9.2).
5. **Cartões ignorados** (decisão "nada"): um jogador expulso na base não sofre nada.
