# Competições continentais

## Regra

- Champions League, Europa League, Copa Libertadores e Copa Sul-Americana existem em **todo save**,
  geradas na criação da carreira e regeneradas por continente na virada de temporada.
- Cada competição mora em `saves/{id}/leagues/{ucl|uel|lib|sud}/`, com os mesmos arquivos de uma
  liga (`meta.json`, `rounds/{n}.json`, `date-index.json`) — **sem** `standings.json` (a tabela do
  grupo é calculada sob demanda, como a copa não tem tabela de mata-mata). O avanço do dia joga as
  fixtures pelo `date-index`, do mesmo jeito que uma liga ou uma copa.
- A competição **nunca entra em `meta.activeLeagues`**: as regras de fim de temporada e virada de
  país (`.claude/rules/game/membership.md`) continuam só para ligas. Cada continental tem seu
  próprio ciclo de vida, movido pelas ligas de nível 1 do continente (ver "Virada" abaixo).
- Toda a lógica é pura, em `src/Domain/continental/`. `src/backend/continentalWorld.ts` é a única
  camada de E/S (coeficientes, ranking, geração, avanço). Mesmo molde das copas nacionais
  (`src/Domain/cups/`, `src/backend/cupWorld.ts` — ver `.claude/rules/game/cups.md`).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types/calendarTypes.ts` | `ContinentalSlug`, `ContinentalStageName`, `ContinentalStage`, `ContinentalMetaData`; `LeagueSeasonMeta.kind` aceita `"continental"` |
| `src/Domain/continental/competitions.ts` | Catálogo das 4 competições (`CONTINENTAL`), `isContinentalSlug`, `competitionsOf(continente)` |
| `src/Domain/continental/slots.ts` | `allocateSlots` — vagas por país |
| `src/Domain/continental/qualify.ts` | `pickQualifiers` — quem pega as vagas |
| `src/Domain/continental/groupDraw.ts` | `drawGroups` — sorteio de grupos com potes e regra de país |
| `src/Domain/continental/groupTable.ts` | `groupTable` — tabela do grupo com confronto direto |
| `src/Domain/continental/continentalDates.ts` | `continentalDates` — as 13 datas de uma competição |
| `src/Domain/continental/generateContinental.ts` | `generateContinental` — meta + rodadas dos grupos + date-index de uma temporada nova |
| `src/Domain/continental/knockout.ts` | `drawRoundOf16`, `drawFree`, `twoLegFixtures`, `withAggregate`, `tieWinner`, `finalWinner` |
| `src/Domain/continental/continentalProgress.ts` | `advanceContinental` (avanço por rodada), `continentsToRegenerate`, `buildContinentalArchive` |
| `src/backend/continentalWorld.ts` | E/S: `clubLevel`, `topLeagueOf`, `createContinentalSeason`, `advanceContinentalStages`, `continentalTier1LeagueStates`, `logEuropeanCalendarClashes` (choque liga de ano civil × datas continentais) |
| `src/backend/SaveService.ts` | `createSave` gera as 4 competições depois das copas nacionais (falhas logadas com `logError("continental", …)`) |
| `src/backend/advanceDay.ts` | joga fixtures continentais, chaina o squad de um clube com dois jogos no mesmo dia (`squadWrites`, ver `.claude/rules/game/membership.md`), avança fases, arquiva e regenera por continente, auto-cura um continente sem competição alguma |
| `src/backend/startKits.ts` | kits guardam as pastas continentais junto com as de copa |
| `src/backend/cupWorld.ts` | `createCountryCup` também evita as datas continentais do país (`continentalSlugsOf`) |
| `scripts/season-rollover-smoke.ts` | seção "Continental competitions" |
| `src/backend/continentalWorld.clashes.test.ts` | `logEuropeanCalendarClashes` isolado |
| `src/backend/continentalWorld.selfHeal.test.ts` | continente sem `ucl`/`uel` nenhuma se recupera na próxima virada |
| `src/backend/advanceDay.doubleBooking.test.ts` | clube com duas fixtures no mesmo dia — squad chaina em vez de uma escrita apagar a outra |

## Tipos (`src/types/calendarTypes.ts`)

```ts
type ContinentalSlug = "ucl" | "uel" | "lib" | "sud";
type ContinentalStageName = "group" | "r16" | "qf" | "sf" | "final";

interface ContinentalStage {
  name:   ContinentalStageName;
  rounds: number[];   // arquivos RoundFixtures da fase (group: 6; r16/qf/sf: 2 — ida, volta; final: 1)
  dates:  string[];
  drawn:  boolean;
}

interface ContinentalMetaData {
  competition: ContinentalSlug;
  continent:   "Europe" | "South America";
  groups:      { name: string; clubs: string[] }[];  // A–H, 4 clubes, ordem de pote (pote 1 primeiro)
  stages:      ContinentalStage[];
  countryOf:   Record<string, string>;   // clube → país (leagueData), para o sorteio e a UI
  level:       Record<string, number>;   // força do clube (teamLevel) na geração — potes e "lado mais forte"
  championId:  string | null;
}

interface LeagueSeasonMeta {
  // ...
  kind?:        "cup" | "continental";
  continental?: ContinentalMetaData;
}
```

`Fixture.knockout`/`neutral`/`decider`/`aggregate`/`tieId`/`leg` (Plano 1, já na branch antes deste
plano) são genéricos — o mata-mata continental reaproveita exatamente o mesmo mecanismo de
prorrogação/pênaltis/agregado das copas nacionais. Ver `.claude/rules/game/cups.md` e
`.claude/rules/match-flow.md` → "Two-legged ties (`aggregate`)".

## Vagas por país (`slots.ts` → `allocateSlots`)

- **32 vagas por competição.** O coeficiente de um país é a média de `clubLevel` (força do XI
  4-3-3 automático, `teamLevel` do quickSim) dos clubes da sua liga de nível 1, calculada no
  momento da geração — não é um valor histórico acumulado.
- **Vagas de zona** (`leagueData` zones `ucl`/`uel`+`uecl`/`lib`/`sud` da liga de nível 1 do país):
  ficam fixas para quem as tem (as 5 grandes ligas europeias; Brasil e Argentina na América do
  Sul), limitadas ao número de clubes do país (uma vaga de zona que sobra clubes flui para os
  demais países pela ordem normal, nunca fica perdida).
- **Os demais países** entram por coeficiente (desc, desempate por nome):
  - **Europa, principal (UCL):** 1 vaga a cada um dos melhores países sem zona até completar 32.
  - **Europa, secundária (UEL):** 1 vaga primeiro a quem já tem uma vaga na principal, depois aos
    demais pela ordem; só depois de todos terem 1 é que alguém pode ganhar uma 2ª.
  - **América do Sul (Libertadores/Sul-Americana):** Argentina 6 (mesmo padrão fixo do Brasil,
    embora sem zona no `leagueData`); os demais 6 países pelo padrão `[4, 4, 3, 3, 3, 3]` na ordem
    do coeficiente.
- **Um país nunca recebe mais vagas (principal + secundária) do que clubes na sua liga de nível 1.**
  Uma sobra (vaga de zona que não coube, país pequeno demais para o padrão, país ausente) flui
  **para a frente** na ordem de coeficiente, nunca de volta para quem já foi atendido antes.

## Quem pega as vagas (`qualify.ts` → `pickQualifiers`)

- Liga de nível 1 do país, pela **posição na tabela final da temporada anterior** (arquivo da
  liga, `readLeagueSeasonArchive`); vagas da competição principal primeiro, depois as da
  secundária. Clube que saiu da liga (rebaixado) some da lista; clube novo (promovido) entra pela
  força (`clubLevel` desc), atrás de todo mundo que já tinha posição na tabela.
- **Primeira temporada de carreira** (sem arquivo ainda): ordem de força do elenco (`clubLevel`
  desc) dentro da liga.
- Um clube nunca está nas duas competições do mesmo continente ao mesmo tempo — `pickQualifiers`
  reparte as vagas primária/secundária sem sobreposição, e a checagem de smoke confirma que nenhum
  clube aparece em duas das 4 listas de 32.
- Se alguma competição não fechar em exatamente 32 clubes, `createContinentalSeason` lança
  (capturado pelo try/catch por continente em `createSave`, mas **não** capturado na virada — ver
  "Virada" abaixo).

## Sorteio dos grupos (`groupDraw.ts` → `drawGroups`)

- 4 potes de 8 clubes por `level` (desc, desempate por id); cada grupo recebe um clube de cada
  pote; nenhum grupo tem dois clubes do mesmo país.
- **Não é um backtracking pote-a-pote ingênuo.** Uma única busca (DFS orçada,
  `STRICT_NODE_BUDGET = 20 000` nós) percorre os 32 clubes na ordem dos potes, com **lookahead
  real**: uma escolha ruim no pote 0 que travaria o pote 2 é desfeita, em vez de o pote 0 se
  comprometer com o primeiro arranjo que parece bom isoladamente. Dentro de cada pote, o próximo
  clube a posicionar é o mais restrito primeiro (menos grupos ainda válidos), não simplesmente o
  próximo do sorteio — isso evita becos sem saída muito antes do orçamento provar que existe um
  sorteio sem choque.
- Se o orçamento estourar ou a busca provar que não há sorteio sem choque nenhum (composição de
  países que torna algum choque inevitável), cai para um caminho relaxado: ainda um clube de cada
  pote por grupo, mas minimizando choques de país pote a pote (branch-and-bound 8×8, custo 1 por
  choque) em vez de simplesmente ignorar a regra.
- Determinístico por `rng` (`mulberry32(seedFrom(seedKey))`, `seedKey = "{saveId}:{ano}:{slug}:groups"`).

## Tabela do grupo (`groupTable.ts`)

Pontos, saldo, gols pró e, entre os ainda empatados, confronto direto (pontos e depois saldo só
das partidas entre os clubes empatados), por fim id. `groupTable(clubes, fixtures)` é chamada sob
demanda (não fica persistida) tanto pelo avanço (para achar 1º/2º de cada grupo) quanto pela UI
futura do Plano 3.

## Datas (`continentalDates.ts`)

- **13 datas por competição:** 6 rodadas de grupo + oitavas (ida, volta) + quartas (ida, volta) +
  semi (ida, volta) + final (1 jogo) = 13.
- **Janelas:** Europa (temporada `Y`) — grupos `[Y-09-15, Y-12-15]`, mata-mata
  `[(Y+1)-02-10, min(fim-7 dias, (Y+1)-05-31)]`. América do Sul (ano civil `Y`) — grupos
  `[Y-03-01, Y-05-31]`, mata-mata `[Y-07-15, min(fim-7 dias, Y-11-30)]`. `fim` é a data de término
  mais tardia entre as ligas de nível 1 "que definem a temporada" do continente (ver "Virada"). O
  teto (`05-31`/`11-30`) existe porque, sem ele, uma liga sul-americana de ano civil terminando em
  novembro empurraria a janela de mata-mata europeia (ou o inverso) para muito além de maio/
  novembro.
- **Champions e Libertadores jogam às terças; Europa League e Sul-Americana às quintas.** A
  Libertadores **não** joga quarta (a data originalmente prevista pela spec) porque toda copa
  nacional do mundo joga numa quarta-feira fixa (`cupDates.ts`) — uma Libertadores de quarta
  colidiria, no mesmo dia, com a copa de qualquer país sul-americano nessa data exata, um choque
  impossível de evitar por otimização, não só difícil de agendar.
- **Ajuste consciente da spec (regra de datas):** "≥ 3 dias entre jogos do mesmo clube" tornaria
  impossível a terça depois do domingo de liga. A regra implementada: uma data continental é
  inválida se **algum clube participante** joga (liga ou copa) no dia anterior, no mesmo dia ou no
  dia seguinte — ou seja, sempre ≥ 2 dias entre jogos de um clube, como no futebol real. A regra
  dura de verdade (nunca violada, a não ser em janela degenerada) é o **mesmo dia**; o dia
  anterior/seguinte é um custo evitado quando possível, não uma proibição.
- **Otimizador (`scheduleOptimal`):** programação dinâmica exata sobre `k` datas dentro da janela,
  minimizando `HUGE·mesmo_dia + W_ADJ·dia_adjacente + W_WEEKDAY·(fora do dia da semana certo) +
  W_SPACING·distância do alvo igualmente espaçado + W_GAP·(dias faltando para o intervalo
  preferido de 6 dias)`, sujeito ao piso duro de `MIN_GAP_DAYS = 3` dias entre duas datas da mesma
  competição. `HUGE` domina tudo em 4-5 ordens de grandeza, então o otimizador só aceita um dia com
  choque de mesmo-dia quando **nenhuma** combinação de dias livres de choque satisfaz o piso de 3
  dias — janela real nunca cai nisso; só janelas contrivadas de teste. Sem solução alguma no piso
  de 3 dias (nunca observado com janelas reais), cai para um empacotamento gracioso
  (`fallbackPack`).
- **Participantes:** cada competição recebe **só os seus próprios 32 classificados** (não os do
  continente inteiro, nem a outra competição do mesmo continente) — um país sem clube na Europa
  League nunca influencia o calendário da Champions. Cada clube carrega o conjunto de datas
  exatas do seu país (liga de nível 1 + copa nacional, **incluindo toda fase da copa ainda não
  sorteada** — só a fase 1 da copa tem fixtures na geração, mas toda fase futura já tem data
  marcada em `meta.cup.stages[].date`), memoizado por país (`leagueBusyDates`) para não repetir a
  leitura por clube.

## Geração de uma temporada (`createContinentalSeason`)

1. Lista os países do continente (catálogo mundial + `leagueData`); para cada um, sua liga de
   nível 1 (`topLeagueOf` — topo da pirâmide, ou a única liga do país sem pirâmide), os clubes
   dessa liga, o `clubLevel` de cada um e o coeficiente do país (média).
2. `allocateSlots` → `pickQualifiers` (ranking = arquivo da temporada anterior, ou força na
   primeira temporada) → os dois conjuntos de 32 (principal + secundária). Lança se algum não
   fechar em 32.
3. `fim` da janela = data de término mais tardia entre as ligas "que definem a temporada" (ver
   "Virada"). Datas de cada clube (`leagueBusyDates` por país) alimentam `continentalDates` — uma
   chamada por competição (weekday diferente, participantes diferentes).
4. `generateContinental` (grupos + 6 rodadas de grupo escritas; 7 rodadas de mata-mata vazias,
   sorteadas depois) para cada competição; grava com o mesmo esquema de `writeCup`
   (`writeLeagueMeta` + `writeRound` por rodada + `writeDateIndex`).
5. `createSave` chama isso duas vezes (Europa, América do Sul) depois das copas nacionais, cada
   continente com seu próprio try/catch (loga o continente e segue — uma carreira nova não pode
   travar por causa de uma competição continental, mas o try/catch da virada é fail-fast, ver
   abaixo).

## Andamento (`advanceContinental`, chamado por `advanceContinentalStages`)

Uma chamada por rodada jogada hoje, em ordem crescente de rodada, com todas as rodadas da
competição pré-carregadas (13 arquivos pequenos — mais simples que decidir qual carregar por
fase):

1. **Última rodada de grupo completa** → tabela de cada grupo (`groupTable`) → 1º e 2º avançam,
   3º e 4º saem → sorteio das oitavas (`drawRoundOf16`: 1º de outro grupo, nunca mesmo grupo nem
   mesmo país quando dá; o 1º manda a volta) → grava as 2 rodadas da fase.
2. **Ida de uma fase de mata-mata completa** → grava `aggregate` na volta correspondente
   (`withAggregate`, por `tieId`).
3. **Volta de uma fase completa** → vencedor de cada confronto (`tieWinner`: agregado, gol fora
   não conta, empate cai nos pênaltis da volta). Se algum confronto ficar indeciso (empatado sem
   pênaltis registrados — não deveria acontecer, o motor sempre resolve antes de marcar `played`),
   não sorteia nada e devolve o evento `undecidedTie` (vira `logError`, mesmo tratamento da copa
   nacional para a mesma situação). Senão, sorteio livre da próxima fase (`drawFree`; semi → final
   é o único par restante, joga em campo neutro).
4. **Final completa** → campeão (`finalWinner`: placar, senão pênaltis).

**Volta sem agregado ao chegar a data (`advanceDay.ts`, Passo 1b).** Antes de simular uma fixture
de volta (`leg === 2`) sem `aggregate`, calcula-o da ida já jogada (`withAggregate`) e registra
`logError("continental", …)` — a etapa normal (item 2 acima) pode ter falhado num dia anterior, e
sem agregado o motor decidiria prorrogação/pênaltis com o total errado. Se a ida correspondente
também não tiver sido jogada (dado corrompido), a volta é jogada sem agregado (loga o erro) em vez
de travar o dia inteiro.

## Modo de simulação

Mesma regra das copas: uma fixture continental roda no **motor completo** só quando um dos dois
clubes está na liga do jogador; o resto usa o quickSim. O clube do próprio jogador sempre joga no
motor completo.

## Virada por continente

Não existe "fim de temporada" próprio de uma competição continental — ela é arquivada e
regenerada quando **todas as ligas "que definem a temporada" do continente** já viraram para o ano
seguinte:

- **Europa:** só as ligas de nível 1 europeias cujo calendário **cruza o ano** (`season`
  "YYYY-YY") contam. Ligas europeias de ano civil **existem de verdade** (Belarus, Finlândia,
  Geórgia, Islândia, Noruega, Suécia — `crossYear: false` em `leagueSchedules.json`, e algumas
  delas recebem vaga na Champions/Europa League por coeficiente ou zona) e ficam de fora do cálculo
  do continente **de propósito**, não porque não existam: a temporada delas termina por volta de
  novembro/dezembro, meses depois da virada europeia (que segue as ligas de calendário cruzado, com
  fim em maio), então elas nunca poderiam ser "que define a temporada" sem atrasar a virada de toda
  a Europa por causa de 5-6 países pequenos. A consequência é que a virada continental da Europa
  não espera por elas — ver "Ligas de calendário europeu vs. datas continentais fixas" logo abaixo
  para o que isso implica no dia em que ELAS mesmas viram (dezembro).
- **América do Sul:** todas as ligas de nível 1 sul-americanas (todas de ano civil).
- `continentsToRegenerate(tier1States, compYear)` (`continentalProgress.ts`, mesmo molde de
  `countriesToRegenerate` das copas) só devolve um continente quando **cada** liga "que define a
  temporada" já está num ano maior que o ano da competição primária desse continente; o ano novo é
  o **menor** entre essas ligas.
- Em `advanceDay.ts`, roda no mesmo gatilho das copas nacionais (`due.units.length > 0 ||
  due.resync.length > 0` — inclui um dia de resync, não só um dia que rodou a virada de algum país
  agora mesmo). Para cada continente devido: arquiva as duas competições
  (`buildContinentalArchive`, ver abaixo) e chama `createContinentalSeason` com o ano novo.
- **Fail-fast, sem try/catch por continente** (diferente da criação da carreira): uma falha aqui
  derruba o dia inteiro — a escrita bufferizada daquele dia nunca é gravada, então o gatilho
  continua verdadeiro e o próximo avanço simplesmente tenta de novo a mesma regeneração, em vez do
  continente ficar travado meses com um ano já arquivado em outro lugar mas nunca substituído.
- **Segurança do agregado na volta** (Passo 1b acima) evita que uma falha isolada de
  `advanceContinentalStages` num dia anterior brique o dia da volta.
- **Auto-cura de um continente sem competição alguma.** Se um continente nunca teve `ucl`/`uel` (ou
  `lib`/`sud`) gerada com sucesso — a criação da carreira falhou e o try/catch dela engoliu o erro
  (agora logado com `logError("continental", …)` em vez de `console.error`, ver seção de criação
  acima) — `continentsToRegenerate` nunca o pega, porque ele exige um ano já existente para
  comparar. `advanceOneDay` cobre esse caso à parte, no mesmo gatilho de rollover/resync: quando o
  continente não tem meta da competição primária nenhuma em disco, mas já existe uma liga "que
  define a temporada" para calcular o ano (`seasonDefiningYear`), ele chama `createContinentalSeason`
  na hora, do zero, sem arquivar nada (não havia nada para arquivar). Mesmo regime fail-fast dos
  itens acima: falhar aqui derruba o dia inteiro e a próxima virada/resync tenta de novo.

## Choque entre a virada de liga de ano civil europeia e as datas continentais fixas

`logEuropeanCalendarClashes` (`src/backend/continentalWorld.ts`) roda logo após o laço de virada
por país em `advanceDay.ts`, sobre o calendário novo que cada liga acabou de escrever. Para cada
clube que participa de `ucl`/`uel`, junta o conjunto de datas da competição (todas as 13, sorteadas
ou não) e verifica se alguma rodada nova da liga do clube cai exatamente numa dessas datas — se sim,
`logError("continental", …)` com liga, competição, clube e data. Roda para toda liga que virou no
dia (não só as 6 de ano civil europeias listadas acima), mas só encontra choque de verdade nelas:
uma liga de calendário cruzado (Big-5 etc.) vira junto da própria virada continental da Europa, e
as datas da temporada continental **antiga** (que ainda está em disco no momento da checagem, antes
do bloco de regeneração mais abaixo) sempre terminam em maio, meses antes do agosto em que a liga
nova começa — nunca há sobreposição de datas possível nesse caso. Só loga; não reagenda (ver
"Limitações conhecidas" acima para o motivo).

## Arquivo (`buildContinentalArchive`)

Reaproveita `buildKnockoutSeasonArchive(meta, championId, clubInfo)` (`src/Domain/cups/
cupRollover.ts`) — a mesma função que `buildCupArchive` usa para a copa nacional: um
`SeasonArchive` (mesmo formato de liga, `standings: []`) com **no máximo um título**, do
`championId` da competição (nenhum título se ainda não tinha campeão — não deveria acontecer, a
janela sempre cabe a final antes do fim de todas as ligas que definem a temporada).

## Copa nacional evita as datas continentais

`createCountryCup` (`cupWorld.ts`) também mantém ocupadas, para o agendamento da própria copa, as
datas de toda competição continental (`ucl`/`uel`/`lib`/`sud`) que já tenha algum clube do país
(`continentalSlugsOf`) — mitiga uma copa nacional de ano civil (regenerada depois que as
continentais já existem) cair em cima de uma data de Champions/Europa League/Libertadores/
Sul-Americana do mesmo clube. País sem clube em nenhuma continental (ou nenhuma gerada ainda, como
na criação da carreira, quando as copas são geradas primeiro) recebe uma lista vazia, sem mudança
de comportamento. Ver `.claude/rules/game/cups.md` → seção de datas.

## Start kits

`buildKitWorld` (`src/backend/startKits.ts`) inclui toda pasta continental
(`listCompetitionSlugs(...).filter(isContinentalSlug)`) junto com toda pasta de copa, além das
ligas de `meta.activeLeagues` — um kit pré-simulado carrega as 4 competições continentais com as
rodadas de grupo (e, quando a pré-simulação alcança fevereiro, as primeiras datas de mata-mata)
já jogadas, mesma pré-simulação dia a dia que já existia para as ligas europeias e as copas (ver
`.claude/rules/data/openfootball-import.md` → "Regra de calendário" e `.claude/rules/game/
cups.md` → "Start kits"). `applyKit` já gravava meta/rodadas/date-index e pulava `standings.json`
ausente — nenhuma mudança nele foi necessária para as continentais (que também nunca têm
standings).

## Smoke (`scripts/season-rollover-smoke.ts`)

Seção "Continental competitions", depois da seção de copas nacionais:

1. 4 competições geradas na criação da carreira (`continentalYearsStart.size === 4`).
2. Ao final da corrida: as 4 pastas existem, cada uma com `meta.continental` e exatamente 32
   clubes.
3. Nenhum clube aparece nas listas de 32 de duas competições diferentes.
4. Nenhum clube tem duas fixtures na mesma data entre **todas** as competições (liga, copa e
   continental) — checagem já existente (`doubleBooked`), que enxerga as pastas continentais
   automaticamente porque `listCompetitionSlugs` lista toda pasta de `leagues/` sem filtrar por
   tipo.
5. Nenhuma fixture continental datada antes do `currentDate` final ficou sem jogar.
6. **Contagem informativa (não falha o smoke):** quantas instâncias fixture/clube continentais
   caem no dia anterior ou seguinte a um jogo de liga/copa do mesmo clube — o ajuste ±1 dia da
   spec é uma otimização de custo, não uma regra dura (só o mesmo-dia é proibido de verdade), então
   um número baixo aqui é esperado e não reprovável.
7. **Europa (checagem dura, não condicional):** a virada continental europeia **tem** que ter
   sido alcançada até o fim da corrida — toda liga europeia de calendário cruzado termina entre
   16 e 18 de maio, então uma corrida que vai do gênesis do mundo (agosto de 2026) até a virada do
   país do jogador (~maio de 2027) sempre a alcança; se não alcançar, é bug de verdade, não uma
   questão de tempo. A temporada antiga (Champions e Europa League) tem que estar arquivada com
   exatamente 1 título (`readLeagueSeasonArchive`).
8. **América do Sul (condicional):** mesma checagem de arquivo, se a corrida passou pela virada
   sul-americana (as ligas sul-americanas de ano civil viram por volta de novembro/dezembro — bem
   depois de a corrida padrão já ter parado na virada do país europeu do jogador, então esse é o
   caso raro, não o comum);
   senão (o caso comum — a corrida por padrão começa e termina numa liga europeia, então para bem
   antes de novembro, quando as ligas sul-americanas de ano civil viram), confere que a
   Libertadores progrediu além da fase de grupos: oitavas sorteadas (`stages` com `r16.drawn`) e
   toda fixture de volta das oitavas já jogada carrega `aggregate`.

Rodar: `bun scripts/season-rollover-smoke.ts [--player-league <slug>] [--italy]` (~15 min).

## Números medidos (`bun test src/backend/continentalWorld.test.ts`, mundo 2026/27, 33 países
europeus / 8 sul-americanos — `countriesOfContinent`, `src/Data/countries.json` × `leagueData.json`)

| Competição | choque mesmo-dia | dia adjacente (de 32×13=416) | dia da semana certo | intervalo mínimo |
|---|---|---|---|---|
| `ucl` | 0 | 20/416 | 13/13 | 7 dias |
| `uel` | 0 | 33/416 | 13/13 | 7 dias |
| `lib` | 0 | 54/416 | 12/13 | 7 dias |
| `sud` | 0 | 54/416 | 12/13 | 7 dias |

Zero choque de mesmo dia em todas as 4 (o piso duro do otimizador nunca precisou ser violado). A
América do Sul tem taxa de dia adjacente maior porque as ligas do Brasil/Argentina jogam no meio
da semana com mais frequência que as europeias, deixando menos dias realmente livres na janela.

## Limitações conhecidas

- **Vizinhança sul-americana.** A taxa de dia adjacente da Libertadores/Sul-Americana (54/416,
  ~13%) é estruturalmente maior que a europeia por causa das rodadas de meio de semana comuns nas
  ligas brasileira e argentina — não há como baixar isso sem violar o piso de 3 dias entre datas da
  própria competição continental ou aceitar mais choques de dia da semana.
- **Ligas de calendário europeu vs. datas continentais fixas.** Belarus, Finlândia, Geórgia,
  Islândia, Noruega e Suécia são europeias de ano civil (`crossYear: false`) — não entram no
  cálculo de "ligas que definem a temporada" (de propósito, ver a seção "Virada" acima), então o
  `fim` da janela europeia nunca é puxado por elas. Mas isso também significa que a virada
  **delas mesmas** (dezembro, independente da virada continental da Europa) gera o calendário
  Y+1 sem nenhum conhecimento das datas de UCL/UEL já fixadas para a temporada europeia em
  andamento — uma rodada nova pode cair no mesmo dia de um jogo continental de um clube do país.
  Corrigido só parcialmente: `logEuropeanCalendarClashes` (`src/backend/continentalWorld.ts`,
  chamada em `advanceDay.ts` logo depois do laço de virada por país) detecta e loga
  (`logError("continental", …)`) todo choque de mesmo dia entre a rodada nova de uma dessas ligas
  e uma data de UCL/UEL do mesmo clube — mas **não reagenda**: uma data de rodada de liga vale para
  todos os clubes da liga ao mesmo tempo, enquanto o choque continental só interessa a 1-2 clubes
  do país; mover a rodada inteira para evitar o jogo de um clube desalinharia o calendário de todo
  mundo sem necessidade. As copas nacionais de ano civil (se algum dia existirem fora da América do
  Sul) já mitigam esse mesmo tipo de colisão para si mesmas via `continentalSlugsOf`, mas essa
  mitigação nunca existiu para o calendário da liga em si.
- **Issue #2 (recalibração do quickSim entre ligas de força muito diferente) e a interface**
  (aba Continental na tela de ligas, inbox de sorteio/eliminação/título, prévia de partida com
  ida/volta, `seasonLog.continental`) ficam para o **Plano 3** — não implementadas aqui. Este plano
  (2) cobre só domínio + integração com o save (geração, avanço, virada, kits, smoke).
