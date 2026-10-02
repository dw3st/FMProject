# Etapa 11c — Histórico do jogador (#32) + correções — Design

Data: 2026-10-02. Status: aprovado. Versão **2.5**. Visual: `.claude/rules/ui-standard.md`.

## 1. Dado

`RosterPlayer.history?: PlayerHistoryRow[]` (também em `RetiredPlayer` e nos livres, que guardam o `player`).

```ts
interface PlayerHistoryRow {
  season: string;      // ano da meta da liga do clube ("2026-27" / "2027")
  squadId: string; clubName: string; league: string;
  apps: number; goals: number; assists: number; avgRating: number | null;
  cupApps: number; cupGoals: number; contApps: number; contGoals: number;
  titles: string[];    // "league:<slug>" | "cup:<slug>" | "continental:<slug>"
}
```

Começa vazio para todo o mundo (sem passado inventado). Sem migração (protótipo).

## 2. Gravação (lógica pura em `src/Domain/history/`)

- `historyRowFromLog(player, log, club, season)` — monta a linha a partir de um `seasonLog`; `null` se 0 jogos.
- **Virada do país** (`advanceDay`, antes de zerar o `seasonLog`): todo jogador dos elencos que viram, com jogos,
  ganha a linha da temporada fechada; títulos de liga do campeão daquela liga.
- **Copa/continental:** o título é anexado na virada do país, lendo os campeões já decididos (copa do país e
  continentais com `championId`) para o clube. Uma competição decidida depois da virada do país fica em
  `meta.pendingTitles` (`squadId → titles[]`) e é anexada à linha daquela temporada na próxima oportunidade
  (`addTitle`, nunca cria linha nova).
- **Transferência / saída para livres / dispensa** no meio da temporada: fecha uma linha parcial no clube antigo e
  zera os contadores de temporada do jogador (fôlego e carga ficam).
- **Aposentadoria:** `history` copiado para `RetiredPlayer`.

## 3. Telas

- Ficha do jogador: bloco "Carreira" — Temporada, Clube, J, G, A, Nota, Títulos; linha "atual" (do `seasonLog`)
  e totais.
- Stats: aba "Aposentados" (lista com nome, idade, último clube, J/G e o histórico ao expandir), via
  `GET /api/saves/:id/retired`.

## 4. Correções

- #42 condução sobre a linha de fundo (investigar com snapshot/`/test`, medir gols/chutes).
- #39 fonte da aba "Meu time" igual à de Rankings.
- #40 posições detalhadas no elenco aberto pelo menu.
- #41 botão "Continuar" no topo da tela de resultado.

## Verificação

Testes de `src/Domain/history` (linha, parcial, títulos, aposentado), rota de aposentados, smoke de temporada
(seção "Histórico": jogadores das ligas viradas com linha, soma de jogos da linha = log arquivado, campeão com
título, transferido com duas linhas). Changelog 2.5, `.claude/rules/game/history.md`, ROADMAP 11c ✅.
