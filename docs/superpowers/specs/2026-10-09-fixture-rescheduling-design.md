# Remarcação de jogos de liga em conflito (pendências técnicas 1 e 2)

Data: 2026-10-09. Decisões aprovadas pelo usuário (sem novas perguntas).

## Problema

Os calendários são gerados por competição: a liga na virada do país, a copa nacional quando todas as ligas do
país viraram, as continentais quando as ligas que definem a temporada do continente viraram, e as fases de
mata-mata de copa e continental no dia do sorteio. Cada uma evita o que já existia, mas nunca move o que veio antes.
Sobram dois casos:

1. **Ligas europeias de ano civil** (Bielorrússia, Finlândia, Geórgia, Islândia, Noruega, Suécia) viram em dezembro
   sem conhecer as datas de Champions/Europa League da temporada em curso: rodada no mesmo dia de um jogo continental
   do clube. Hoje só é logado (`logEuropeanCalendarClashes`).
2. **Vizinhança continental × liga** (sobretudo Libertadores/Sul-Americana × Brasil/Argentina, ~13% das datas): o
   otimizador continental só proíbe o mesmo dia; dia anterior/seguinte é custo, não regra.

## Regra

- **Conflito:** um clube com dois jogos oficiais (liga, copa nacional, continental) no mesmo dia **ou em dias
  seguidos** (intervalo menor que 2 dias).
- **Quem cede:** o jogo da **liga** do clube — só aquela partida, com os dois clubes, nunca a rodada inteira. Copa e
  continental ficam nas datas sorteadas. Se os dois jogos em conflito forem de liga, cede o mais tarde.
- **Nova data:** o **meio de semana** (terça, quarta ou quinta) livre mais próximo da data original, dentro da janela
  da temporada da liga (`[início, fim]`, nunca antes do primeiro dia jogável), em que **nenhum** dos dois clubes tem
  jogo no dia, no anterior nem no seguinte. Empate de distância: a data mais tarde. Sem meio de semana livre, o dia
  livre mais próximo (qualquer dia da semana). Sem nenhum dia livre: o jogo fica e o conflito vai para `logError`.
- Conflito sem jogo de liga movível (copa × continental, jogo já jogado, data passada): só contado, não mexido.
- A fixture remarcada guarda `rescheduledFrom` (a data original, a primeira se for remarcada de novo).
- Rodadas (`rounds/{n}.json`) e `date-index` de cada liga ficam coerentes: a rodada sai da data antiga quando não
  sobra jogo dela ali e entra na nova. Todo leitor de jogos já filtra por `fixture.date`.

## Quando

| Momento | Escopo |
|---|---|
| Criação da carreira (`createSave`), depois das continentais e antes dos torneios de base | mundo inteiro |
| Depois do start kit (`/presimulate`), antes de garantir os torneios de base | mundo inteiro |
| Dia de virada / resync, depois de regenerar copas e continentais e antes de regenerar a base (no lugar de `logEuropeanCalendarClashes`) | mundo inteiro |
| Dia com sorteio de fase de copa (`advanceCupStages`) ou continental (`advanceContinentalStages`) | as ligas dos clubes sorteados (com as copas dos países delas e as 4 continentais) |

O passo do dia move jogos de amanhã em diante (`minDate = dia seguinte`); na criação e depois do kit, a partir da
data atual (ainda não jogada). A pré-simulação dos kits usa o mesmo `advanceOneDay`, então kits gerados depois desta
mudança já saem remarcados; os kits antigos são corrigidos pelo passo depois do kit.

## Onde entra no código

- `src/Domain/calendar/rescheduling.ts` (puro, com teste): `findClubConflicts`, `countConflicts`,
  `resolveFixtureConflicts`, `applyMovesToDateIndex`.
- `src/backend/reschedulingWorld.ts` (E/S): carrega jogos das competições (só datas ≥ `minDate − 1`), resolve,
  grava rodadas e `date-index`, devolve as remarcações e os conflitos restantes; `drawnLeaguesOf` monta o escopo de um
  dia de sorteio.
- `advanceDay.ts`, `SaveService.createSave`, rota `/presimulate`: os ganchos acima.
- Inbox: categoria nova `schedule` (`ScheduleInboxMessage`, `kind: "rescheduled"`, um por dia com todos os jogos do
  clube do jogador remarcados), tópico `competitions`, adiada para depois do `clearInbox`.
- Telas: "Remarcado de …" na prévia da partida, no calendário da semana do Painel e na aba Jogos da tela de ligas.
- Torneios de base: sem mudança; o adiamento do dia lê o `date-index` da liga (já com a data nova) e os jogos de hoje.
- `/test` e `/lab`: sem efeito (só calendário).

## Medição

`bun scripts/fixture-conflicts.ts`: cria uma carreira, conta no mundo inteiro (Europa e América do Sul separadas)
os clubes com dois jogos no mesmo dia e em dias seguidos, antes e depois do passo de remarcação, e quantos jogos
foram remarcados. Números no `docs/ROADMAP.md` e em `.claude/rules/game/rescheduling.md`.

## Smoke

`scripts/season-rollover-smoke.ts`: nenhum clube com dois jogos no mesmo dia (já existia, `doubleBooked`); pares em
dias seguidos contados ao fim da corrida e abaixo de um limite pequeno; houve remarcações (`rescheduledFrom`).
