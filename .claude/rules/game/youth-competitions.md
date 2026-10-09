# Torneios de base e reservas (sub-21 e sub-19)

Spec: `docs/superpowers/specs/2026-10-09-youth-competitions-design.md`. Etapa 36 do `docs/ROADMAP.md`, versão **4.14**.
Visual: `.claude/rules/ui-standard.md`. Base do clube (safra, promoção): `youth.md`.

## Regra

- Cada país com liga de nível 1 ativa (`topLeagueOf`) e ≥ 2 clubes tem um **sub-21** e um **sub-19**, só com os
  clubes dessa liga, em turno e returno (tabela de liga). Moram em `saves/{id}/leagues/u21_<país>` e `u19_<país>`
  (meta `kind: "youth"`, rodadas, `date-index`, `standings.json`) e **nunca** entram em `meta.activeLeagues`.
- Geradas na criação da carreira (depois das copas e das continentais), arquivadas (tabela final, 1 título) e
  regeneradas quando a liga de nível 1 do país vira (mesmo gatilho das copas, depois das continentais; fail-fast).
- Sempre **quickSim**, nunca o motor completo (nem o clube do jogador). Escalação automática.
- Efeitos: DP, fôlego/carga, moral (minutos dos jovens e reservas do clube do jogador) e lesões. **Cartões não contam**
  (nem suspensão na base, nem `seasonLog`). Sem bilheteria, prêmio, diretoria, torcida, histórico do clube, ranking de
  técnicos, prêmios de fim de temporada.
- **Fora dos fluxos do time principal:** `getActiveRoundsForDate`/`getFixturesForDate` excluem os slugs de base
  (`{ includeYouth }`, `{ onlyYouth }`; `getYouthFixturesForDate`); os jogos do dia vão para
  `StoredDayLog.youthMatches`, nunca para `events`; `seasonLog.youthCup` fica **fora** dos totais da temporada (rankings,
  estrelas, histórico, prêmios, forma não mudam); `season.youthCalendar` é separado de `season.calendar` (um jogo de
  base nunca é "dia de jogo").
- Sem migração (protótipo): save sem as pastas não tem torneios de base.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/youthCompTypes.ts` | `YouthCompAge`, `YouthLeader`, `YouthCompMetaData`, `YouthMatchLog` |
| `src/Domain/youthComps/youthCompConfig.ts` | Constantes (`YOUTH_COMP`) |
| `src/Domain/youthComps/youthCompIds.ts` | `youthCompSlugOf`, `isYouthCompSlug`, `youthCompAgeOf` |
| `src/Domain/youthComps/youthSchedule.ts` | `roundRobinPairings`, `scheduleYouthSeason` (datas por clube) |
| `src/Domain/youthComps/generateYouthComp.ts` | Meta + rodadas + date-index, `youthWindow`, `youthCompsToRegenerate`, arquivo |
| `src/Domain/youthComps/youthLineup.ts` | Elegibilidade, prioridade, jovens gerados (`youthFillers`), `pickYouthLineup` |
| `src/Domain/youthComps/youthMatch.ts` | `applyYouthMatch`, `youthDpMult`/`youthCompDpMult`, `updateLeaders`, `youthMatchLog`, `postponeDate` |
| `src/backend/youthCompWorld.ts` | E/S: `createYouthCompetitions`, `ensureYouthCompetitions`, `regenerateYouthComps`, `playYouthDay` |
| `src/backend/youthCompRoutes.ts` | Rotas (abaixo) |
| `src/backend/SaveService.ts`, `advanceDay.ts`, `saves.ts`, `startKits.ts`, `jobWorld.ts` | Integração |
| `src/Domain/advanceDay/dailyTraining.ts`, `dailyRest.ts` | `skipPlayerIds`; recuperação diária da base (`restAcademy`) |
| `src/Domain/morale/morale.ts` | `youthMinutes` no déficit de minutos |
| `src/GameInterface/Components/YouthCompView.tsx`, `YouthCompTab.tsx`, `YouthSeasonLine.tsx`, `Squad/YouthCallUpsPanel.tsx` | Telas |
| `scripts/youth-comp-measure.ts` | Medição da evolução |

## Calendário (`scheduleYouthSeason`)

- Janela `[início da liga + 7, fim − 7]` (nunca antes de amanhã quando regerada no meio da temporada). Semanas inteiras
  `W` × rodadas `R`: uma por semana; duas (sub-21 ter + sex, sub-19 seg + qui) quando `2W ≥ R`; só o turno (até 3 por
  semana) quando `2W < R`; sem caber, não gera (`logError`).
- Ocupação por clube: todos os jogos da liga do clube, toda data de fase da copa do país (conservador) e as 13 datas da
  continental em que ele está nos grupos. Dia comum da rodada pelos dias preferidos (sub-21: ter, qua, seg, qui, sex;
  sub-19: qui, qua, sex, ter, seg) e o menor custo (1000 por jogo no mesmo dia de um jogo do time principal, 1 na
  véspera/dia seguinte); o jogo de um clube ocupado vai para o dia livre mais próximo da semana, ou até 6 dias depois,
  ou, sem nada livre antes da rodada seguinte, para o dia livre mais próximo entre a rodada anterior e a seguinte
  (fim de semana e dias antes da data comum incluídos). Sem a última busca, uma semana de duas rodadas com liga na
  segunda, Libertadores na terça e copa na quarta deixava os clubes da Libertadores no dia da liga (sub-19 argentino,
  2027-10-04, 12 clubes).
- **Adiamento no dia** (`playYouthDay`): jogo de um clube que joga pelo time principal hoje vai para o próximo dia livre
  dos dois (até 14 dias, antes do fim; `postponedFrom`, `date-index` regravado); sem dia, **cancelado** (`played: true`,
  `result: null`, `cancelled: true`, fora da tabela).

## Escalação (`pickYouthLineup`, 4-3-3, GK 1 · DEF 4 · MID 3 · FWD 3)

- Fora sempre: indisponível, quem já jogou base hoje. Fora salvo convocação: fôlego < 60 e titulares do time principal
  (IA: XI automático da formação da temporada, memoizado por conteúdo; clube do jogador: `tactics.lineup`). O XI só é
  calculado quando algum candidato precisa (sub-19 de IA sem jovens nunca o calcula).
- Prioridade — sub-19: convocados (≤ 19), base ≤ 19, elenco ≤ 19 não titular, gerados. Sub-21: convocados, elenco ≤ 21
  não titular, base 20–21, base ≤ 19 que não jogou o sub-19 hoje, reservas > 21 "sem minutos" (≤ 40% dos jogos do mais
  usado; até 5), gerados. Dentro do grupo: menos jogos, maior nota na posição natural, id.
- Jovens gerados: turma estável por clube, competição e temporada (`ygen_<clube>_<slug>_<ano>_<linha>_<i>`, receita da
  safra), nunca gravados; só nos destaques e no log. `statsFor` é memoizado (puro).
- O dia joga o sub-19 antes do sub-21; ninguém joga os dois.

## Pós-jogo (`applyYouthMatch`)

`seasonLog.youthCup` (J, G, A, soma das notas; zera na virada da liga do clube, a base também — `runSeasonTransition`
zera os contadores da base e mantém fôlego e carga; acompanha o jogador numa transferência, como o resto do `seasonLog`), fôlego e carga de 90 minutos (`applyMatchFitness`), DP de crescimento ×
`youthDpMult` (staff, CT, renascido, personalidade, moral × `DP_MULT` até 21 anos ou `DP_MULT_OVERAGE` acima; sem
declínio por idade), lesões (médico/fisioterapia; inbox `injury` do clube do jogador, inclusive a volta), cartões
ignorados. Quem jogou não treina nem descansa no dia (`skipPlayerIds`). A base (`squad.youth`) recupera fôlego todo dia
pela curva de descanso (`restAcademy`), sem DP de treino.

## Moral

`moraleLog.youthMinutes` (últimos 5 jogos de base, só `players` do clube do jogador). Na segunda, para `youth`, `backup`
e `rotation` com déficit de minutos, a base reduz a perda (`p + 0,5 × y`), nunca dá bônus. Zera na virada.

## Telas

- **Ligas → aba "Base"** (só com o país tendo torneios): "Sub-21 / Sub-19" (`SegmentedTabs` compacto), tabela, resultados
  por rodada (navegação; "Adiado de", "Cancelado"), destaques (artilheiros e notas, mínimo 3 jogos; reais com link,
  gerados sem link).
- **Painel → Semana:** os jogos de base do clube abaixo do dia (selo Sub-21/Sub-19, adversário, resultado); não mudam o
  tipo do dia nem o "Jogo" da barra.
- **Ficha:** linha "Jogos da base" (J, G, A, nota) abaixo da carreira. **Elenco → Base:** colunas J base e G base e o
  bloco "Jogos da base" (próximo jogo de cada idade, convocação por chips até 11, aviso de convocado que não jogou).
- i18n `youthComps.*` (en, pt-BR).

## Rotas (`requireSaveOwner`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/youth-comps?country=` | `{ u21, u19 }` (slug ou `null`) |
| `GET /api/saves/:id/youth-comps/:slug` | `{ meta, fixtures, standings, names, leaders, leagueOf }`; 400 / 404 |
| `GET /api/saves/:id/youth-callups` | `{ next, callUps, skipped, eligible }`; 409 `noClub` |
| `PUT /api/saves/:id/youth-callups { u21?, u19? }` | Grava `meta.youthCallUps` (`withSaveLock`); 400 `invalidPlayers`; 409 `noClub` |

As convocações de uma idade são consumidas quando o clube joga (ou tem cancelado) um jogo dela no dia; os convocados que
não jogaram ficam em `meta.youthCallUpsSkipped`. Troca de clube e demissão limpam os dois.

## `/test`, `/lab`

Sem efeito de partida (só quickSim): nada a exibir; `Statistics.ts` não muda.

## Medições

**Evolução** (`bun scripts/youth-comp-measure.ts`, 400 sementes, uma temporada, nota ~N(6,4; 0,6), staff e CT neutros):

| Caso | Δ média 13 | Δ overall |
|---|---|---|
| Base 17, sem jogos de base | +0,469 | +0,567 |
| Base 17, 38 jogos de base | +0,584 | +0,705 |
| Reserva 23, 6 jogos oficiais | +0,029 | +0,035 |
| Reserva 23, 6 oficiais + 38 de base | +0,031 | +0,038 |
| Reserva 23, 13 jogos oficiais (1/3) | +0,031 | +0,038 |

Jovem: +0,115 com 38 jogos (+0,207 com 76, as duas idades) — meta +0,10..+0,30. Reserva: igual ao reserva com 1/3 dos
jogos oficiais. `DP_MULT` = 1,0 (até 21) e `DP_MULT_OVERAGE` = 0,18 (38 jogos de base ≈ a DP de 7 jogos oficiais).
**Desvio do spec:** um `DP_MULT` único não cumpre as duas metas (com 0,6 o jovem ganha só +0,04; para o reserva caber
seria ≤ 0,18): por isso o fator por idade. Uma temporada com o progresso zerado tem zona morta: 6 → 13 jogos oficiais
mal mexe a média, então a meta do reserva é conferida também em DP.

**Custo do dia:** ver a spec §9.1.

## Testes e smoke

```
bun test src/Domain/youthComps src/backend/youthCompWorld.test.ts src/backend/youthComps.advanceDay.test.ts \
  src/backend/youthComps.routes.test.ts src/backend/youthComps.saveService.test.ts \
  src/Domain/advanceDay/dailyTraining.test.ts src/Domain/advanceDay/dailyRest.test.ts src/Domain/morale
```

`scripts/season-rollover-smoke.ts`, seções "Torneios de base (criação)" e "Torneios de base": competições e tamanhos na
criação; nenhum jogo de base nos `events` do dia; nenhum jogo de base não jogado no passado; cancelamentos < 1%;
jogadores do clube do jogador nos jogos; ninguém com mais `youthCup` que os jogos de base dele nos logs do dia (em
qualquer clube); nenhum jogador da base com mais jogos que o clube na temporada; o `youthCup` do elenco e da base zera
na virada do clube do jogador; nenhum jogo de base num dia do time principal logo depois da criação; tabelas do país do jogador
coerentes e iguais à recalculada; convocação pela rota joga e some; na virada, ano novo, arquivo com 1 título e nenhum
jogo novo antes da data. A checagem de dupla marcação conta a base já jogada (jogo de base jogado no dia de um jogo do time
principal é choque; sub-19 e sub-21 no mesmo dia não são; cancelados não contam). Um jogo de base ainda por jogar que cai
num dia do time principal surgido depois da geração (a base regerada não conhece as continentais da temporada nova) só
é informado: o adiamento do dia resolve.

## Limitações

- Um país europeu vira antes de a Europa regenerar as continentais: a base nova não conhece as datas continentais da
  temporada nova; o adiamento do dia cobre.
- Título de base não entra em histórico nem ranking.
- A IA não convoca nem tem moral; os gerados não existem no mundo.
- O custo do dia sobe nos dias de base (ver §9.1 da spec).

## Inscrição (Etapa 37)

Os torneios de base não têm lista de inscritos nem filtro: são automáticos, com jovens e reservas
(`.claude/rules/game/registration.md`).
