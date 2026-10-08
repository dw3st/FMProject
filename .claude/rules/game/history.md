# Histórico do jogador (carreira)

Spec: `docs/superpowers/specs/2026-10-02-player-history-design.md`. Etapa 11c do `docs/ROADMAP.md`, versão **2.5**.
Visual: `.claude/rules/ui-standard.md`.

## Dado

`RosterPlayer.history?: PlayerHistoryRow[]` (mais antiga primeiro), também em `RetiredPlayer.history` e nos
livres (o `FreeAgent.player` guarda o jogador inteiro). Começa vazio para todo o mundo; sem migração.

```ts
interface PlayerHistoryRow {
  season: string;   // "2026-27" (liga que cruza o ano) ou "2027" — seasonLabel(year, start, end)
  squadId; clubName; league;
  apps; goals; assists; avgRating: number | null;
  cupApps; cupGoals; contApps; contGoals;
  yellowCards; redCards;   // cartões, todas as competições (seasonLog.yellowCards/redCards)
  injuries; daysInjured;   // lesões (partida + treino) e dias fora (seasonLog.injuries/daysInjured)
  titles: string[]; // "league:<slug>" | "cup:<slug>" | "continental:<slug>"
  partial?: true;   // passagem num clube que ele deixou no meio da temporada (transferência)
  open?: true;      // parcial cujos números ainda estão dentro do seasonLog atual (some na virada)
  loan?: true;      // passagem por empréstimo (`.claude/rules/game/negotiation.md`), "(empréstimo)" na tabela
}
```

**Lesões no log (#93):** `PlayerSeasonLog.injuries`/`daysInjured` contam cada lesão no dia em que acontece
(`withInjuryCounted`, `src/Domain/injury/injury.ts`): +1 lesão e `returnDate − data` dias; uma lesão nova em cima de
outra ainda em curso soma só a extensão além da volta atual. Gravado em `finalizeSquadsAfterMatch` (partida) e
`buildTrainingEvent` (treino pesado). Os quatro campos entram nas linhas pela mesma conta de desconto das parciais
abertas (`remainingStats`).

## Lógica pura (`src/Domain/history/history.ts`, + teste)

| Função | Papel |
|---|---|
| `seasonLabel` | Rótulo da temporada a partir de `year/start/end` da liga |
| `historyRowFromLog` | Linha do clube atual: totais do `seasonLog` **menos** as linhas parciais abertas (`open`); `null` sem jogos restantes. A nota é refeita por soma (`média × jogos` de cada parcial) |
| `appendHistoryRow` | Anexa linha |
| `closePartialSeason` | Saída no meio da temporada: anexa uma linha `partial` + `open` com o que sobrou do log depois das parciais anteriores. **Não mexe no `seasonLog`** (o motor lê `recentRatings`/`trainingSessions` para forma e treino; tabela arquivada, rankings, estrelas e `closedLogs` da aposentadoria leem os totais) |
| `closeSeasonForPlayers` | Virada: linha de cada jogador com jogos (log arquivado − parciais abertas), com os títulos do clube; depois fecha as parciais (`open` sai). Parcial aberta num clube da mesma liga com título recebe esse título |
| `addPendingTitle` | Junta um título em `meta.pendingTitles` sem duplicar |

## Onde grava

- **Virada do país** (`advanceDay`, passo 3, logo depois de `writeLeagueSeasonArchive`): os elencos já vêm zerados
  por `runSeasonTransition`, então os logs vêm de `transition.archive.playerLogs`. Primeiro monta `titlesByClub` da
  liga inteira: o 1º da tabela (com jogos) leva `league:<slug>` e os títulos pendentes do clube
  (`meta.pendingTitles[squadId]`) entram junto e saem do mapa. Depois grava as linhas de cada elenco.
- **Copa e continental:** o título vai para `meta.pendingTitles` no dia em que a final é decidida (`recordTitle`
  no bloco de prêmios de copa e no evento `champion` continental) e entra na próxima virada do país do clube.
  Jogador sem jogos naquela temporada não recebe linha nem título.
- **Transferências:** `squadsAfterAcceptedTransfer(..., from)` anexa a linha parcial aberta do clube vendedor quando
  `from = { league, season }` é passado — rota de compra do humano (`transfers.ts`) e mercado da IA
  (`dailyMarketTick` → `historyFrom`, inclusive a venda da lista do jogador). O `seasonLog` segue intacto; várias
  transferências na mesma temporada viram várias parciais, cada uma descontando as anteriores. A linha "Atual" do
  `PlayerScreen` também desconta as parciais abertas.
- **Saída para livres:** só acontece na virada (contrato vencido, já com o log zerado) ou na base (jovens sem
  jogos), então não gera linha parcial. Contratar um livre mantém o `history`.
- **Aposentadoria:** `toRetiredRecord` copia `history` para o `RetiredPlayer`.

## Rotas e telas

- `GET /api/saves/:id/retired` (`rebornRoutes.ts`, dono do save): aposentados, mais recentes primeiro, com
  `clubName` do último clube. Paginado: `?offset=&limit=` (limite 1..100, padrão 50; fora disso 400), `?mine=1` só
  os aposentados do clube do jogador. Resposta `{ total, items }`, sem `statsAtRetirement` (só a oferta de renascido
  precisa dele). A aba "Aposentados" abre em "Do meu clube", alterna para "Todos" e tem "Carregar mais".
- `CareerTable` (`src/GameInterface/Components/CareerTable.tsx`): Temporada, Clube, J, G, A, Nota, CA, CV, Les,
  Dias fora (cabeçalhos com o nome completo no `title`), Títulos (nomes
  por `competitionName`), linha "Atual" e total. Usada no bloco "Carreira" do `PlayerScreen` (linha atual do
  `seasonLog`) e na aba "Aposentados" da `StatsScreen` (expandir por jogador). i18n `career.*`,
  `statsScreen.retired.*`.

## Testes e smoke

`bun test src/Domain/history src/backend/reborn.routes.test.ts`. `scripts/season-rollover-smoke.ts`, seção
"Histórico": jogadores da liga do jogador com jogos têm linha, a soma das linhas da temporada (parciais + clube
atual) bate com o log arquivado, nenhuma parcial dessa temporada ficou aberta e o campeão tem o título da liga.

## Limitações

- Cartões e lesões só aparecem numa linha com jogos: uma temporada inteira lesionado (0 jogos) não gera linha, e
  uma lesão numa passagem sem jogos fica na linha seguinte do mesmo log.

- Um título continental decidido depois da virada do país do clube entra na linha da temporada seguinte.
- **Título de quem saiu antes da virada.** O título da liga (e os pendentes de copa/continental) vai para a linha
  de quem está no elenco campeão na virada e para a parcial aberta de quem foi vendido a outro clube **da mesma
  liga**. Quem foi vendido para outra liga (ou outro país) antes da virada não recebe o título do clube antigo:
  achá-lo exigiria varrer todos os elencos do mundo a cada virada.
- **Repetição de um dia que falhou.** As linhas são gravadas no mesmo `BufferingSaveDAL` do resto do dia. Se a fase 1
  do `flush` gravar parte dos elencos e falhar (meta não gravada, o dia é refeito), o dia refeito pode anexar a mesma
  linha de novo nos elencos que já tinham sido gravados. É a mesma limitação de não-atomicidade da fase 1 descrita em
  `.claude/rules/game/finances.md` → "Extrato"; não corrigida aqui.
- **Tamanho.** O histórico não tem teto: uma linha por temporada por clube (mais as parciais), ~15 números cada,
  em todo jogador do mundo e em cada aposentado de `retired.json`. Cresce linearmente com as temporadas jogadas
  (dezenas de bytes por linha); sem corte por enquanto. O `RetiredPlayer` guarda `history` e `statsAtRetirement`
  (atributos, usados só pelo renascido); as linhas não repetem atributos e a lista de aposentados não os envia.

## Prêmios (Etapa 32)

`PlayerHistoryRow.awards?: PlayerAward[]` (`{ kind, league? , year? }`): os prêmios da liga entram na linha da temporada
na virada (`recordLeagueAwards`), o mundial na linha da temporada da lista curta em janeiro. A `CareerTable` mostra os
selos na coluna Títulos. Ver `.claude/rules/game/awards.md`.
