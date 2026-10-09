# Remarcação de jogos de liga em conflito

Spec: `docs/superpowers/specs/2026-10-09-fixture-rescheduling-design.md`. Versão **4.16** (pendências técnicas 1 e 2
do `docs/ROADMAP.md`).

## Regra

- **Conflito:** um clube com dois jogos oficiais (liga, copa nacional, continental) no mesmo dia **ou em dias
  seguidos** (sempre ≥ 2 dias entre dois jogos de um clube).
- **Quem cede:** o jogo da **liga** — só aquela partida, com os dois clubes; nunca a rodada inteira. Copa e
  continental ficam nas datas sorteadas. Dois jogos de liga em conflito (raro): cede o mais tarde.
- **Nova data:** o **meio de semana** (terça, quarta, quinta) mais próximo da data original, dentro da janela da
  liga (`[início, fim]` da meta, nunca antes do primeiro dia jogável), em que nenhum dos dois clubes joga no dia,
  no anterior nem no seguinte. Empate de distância: a data mais tarde. Sem meio de semana livre: o dia livre mais
  próximo, qualquer dia da semana. Sem dia livre: o jogo fica e o par vai para `logError("calendar", …)`.
- Conflito sem jogo de liga movível (copa × continental; jogo jogado ou antes do primeiro dia jogável) só é
  contado, nunca mexido.
- `Fixture.rescheduledFrom` guarda a data original (a primeira, se remarcado de novo). Rodadas e `date-index`
  ficam coerentes: a rodada sai da data antiga quando nenhum jogo dela sobra lá e entra na nova. Todo leitor de
  jogos já filtra por `fixture.date` (avanço do dia, `season.calendar`, avanço rápido, `match-setup`).
- Torneios de base: nada muda; o adiamento do dia lê o `date-index` da liga e os jogos de hoje, então vê a data nova.
- `/test`, `/lab`: sem efeito (só calendário).

## Quando roda

| Momento | Escopo | `minDate` |
|---|---|---|
| `createSave`, depois das continentais e antes dos torneios de base | mundo inteiro | data atual |
| Rota `/presimulate`, quando um start kit foi aplicado (antes de garantir a base) | mundo inteiro | data atual |
| `advanceOneDay`, dia de virada ou resync, depois de copas e continentais regeneradas e antes da base | mundo inteiro | dia seguinte |
| `advanceOneDay`, dia com sorteio de copa (`advanceCupStages`) ou continental (`advanceContinentalStages`) | ligas dos clubes sorteados (+ copas dos países delas e as 4 continentais) | dia seguinte |

A pré-simulação dos start kits passa pelo mesmo `advanceOneDay`: um kit gerado depois desta mudança já sai com os
jogos remarcados; os kits antigos são corrigidos pelo passo da rota `/presimulate`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/calendar/rescheduling.ts` (+ teste) | Puro: `findClubConflicts`, `countConflicts`, `findFreeDate`, `resolveFixtureConflicts`, `applyMovesToDateIndex`, `rescheduledGamesOf`, `entryKey` (id de fixture só é único dentro da competição) |
| `src/backend/reschedulingWorld.ts` (+ teste) | E/S: `rescheduleFixtureConflicts` (carrega jogos de `minDate − 1` em diante, resolve, grava rodadas e `date-index`), `drawnLeaguesOf` (escopo do dia de sorteio) |
| `src/backend/advanceDay.ts`, `SaveService.createSave` | Ganchos acima; mensagem do clube do jogador |
| `src/Domain/inbox/inboxEvents.ts` (`buildScheduleMessage`), `src/types/inboxTypes.ts` | Inbox `schedule` / `rescheduled` |
| `src/GameInterface/Components/RescheduledNote.tsx` | "Remarcado de …" |
| `scripts/fixture-conflicts.ts` | Medição |

O antigo `logEuropeanCalendarClashes` (só logava o choque das ligas europeias de ano civil) saiu.

## Inbox e telas

- Categoria `schedule` (`ScheduleInboxMessage`, `kind: "rescheduled"`, `games`: competição, adversário, casa/fora,
  de → para), tópico `competitions`, tema Competições; uma mensagem por dia com todos os jogos do clube do jogador
  remarcados, gravada depois do `clearInbox`. Criação da carreira e kit: sem mensagem.
- "Remarcado de 02 out" (`RescheduledNote`): prévia da partida, semana do Painel (abaixo do jogo do dia) e aba
  Jogos da tela de ligas (linha com a data nova; o cabeçalho da rodada mostra a data da maioria dos jogos).
- i18n `schedule.*`, `inbox.categories.schedule` (en, pt-BR).

## Medição (`bun scripts/fixture-conflicts.ts [--league premier_league] [--days N]`)

"Antes" é o mesmo calendário com cada jogo remarcado de volta à data original. Pares por clube (um par = dois jogos
do clube a menos de 2 dias); a região é a do país da liga do clube.

MEASUREMENT_TABLE

Passo do mundo inteiro sem nada a mover (só leitura): ~0,55–0,7 s.

## Smoke

`scripts/season-rollover-smoke.ts`, seção "Remarcação": nenhum par no mesmo dia; pares em dias seguidos ≤ 15;
houve jogos remarcados; só jogos de liga têm `rescheduledFrom`, sempre com data diferente, dentro da janela da
liga e no `date-index`.

## Limitações

- O par copa × continental em dias seguidos fica (nenhum dos dois se move).
- Os dias de descanso pré-semeados (`restDays`, véspera e dia seguinte de cada jogo) não acompanham a data nova.
- A validade da proposta de emprego da virada usa o primeiro jogo da liga nova antes das remarcações.
