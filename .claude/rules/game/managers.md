# Ranking de técnicos

Spec: `docs/superpowers/specs/2026-10-02-manager-ranking-design.md`. Etapa 11d do `docs/ROADMAP.md` (#33),
versão **2.6**. Visual: `.claude/rules/ui-standard.md`.

## Regra

- Um técnico por clube, gravado em `saves/{id}/managers.json` (`ManagerRecord[]`, `src/types/managerTypes.ts`).
  Sem migração: o arquivo nasce no `createSave` (save antigo sem o arquivo = ranking vazio).
- Títulos e acessos dão pontos ao técnico do clube **no momento** do título. Técnicos da IA não trocam de clube
  nesta etapa (o técnico do clube é sempre o mesmo registro).
- `/test` e `/lab`: sem efeito de partida, nada a exibir.

```ts
interface ManagerRecord {
  id; name; squadId; isPlayer: boolean;
  points: number;           // soma de titles[].points
  seasons: number;          // viradas do país do clube
  lastSeason?: string;      // rótulo da última temporada contada (não conta duas vezes num dia refeito)
  titles: { season; kind: "league" | "cup" | "continental" | "promotion"; competition; squadId; points }[];
}
```

## Pontos (`src/Domain/managers/managerConfig.ts` + `managers.ts`, puro, com teste)

| Título | Pontos |
|---|---|
| Liga nível 1 | 100 × peso |
| Liga nível 2+ | 40 × peso |
| Copa nacional | 50 × peso |
| Champions League / Libertadores | 150 |
| Europa League / Sul-Americana | 80 |
| Acesso (promovido) | 20 |

Arredondados para inteiro. **Peso do país** (`countryWeight`) = nível médio (`clubLevel`, o `teamLevel` do XI
4-3-3 automático) dos clubes da liga de nível 1 do país (`topLeagueOf`) ÷ média dos níveis das 5 grandes
(Inglaterra, Espanha, Alemanha, Itália, França), limitado a [0,2; 1,2]. País sem liga de nível 1 = 0,2.
Calculado **uma vez por país por temporada** e guardado em `meta.managerWeights[país] = { season, weight }`
(rótulo `seasonLabel` da liga na virada, da copa na final); as demais pontuações da mesma temporada usam o cache.

Ordenação (`rankManagers`): pontos desc, depois número de títulos desc, depois nome, depois id.
`rankingPage` filtra pelo escopo, numera dentro dele e acha a posição do técnico do jogador.

## Criação (`SaveService.createSave`)

`buildInitialManagers`: um registro por clube a partir de `squad.coach` (`coach_<coach.id>`; sem coach,
`coach_<squadId>` e nome "Técnico do <clube>"; ids repetidos ganham `coach_<squadId>`), e o técnico do jogador
(`id: "player"`, `isPlayer`, nome de `meta.manager.name`, senão o nome do clube) no lugar do coach do clube do
jogador. Start kits (`applyRandomStartKit`) não tocam o arquivo.

## Onde pontua (`src/backend/advanceDay.ts` + `src/backend/managerWorld.ts`)

`createManagerTracker` (por dia): lê o arquivo na primeira vez, aplica títulos/temporadas em memória, lê/grava o
cache de pesos (`meta.managerWeights`, no patch da meta) e grava o arquivo uma vez (`flush`, antes do patch da meta)
no `BufferingSaveDAL` do dia.

- **Virada do país:** o peso do país é tomado logo depois do plano (passo 2), **antes** de
  `runSeasonTransition` zerar as ligas da unidade. Depois, no passo 3 (junto das linhas de histórico), o 1º da tabela (com jogos) pontua a liga
  (nível da pirâmide, ou 1 sem pirâmide); cada clube que sobe de nível (`plan.tierChanges`, `to < from`) pontua o
  acesso com `competition` = liga de onde saiu; todo clube da liga ganha `seasons += 1`.
- **Copa:** no dia em que a final é decidida (bloco de prêmios de copa), temporada = `seasonLabel` da meta da copa.
- **Continental:** no evento `champion` de `advanceContinentalStages`, temporada = `seasonLabel` da meta.
- Clube sem técnico no arquivo (save sem `managers.json`) não pontua; vira `logError("managers", …)`.

## Rota e telas

- `GET /api/saves/:id/managers?scope=world|country&offset=&limit=` (`src/backend/managerRoutes.ts`, dono do save;
  limite 1..100, padrão 50; escopo inválido 400). `country` = país da liga atual do clube do jogador (pelo índice
  de squads + `leagueData`). Resposta `{ total, playerRank, items }`; cada item traz `rank`, `clubName` e os títulos.
- Aba **Técnicos** na `StatsScreen` (`Components/ManagerRanking.tsx`): #, técnico, clube com escudo, pontos,
  títulos; chips Mundo / Meu país; linha do jogador destacada; clicar (ou Enter) abre os títulos
  (`competitionName`, acesso como "Acesso · <liga>"); "Carregar mais". `/stats?tab=managers` abre direto na aba.
  Toda tabela da `StatsScreen` (Rankings, Meu time, Aposentados, Técnicos) usa as peças de
  `Components/StatsTable.tsx` (cabeçalho, coluna de escudo 32px, nome no mesmo peso, linhas de 44px).
- Cartão do clube no Painel (`ClubCard`, `Dashboard/HomeCards.tsx`; o rank vem de `DashboardScreen`): "Ranking de técnicos: Nº X" abaixo do nome do técnico, link para a aba.
- i18n: `statsScreen.managers.*`, `dashboard.clubSidebar.managerRank` (en, pt-BR).

## Testes e smoke

```
bun test src/Domain/managers src/backend/managers.rollover.test.ts src/backend/managers.routes.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "Técnicos": um único técnico do jogador no clube certo, um técnico por
clube, nenhum com pontos negativos, pontos = soma dos títulos, o campeão da liga do jogador pontuou o título,
todo clube das ligas viradas tem temporada contada, pelo menos um título de copa e um continental creditados;
imprime o top 5 e a posição do jogador.

## Limitações

- **Repetição de um dia que falhou (fase 1 do `flush` não atômica).** `managers.json` é mais um recurso da fase 1
  do `BufferingSaveDAL`, como o extrato (`.claude/rules/game/finances.md` → "Extrato"). Títulos e temporadas
  repetidos (mesma temporada, tipo, competição e clube; `lastSeason`) são ignorados, então um dia refeito depois
  de o arquivo ter sido gravado não pontua duas vezes. O inverso **perde pontos**: se a fase 1 gravou a meta nova
  da liga (ano novo) mas não `managers.json`, o dia refeito vê a liga como já virada (resync, sem virada) e o
  título da liga, os acessos e as temporadas daquela virada se perdem; o mesmo vale para uma final de copa cuja
  rodada e `championId` foram gravados sem `managers.json` (o dia refeito não decide a final de novo). Não
  corrigido; só acontece com falha de E/S no meio do `flush`.
- **Peso de uma temporada.** O peso é o nível dos elencos na primeira pontuação do país naquela temporada (final
  da copa ou virada), não uma média da temporada; na temporada seguinte é recalculado.
- **Título continental decidido depois da virada** entra com a temporada da competição (`seasonLabel` da meta
  continental), não com a da liga do clube.
- **Técnicos fixos.** O técnico da IA nunca troca de clube nem se aposenta; quando houver demissões/convites, o
  registro precisará de histórico de clubes (hoje `titles[].squadId` já guarda o clube de cada título).
