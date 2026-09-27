# Copas nacionais

## Regra

- Cada país do `leagueData` ganha uma copa nacional de mata-mata, gerada com a carreira e depois
  regenerada a cada temporada.
- A copa mora em `saves/{id}/leagues/cup_<país>/`, com os mesmos arquivos de uma liga (`meta.json`,
  `rounds/{n}.json`, `date-index.json`) — **sem** `standings.json` (mata-mata não tem tabela). O
  avanço do dia já encontra os jogos dela pelo `date-index`, do mesmo jeito que uma liga.
- A copa **nunca entra em `meta.activeLeagues`**: as regras de fim de temporada e virada de país
  (`.claude/rules/game/membership.md`) continuam só para ligas. A copa tem seu próprio ciclo de
  vida, movido pelo país (`countriesToRegenerate`, ver "Virada" abaixo).
- Toda a lógica de copa é pura, em `src/Domain/cups/`. `src/backend/cupWorld.ts` é a única camada
  de E/S (lê o índice de squads, grava meta/rodadas/date-index).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/Domain/cups/cupIds.ts` | `cupSlugOf(país)` → `cup_<país>` (sem acento, minúsculo); `isCupSlug`; `seedFrom` (hash FNV-1a determinístico, semente do `mulberry32`) |
| `src/Domain/cups/cupStructure.ts` | `planStages(n)` → fases (F = ceil(log2 n)), preliminar quando `n` não é potência de 2 |
| `src/Domain/cups/cupDates.ts` | `scheduleStageDates` — datas das fases dentro da janela do país |
| `src/Domain/cups/cupDraw.ts` | `drawTies` — sorteio dos confrontos, mando do clube de nível mais baixo |
| `src/Domain/cups/generateCup.ts` | `generateCup` → meta + rodadas + date-index de uma copa nova; `stageFixtures` |
| `src/Domain/cups/cupProgress.ts` | `fixtureWinner`, `stageComplete`, `drawNextStage`, `cupChampion` |
| `src/Domain/cups/cupRollover.ts` | `countriesToRegenerate`, `buildCupArchive` |
| `src/backend/cupWorld.ts` | E/S: clubes do país (`countryClubs`), gerar+gravar (`createCountryCup`, `writeCup`), avançar fases (`advanceCupStages`) |
| `src/backend/SaveService.ts` | `createSave` gera uma copa por país; `listCompetitionSlugs` lista toda pasta de `leagues/` (ligas e copas) |
| `src/backend/advanceDay.ts` | joga fixtures de copa, sorteia a fase seguinte, coroa o campeão, arquiva e regenera na virada do país |
| `src/backend/startKits.ts` | kits guardam as pastas de copa |

## Tipos (`src/types/calendarTypes.ts`)

```ts
interface Fixture {
  // ...
  knockout?: true;   // mata-mata: empate em 90' vai para prorrogação + pênaltis
  neutral?:  true;    // campo neutro (a final): sem mando de campo
  decider?:  MatchDecider;   // só mata-mata: gols de prorrogação + pênaltis, ausente se decidiu em 90'
}

interface MatchDecider {
  extraTime: { home: number; away: number };
  penalties?: { home: number; away: number };
}

type CupStageName = "preliminary" | "r128" | "r64" | "r32" | "r16" | "qf" | "sf" | "final";

interface CupStage {
  round:    number;         // = o arquivo RoundFixtures dessa fase
  name:     CupStageName;
  date:     string;
  entrants: string[];       // vazio antes do sorteio
  drawn:    boolean;
}

interface CupMetaData {
  country:    string;                  // igual ao `country` do leagueData
  stages:     CupStage[];
  byes:       string[];                // clubes que pulam a preliminar (vazio se não há preliminar)
  tiers:      Record<string, number>;  // nível de cada clube na geração (1 = topo) — decide o mando
  championId: string | null;
}

interface LeagueSeasonMeta {
  // ...
  kind?: "cup";   // ausente para liga
  cup?:  CupMetaData;
}
```

`Fixture.knockout`/`neutral`/`decider` são genéricos (não exclusivos de copa) — o motor de
mata-mata em si (prorrogação, pênaltis) é do Plano 1, já mesclado na branch. Ver `quickSimMatch`
(`src/Domain/advanceDay/quickSim.ts`) e `simulateMatch(..., { knockout })` para a implementação.

## Geração (`generateCup`, chamada por `createCountryCup`)

1. **Entrantes:** todo clube do país, membership pelo índice de squads do save (não pelo
   `leagueData.standings`, igual a tudo mais — ver `membership.md`). Tier de cada clube vem da
   pirâmide do país (`tierOfLeague`); país sem pirâmide usa tier 1 para todo mundo.
2. **Fases (`planStages`):** F = `ceil(log2 n)` fases. Se `n` já é potência de 2, direto da fase 1
   (2^(F−1) clubes) até a final. Senão, fase 1 é uma **preliminar** com
   `2 × (n − 2^(F−1))` clubes — os de nível mais baixo — e o restante entra como **bye** direto na
   fase 2. `n < 2` não gera copa (`createCountryCup` devolve `null`); `n > 256` lança (o nome da
   fase colapsa além de `r128`).
3. **Datas (`scheduleStageDates`):** uma fase por quarta-feira dentro de `[start, end − 7 dias]`
   (a final fica pelo menos uma semana antes do fim da janela), espaçadas uniformemente, nunca no
   mesmo dia (nem na véspera) de um jogo de liga do país (`busyDates`, de `leagueBusyDates` —
   junta o `date-index` de toda liga do país **e de toda competição continental
   (`ucl`/`uel`/`lib`/`sud`) que já tenha algum clube do país**, `continentalSlugsOf` em
   `cupWorld.ts` — mitiga a copa cair em cima de uma data de Champions/Europa League/Libertadores/
   Sul-Americana do mesmo clube; ver `.claude/rules/game/continental.md`). Se a quarta-feira mais próxima do alvo não serve,
   tenta outras quartas (`OFFSETS`, ±1 a ±3 semanas) e depois qualquer dia perto do alvo, sempre
   com pelo menos 3 dias da fase anterior.
   - **Clamp de janela degenerada:** se a janela ficar curta demais para até a regra de "1 dia de
     folga" (ex.: país com poucos clubes numa janela apertada, ou muitas fases), o algoritmo relaxa
     tudo e empacota as fases que faltam 1 dia por vez, terminando exatamente em `hi`
     (`end − 7 dias`), recuando fases já colocadas se precisar de mais espaço. Sempre estritamente
     crescente e nunca depois de `hi` — o preço é que fases mais cedo também são empurradas.
4. **Sorteio da fase 1 (`drawTies`):** Fisher–Yates com `mulberry32(seedFrom(seedKey))`,
   `seedKey = "{saveId}:{ano}:{país}:1"` — determinístico por save/ano/país/fase. Manda quem tem o
   nível mais baixo (tier maior); nível igual decide por sorteio. A final (`neutral: true` em toda
   fixture) nunca é sorteada com mando — ver `evaluate_shot`/motor: campo neutro tira a vantagem de
   casa em `expectedGoals`.
5. Só a fase 1 é sorteada na geração; as demais ficam com `entrants: []`, `drawn: false`.

## Andamento (`advanceCupStages`, chamada no fim do dia)

Para cada copa com alguma rodada jogada hoje (`playedRounds` vem de `roundUpdates` do
`advanceDay.ts`), em ordem de rodada:

1. **Fase completa (`stageComplete`):** toda fixture jogada e com vencedor
   (`fixtureWinner` — placar, senão pênaltis). Uma fixture jogada empatada sem pênaltis decisivos é
   logada como erro (`logError("cups", ...)`) — não deveria acontecer, o motor de mata-mata sempre
   resolve o empate antes de marcar `played`.
2. **Sorteia a próxima fase (`drawNextStage`):** vencedores da rodada + byes (só na fase 1) viram
   os entrantes da próxima fase, sorteados com a mesma semente por fase
   (`seedKey:{próxima rodada}`). Grava a fase sorteada na meta e o novo arquivo de rodada.
3. **Final jogada → campeão (`cupChampion`):** grava `cup.championId` na meta.

## Modo de simulação

Regra em `advanceDay.ts` (`Cup ties run in the full engine only when a club of the player's league
is involved`): uma fixture de copa roda no **motor completo** só quando um dos dois clubes está na
**liga do jogador** (`index.inLeague(meta.leagueSlug)`) — não precisa ser o clube do jogador em si,
qualquer clube da mesma liga já basta. Todo o resto (a maioria esmagadora dos ~40 jogos de uma fase
inicial tipo a FA Cup) usa o quickSim. Essa é a **divergência consciente da spec** (que pedia a
copa inteira do país do jogador no motor completo): ~40 jogos no motor completo daria ~30 s num
único avanço de dia.

O clube do próprio jogador sempre joga no motor completo (`userPlays`), como qualquer jogo de liga
dele.

## Recusa de gravação de mata-mata indecisa

Uma partida do jogador registrada pelo front (`playedMatchOverride`) para uma fixture `knockout`
que termina empatada **sem pênaltis decisivos** é rejeitada: `advanceDay` devolve
`{ ok: false, status: 400, error: "knockout recording without a winner" }` antes de gravar
qualquer coisa. Mata-mata sempre precisa de um vencedor; o motor ao vivo já resolve
prorrogação/pênaltis antes de mandar o placar final, então isso só pegaria uma gravação
inconsistente (bug no cliente ou replay manual malformado).

## Virada (arquivo + regeneração)

A copa não tem "fim de temporada" próprio — ela é arquivada e regenerada quando **todas as ligas do país** já
rolaram para o ano seguinte, não quando ela mesma termina:

- `countriesToRegenerate(leagues, cupYear)` (`cupRollover.ts`): para cada país com copa
  (`cupYear[país]` conhecido), regenera quando **toda liga do país já está num ano maior** que o
  da copa atual. O ano da copa nova é o **menor** ano entre as ligas do país; a janela é
  `[menor start, maior end]` entre elas.
- Em `advanceDay.ts`, isso roda **sempre que algum país rolou ou foi resincronizado nesse dia**
  (`due.units.length > 0 || due.resync.length > 0`), não só num dia que efetivamente rodou o
  rollover do país — um dia de **resync** (rollover já aplicado em disco, só `activeLeagues`
  estava velho — `findDueRollovers` em `src/Domain/season/countryRollover.ts`) também tem que
  regenerar a copa, senão ela fica presa no ano antigo.
- Ao regenerar: `buildCupArchive(copaAntiga, nameOf)` grava um `SeasonArchive` (mesmo formato de
  liga — `writeLeagueSeasonArchive`, mesmo caminho por ano) com `standings: []` e **um único
  título** para `championId` (nenhum título se a copa não tinha campeão — não deveria acontecer, a
  janela sempre cabe a final antes do fim). Depois `createCountryCup` gera a copa nova, mesmo
  fluxo da criação da carreira.
- A copa de um país sem pirâmide (uma liga só) regenera junto da virada dessa liga.

## Start kits

`buildKitWorld` (`src/backend/startKits.ts`) inclui toda pasta de copa
(`listCompetitionSlugs(...).filter(isCupSlug)`) além das ligas de `meta.activeLeagues` — um kit
pré-simulado carrega as copas junto, com as fases de agosto a fevereiro já jogadas (mesma
pré-simulação dia a dia que já existe para as ligas europeias — ver
`.claude/rules/data/openfootball-import.md` → "Regra de calendário"). `applyKit` já gravava
meta/rodadas/date-index e pulava `standings.json` ausente, então não precisou mudar para copas
(que nunca têm standings).

## Smoke (`scripts/season-rollover-smoke.ts`)

Além das checagens de liga/pirâmide já existentes, o smoke roda, no fim da temporada:

1. `N` copas geradas na criação da carreira (uma por país do `leagueData`).
2. Toda pasta `cup_*` tem `meta.cup`; toda copa cujo ano avançou desde a criação (regenerada)
   arquivou a temporada anterior com **exatamente 1 título** (lido de volta pelo mesmo
   `readLeagueSeasonArchive` que as ligas usam, `saveId, cup_<país>, anoAntigo`).
3. Nenhuma fixture de copa datada antes do `currentDate` final está `played: false`.
4. Nenhum clube tem duas fixtures (liga + copa, qualquer competição) na mesma data — junta as
   fixtures de **toda** pasta de competição (`listCompetitionSlugs`) e conta por `(data, clube)`.
5. A copa da Inglaterra que terminou durante a corrida teve campeão (o arquivo tem 1 título).

Rodar: `bun scripts/season-rollover-smoke.ts` (~15 min, ~455 dias, Inglaterra e Itália rolam no
meio). O save é sempre apagado no fim, sucesso ou falha.

## Interface

O jogador enxerga e joga a copa do seu país sem nenhuma rota nova de tela — ela entra no
calendário e nas telas que já existiam para a liga. **Não existe** `/cups/:country`: o chaveamento
mora numa aba da tela de liga (ver abaixo), desvio consciente da spec original.

### Calendário do jogador inclui a copa

`GET /api/saves/:id` (`src/backend/saves.ts`) monta `season.calendar` juntando as fixtures da liga
do jogador com as fixtures de `playerCupSlug(meta.leagueSlug)` (`src/backend/cupWorld.ts` —
`país → cup_<país>` pelo `leagueData`) **filtradas pelo clube do jogador**, ordenado por data. Isso
é suficiente para que `useAdvanceDay`, `TopNavigation`, `ClubSidebar` e `WeekCalendar` mostrem o
jogo de copa sem nenhuma mudança própria — todos já leem `season.calendar`.

### Avanço rápido para no jogo de copa

`nextPlayerFixtureDate(service, saveId, competitions, clubId, fromDate)`
(`src/backend/advanceUntil.ts`) aceita uma lista de competições, não só uma liga.
`readAdvancePosition` passa `[meta.leagueSlug, cup]` (cup pode ser `null` se o país não tiver
copa), então `POST /api/saves/:id/advance-until` para tanto num jogo de liga quanto de copa do
clube do jogador — sem heurística nova, é a mesma varredura por `date-index` que já existia,
aplicada a duas pastas de competição.

### `match-setup` aceita a copa

`POST /api/match-setup` (`src/backend/routes.ts`) já escolhia a fixture do dia pelo `date-index`;
agora o filtro é `f.competition === save.leagueSlug || f.competition === cupSlug` (com `cupSlug =
await playerCupSlug(save.leagueSlug)`), então uma fixture de copa do jogador no dia atual monta a
partida normalmente — mesmo endpoint, mesma resposta (`fixture`, `myTactics`, etc.), sem campo
novo além do que a `Fixture` já carrega (`knockout`, `neutral`).

### Partida ao vivo em mata-mata

`MatchScreen.tsx` lê `data.fixture.knockout === true` e grava `knockout` no `GameState` retornado
por `createMatchState` — o motor de mata-mata (prorrogação, pênaltis) já existia do Plano 1; aqui
só passa a ser acionado de verdade quando a fixture do dia é de copa.

### Aba Copa na tela de ligas

`LeagueTableScreen.tsx` ganha uma quarta aba (`"table" | "fixtures" | "finances" | "cup"`), ao lado
das já existentes, no mesmo seletor de liga/país — não uma rota `/cups/:country` própria. A aba só
aparece quando o país da liga selecionada tem copa (`cupSlug = cupSlugOf(country)`); ao trocar de
liga, o estado da copa é resetado e a aba clicada mas sem copa (`!cupSlug`) volta para `"table"`.

Dados: `GET /api/saves/:id/cups/:cupSlug` (`src/backend/routes.ts`) devolve `{ meta, fixtures,
names }` — a meta da copa (fases, campeão), todas as fixtures da pasta, e um mapa `id → nome` dos
clubes envolvidos (participantes das fixtures + o campeão, se houver). 400 se o slug não é copa
(`isCupSlug`), 404 se a copa não existe nesse save (país sem copa nesta temporada — `cupMissing` no
front, mensagem `cups.none`).

`CupBracket.tsx` (`src/GameInterface/Components/`) renderiza fase por fase, da última para a
primeira: faixa do campeão (se houver), e por fase o cabeçalho com nome/data, "ainda não sorteada"
se `!stage.drawn`, senão a lista de confrontos com resultado (ou "vs" antes de jogar), prorrogação
(`decider` sem `pens`) ou pênaltis (`decider.penalties`), "campo neutro" (`neutral`), e a linha do
clube do jogador destacada.

### Prévia da partida

`MatchPreviewScreen.tsx` detecta `isCupSlug(fixture.competition)` e busca a mesma rota de copa só
para ler `meta.cup.stages` e mostrar o nome da fase (`cups.stage.<nome>`) em vez do nome da
competição sozinho. `fixture.neutral` troca o texto de mando por "campo neutro" (`cups.neutral`);
`fixture.knockout` mostra uma nota fixa (`cups.knockoutNote`, "mata-mata: prorrogação e pênaltis se
empatar").

### Resumo do dia

`DaySummaryModal.tsx` usa `isCupSlug(event.competition)` para rotular o jogo com o nome da
competição (`competitionName`) em vez do texto genérico de liga (`daySummary.cupMatch`).

### Inbox `cup`

Categoria nova em `InboxCategory` (`src/types/inboxTypes.ts`): `CupInboxMessage` com `kind: "draw"
| "eliminated" | "champion"`, `cupSlug`, `cupName`, `stage` (nome da fase), e para sorteio/
eliminação `opponentName` + (sorteio) `tieDate`/`venue`. Emitida em `advanceDay.ts` a partir de
duas fontes no mesmo dia:

- **Eliminação/título:** entre as fixtures de copa jogadas hoje pelo clube do jogador
  (`dayEvents`), lê o vencedor (`fixtureWinner`) e a fase pelo `round` — **nunca chuta "final"**
  quando a fase não é encontrada na meta (`stageNameOf` devolve `null` e o evento é pulado, ver o
  commit `fix(cups): skip inbox news for an unknown stage`). Vitória na final → `champion`; derrota
  em qualquer fase → `eliminated`.
- **Sorteio:** para cada `change` de `cupChanges` (retorno de `advanceCupStages`) com
  `drawnRound` definido, se o clube do jogador está na fase recém-sorteada → `draw`, com o
  adversário, a data e o mando (`neutral` na final).

Essas mensagens nunca colidem com o `clearInbox` da virada de temporada porque nenhum confronto de
copa cai no próprio dia da virada — toda janela de fase de copa termina pelo menos
`FINAL_BEFORE_END_DAYS` (7) dias antes do fim da janela da liga (`src/Domain/cups/cupDates.ts`).

`InboxScreen.tsx` renderiza cada `kind` com i18n próprio (`inbox.cup.champion/eliminated/draw`,
mais `inbox.cup.venue.<home|away|neutral>`), traduzindo `cupName` com `competitionName(cupSlug,
leagues, i18n.language)` (a mensagem guarda o nome em inglês só como fallback enquanto o catálogo
de ligas não carregou). A primeira fase da temporada (sorteada na criação do save ou na
regeneração da copa) não gera mensagem — ela só aparece no calendário; só sorteios feitos durante
o avanço de dia (`advanceCupStages`) viram inbox.

### `seasonLog.cup`

`PlayerSeasonLog.cup?: { appearances, goals, assists }` (`src/types/playerTypes.ts`) — só os jogos
de copa; os campos de fora (`appearances`, `goals`, `assists`, …) continuam sendo o total da
temporada (liga + copa). `finalizeSquadsAfterMatch`
(`src/Domain/advanceDay/matches.ts`) recebe `isCup = isCupSlug(fixture.competition)` e, quando
verdadeiro, também incrementa `log.cup` além dos campos normais.

### Nomes das copas

`competitionName(slug, leagues, lang)` (`src/Domain/world/labels.ts`, ver
`.claude/rules/ui-world.md`) reconhece `cup_<país>`: nome próprio para as 6 grandes ligas
(`CUP_NAMES` — Inglaterra "FA Cup", Brasil "Copa do Brasil", Espanha "Copa del Rey", Alemanha
"DFB-Pokal", Itália "Coppa Italia", França "Coupe de France"); para as demais, um nome genérico a
partir do `country` cru do `leagueData` (não do `Intl.DisplayNames`, para não divergir do nome
usado no resto da UI) — em inglês `"<País> Cup"`, em português `"Copa nacional (<país>)"` com o
país localizado por `Intl.DisplayNames` quando há `iso2`. Slug de copa desconhecido cai no
`titleCase` genérico, igual a qualquer slug fora do catálogo.
