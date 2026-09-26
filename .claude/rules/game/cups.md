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
   junta o `date-index` de toda liga do país). Se a quarta-feira mais próxima do alvo não serve,
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

## Fica para o Plano 3

- Tela `/cups/:country`.
- `useAdvanceDay`/`advance-until`/`match-setup`/prévia enxergando o jogo de copa do jogador (e a
  partida ao vivo com `knockout`/`neutral` — UI de prorrogação/pênaltis).
- `competitionName` (`.claude/rules/ui-world.md`) com os nomes das copas.
- Inbox `cup` (sorteio, eliminação, título) — usando o retorno de `advanceCupStages`
  (`cupChanges`, hoje descartado em `advanceDay.ts` com `void cupChanges`).
- `seasonLog` por competição (hoje o `playerLogs` do `SeasonArchive` de liga não separa copa).
- i18n dos nomes/textos de copa.
