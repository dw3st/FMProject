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
  titles: string[]; // "league:<slug>" | "cup:<slug>" | "continental:<slug>"
}
```

## Lógica pura (`src/Domain/history/history.ts`, + teste)

| Função | Papel |
|---|---|
| `seasonLabel` | Rótulo da temporada a partir de `year/start/end` da liga |
| `historyRowFromLog` | Linha a partir de um `seasonLog`; `null` com 0 jogos |
| `appendHistoryRow` / `addTitle` | Anexa linha; `addTitle` só mexe na última linha, nunca cria |
| `closePartialSeason` | Saída no meio da temporada: fecha linha parcial e zera o `seasonLog` (fôlego, moral e carga ficam) |
| `closeSeasonForPlayers` | Virada: linha de cada jogador com jogos, com os títulos dados |
| `addPendingTitle` | Junta um título em `meta.pendingTitles` sem duplicar |

## Onde grava

- **Virada do país** (`advanceDay`, passo 3, logo depois de `writeLeagueSeasonArchive`): os elencos já vêm zerados
  por `runSeasonTransition`, então os logs vêm de `transition.archive.playerLogs`. O 1º da tabela (com jogos) leva
  `league:<slug>`; os títulos pendentes do clube (`meta.pendingTitles[squadId]`) entram na mesma linha e saem do mapa.
- **Copa e continental:** o título vai para `meta.pendingTitles` no dia em que a final é decidida (`recordTitle`
  no bloco de prêmios de copa e no evento `champion` continental) e entra na próxima virada do país do clube.
  Jogador sem jogos naquela temporada não recebe linha nem título.
- **Transferências:** `squadsAfterAcceptedTransfer(..., from)` fecha a linha parcial no clube vendedor quando
  `from = { league, season }` é passado — rota de compra do humano (`transfers.ts`) e mercado da IA
  (`dailyMarketTick` → `historyFrom`, inclusive a venda da lista do jogador).
- **Saída para livres:** só acontece na virada (contrato vencido, já com o log zerado) ou na base (jovens sem
  jogos), então não gera linha parcial. Contratar um livre mantém o `history`.
- **Aposentadoria:** `toRetiredRecord` copia `history` para o `RetiredPlayer`.

## Rotas e telas

- `GET /api/saves/:id/retired` (`rebornRoutes.ts`, dono do save): aposentados, mais recentes primeiro, com
  `clubName` do último clube.
- `CareerTable` (`src/GameInterface/Components/CareerTable.tsx`): Temporada, Clube, J, G, A, Nota, Títulos (nomes
  por `competitionName`), linha "Atual" e total. Usada no bloco "Carreira" do `PlayerScreen` (linha atual do
  `seasonLog`) e na aba "Aposentados" da `StatsScreen` (expandir por jogador). i18n `career.*`,
  `statsScreen.retired.*`.

## Testes e smoke

`bun test src/Domain/history src/backend/reborn.routes.test.ts`. `scripts/season-rollover-smoke.ts`, seção
"Histórico": jogadores da liga do jogador com jogos têm linha, os jogos da linha batem com o log arquivado e o
campeão tem o título da liga.

## Limitações

- Um título continental decidido depois da virada do país do clube entra na linha da temporada seguinte.
