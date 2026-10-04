# Etapa 22 — Histórico e recordes do clube — Design

Data: 2026-10-04. Status: aprovado. Versão **3.7**.

## Ideia

Uma tela **Clube** (nova aba da barra superior, entre Elenco e Formação, ou dentro de Elenco como aba
"História") com a memória do clube desde o início da carreira: galeria de títulos, temporadas passadas, maiores
artilheiros e recordes. Vale para **qualquer clube** (o perfil de um adversário também abre a história dele),
porque os dados vêm de arquivos que o jogo já grava para todo mundo.

## 1. Fontes (já existem)

- Arquivo de cada temporada de liga (`readLeagueSeasonArchive`: tabela final, títulos) e das copas/continentais
  (`buildKnockoutSeasonArchive`: campeão).
- Linhas de carreira dos jogadores (`PlayerHistoryRow`, por temporada e clube; também nos aposentados e livres).
- Ranking de técnicos (`managers.json`: títulos e passagens, com a Etapa 20).

## 2. Arquivo novo por save: `clubHistory.json`

Atualizado **na virada do país** de cada clube (mesmo ponto onde já se gravam o arquivo da liga e as linhas de
histórico), para todo clube das ligas viradas:

```ts
ClubHistory {
  squadId
  seasons: { season, league, tier, position, played, won, drawn, lost, gf, ga, points,
             titles: string[],            // "league:<slug>" | "cup:<slug>" | "continental:<slug>" | "promotion"
             topScorer?: { playerId, name, goals }, manager?: string }[]
  scorers:   Record<playerId, { name, goals, apps, assists }>   // soma de todas as linhas daquele clube
  records: {
    biggestWin?, biggestLoss?: { season, opponent, score, competition }
    mostGoalsSeason?: { playerId, name, goals, season }
    recordSigning?, recordSale?: { playerId, name, fee, season, club }   // anotados no momento da transferência
    highestFinish?: { season, league, position }
    unbeaten?: { matches, from, to }     // maior invencibilidade em liga
  }
}
```

- Placares (maior vitória/derrota, invencibilidade) vêm dos jogos da temporada já gravados nas rodadas, lidos uma
  vez na virada.
- Contratação/venda recorde: gravadas na hora da transferência com taxa (jogador ou IA).
- Sem histórico anterior ao começo da carreira (os dados de origem não têm títulos reais); a tela diz
  "Desde 2026/27".

## 3. Tela

- **Cabeçalho:** escudo, nome, fundação/estádio se houver, técnico atual e técnicos que passaram (da Etapa 20).
- **Galeria de títulos:** troféus agrupados por competição (ícone, nome por `competitionName`, anos).
- **Temporadas:** tabela por temporada (liga, posição com seta de subida/descida, pontos, V/E/D, gols, artilheiro,
  títulos), padrão de tabela de Ligas.
- **Artilheiros e mais jogos:** top 10 de gols e de jogos no clube (jogadores atuais destacados; aposentados com
  selo).
- **Recordes:** cartões com maior vitória, maior derrota, artilheiro numa temporada, melhor posição,
  invencibilidade, contratação e venda recordes.
- Entrada pelo clube do jogador (aba) e por qualquer escudo/nome de clube nas tabelas (perfil do clube).
- Inbox: quando um recorde do clube do jogador cai ("Novo recorde: maior vitória"), uma mensagem curta.

## 4. Verificação

Testes puros da agregação (temporada → linha, artilheiros, recordes) e da rota `GET /api/saves/:id/clubs/:squadId/history`
(qualquer clube do save, 404 se não existe). Smoke: depois da virada, todo clube das ligas viradas tem a linha da
temporada, a soma de gols dos artilheiros bate com as linhas de carreira, o campeão tem o título. Sem efeito de
partida (`/test`, `/lab`: nada). Changelog 3.7, ROADMAP etapa 22.
