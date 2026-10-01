# Tela Stats + estrelas + #24 + #7 — Design

Data: 2026-10-01. Status: aprovado. Etapa 8 do `docs/ROADMAP.md` (3.2). Versão **1.8**.

## 1. Tela Stats (`/stats`)

- Página nova `src/pages/stats` + `src/GameInterface/StatsScreen.tsx`; o item "Stats" da navegação
  deixa de apontar para "em breve".
- Seletor de competição: liga do jogador (padrão), copa e continental do clube, qualquer liga do
  catálogo (mesmo seletor/labels de `LeagueTableScreen`, `src/Domain/world/labels.ts`).
- **Aba Rankings:** quatro tabelas de 20 linhas — artilheiros, assistências, melhor nota média
  (mínimo 5 jogos), mais jogos. Linha: posição, `ClubLogo`, jogador (estrela se tiver), clube,
  número. Clube do jogador destacado; clique abre a ficha do jogador.
- **Aba Meu time:** elenco com jogos, gols, assistências, nota média, minutos (temporada inteira),
  ordenável por coluna.
- Só tabelas; estilo minimalista das telas novas (sem glow, pouco texto).

### Dados

`GET /api/saves/:id/stats?competition=<slug>` → `{ scorers, assists, ratings, appearances }`
(20 linhas cada: `playerId, name, squadId, clubName, value, games`). Função pura
`buildCompetitionRankings(squads, competition, kind)` em `src/Domain/stats/rankings.ts`:
liga = campos de liga do `seasonLog` (total − copa − continental) dos clubes daquela liga; copa =
`seasonLog.cup` dos clubes do país; continental = `seasonLog.continental` dos clubes da competição.
Nota média só existe para o total da temporada (rankings de copa/continental omitem a tabela de
notas). Cache por save com chave `currentDate` + versão de dados (mesmo esquema do scout).

## 2. Estrelas (#28, #29)

`src/Domain/world/stars.ts` passa a devolver `Record<playerId, "gold" | "blue" | "green">`
(uma só por jogador, prioridade gold > blue > green):

- **gold:** top 25 do mundo por overall (era top 50).
- **blue (grande fase):** nota média da temporada ≥ 7,2 com ≥ 8 jogos.
- **green (prodígio):** idade ≤ 19 e entre os 30 melhores do mundo com idade ≤ 19.

Rota `/api/saves/:id/stars` devolve `{ stars: Record<string, kind> }`; `useStarPlayers` e
`StarBadge` (prop `kind`, cor por tipo, `title` com a legenda traduzida). Legenda numa linha no
rodapé da tela Stats.

## 3. #24 — extrato traduzido

`LedgerEntry.ref` ganha os dados que faltarem (`competition`, `stage`, `position`, `clubName`,
`playerName`). `FinancesScreen` e o preview `league_prize` da inbox montam o texto por
`kind` + `ref` com i18n (en/pt-BR); `label` só como fallback.

## 4. #7 — Bundesliga × Serie A

Medir de novo no mundo atual (`bun scripts/quicksim-spread.ts collect` 200×2 para as duas ligas +
`analyze`). Se o erro do quickSim nas duas estiver dentro de ±10%, fechar o issue com os números;
senão, recalibrar (`analyze` seção 8 + `events --apply`) com o conjunto usual de ligas e documentar
em `.claude/rules/non-player-games.md`.

## Verificação

Testes de `buildCompetitionRankings` e das regras de estrela; rota `/stats`; `tsc`; conferência da
tela. Changelog 1.8; ROADMAP (Etapa 8 ✅; #24, #28, #29 fechados; #7 conforme a medição).
