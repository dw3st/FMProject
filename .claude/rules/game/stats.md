# Tela Stats e estrelas

Spec: `docs/superpowers/specs/2026-10-01-stats-screen-design.md`. Versão 1.8.

## Tela (`/stats`)

`src/pages/stats` + `src/GameInterface/StatsScreen.tsx`. Duas abas: **Rankings** (artilheiros,
assistências, nota média, mais jogos; 20 linhas) e **Meu time** (elenco ordenável por jogos, gols,
assistências, nota). O seletor lista a liga do jogador, a copa nacional, as continentais do
calendário e todas as ligas do catálogo (rótulos só por `src/Domain/world/labels.ts`).

- Dados: `GET /api/saves/:id/stats?competition=<slug>` (`src/backend/statsRankings.ts`, cache por
  save+competição com chave `currentDate#versão de dados`; 404 para competição inexistente).
- **Geral (`competition=all`, #45):** primeira opção e padrão do seletor; todos os clubes de todas as
  ligas do mundo, só números de liga (mesma regra). O seletor (`statsCompetitionOptions`) agrupa por
  continente (continentais primeiro) → país (ligas por nível, depois a copa), com cabeçalhos de grupo
  do `SelectCombobox` (`group`/`subgroup` opcionais na opção).
- Função pura: `buildCompetitionRankings` (`src/Domain/stats/rankings.ts`). Liga = total − copa −
  continental do `seasonLog`; copa/continental = `seasonLog.cup`/`.continental`. Nota média só existe
  para a liga (mínimo 5 jogos); copa e continental omitem essa tabela.
- Não há minutos jogados no `seasonLog`, então "Meu time" mostra jogos/gols/assistências/nota.

## Estrelas

`computeStars` (`src/Domain/world/stars.ts`), uma por jogador (gold > blue > green): **gold** top
25 do mundo por overall; **blue** nota média >= 7,2 com >= 8 jogos; **green** idade <= 19 entre os 30
melhores dessa faixa. Rota `GET /api/saves/:id/stars` -> `{ stars: Record<id, kind> }`;
`useStarPlayers` devolve um `Map`, `StarBadge` recebe `kind` (cor + legenda traduzida).

## Extrato traduzido

`LedgerEntry.ref` carrega `competition`, `stage`, `position`, `clubName`. `describeLedgerEntry`
(`src/Domain/finance/ledgerText.ts`) devolve chave + partes; `FinancesScreen` monta o texto com
`financesScreen.ledgerText.*`. `label` só serve de fallback. Estágios novos em `ref.stage`:
`runner_up`, `participation`, `group_draw`, `group_win`.

## Aba Prêmios (Etapa 32)

`/stats?tab=awards`: seletores de ano e liga (`GET /api/saves/:id/awards`), mundiais do ano, prêmios individuais,
seleção, técnico e gol da temporada da liga. Ver `.claude/rules/game/awards.md`.

## Torneios de base (Etapa 36)

`seasonLog.youthCup` (J, G, A, soma das notas) fica **fora** dos totais da temporada: rankings, estrelas e histórico não
mudam. Artilharia e notas da base ficam em `meta.youth.leaders` e na aba Base de Ligas
(`.claude/rules/game/youth-competitions.md`).
