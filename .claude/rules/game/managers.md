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

Ordenação (`rankManagers`): pontos desc, depois número de títulos desc, depois nome, depois id.
`rankingPage` filtra pelo escopo, numera dentro dele e acha a posição do técnico do jogador.

## Criação (`SaveService.createSave`)

`buildInitialManagers`: um registro por clube a partir de `squad.coach` (`coach_<coach.id>`; sem coach,
`coach_<squadId>` e nome "Técnico do <clube>"; ids repetidos ganham `coach_<squadId>`), e o técnico do jogador
(`id: "player"`, `isPlayer`, nome de `meta.manager.name`, senão o nome do clube) no lugar do coach do clube do
jogador. Start kits (`applyRandomStartKit`) não tocam o arquivo.

## Onde pontua (`src/backend/advanceDay.ts` + `src/backend/managerWorld.ts`)

`createManagerTracker` (por dia): lê o arquivo na primeira vez, aplica títulos/temporadas em memória, memoiza o
peso de cada país no dia e grava uma vez (`flush`, antes do patch da meta) no `BufferingSaveDAL` do dia.

- **Virada do país** (passo 3, junto das linhas de histórico): o 1º da tabela (com jogos) pontua a liga
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
- Painel do clube (`Dashboard/ClubSidebar.tsx`): "Ranking de técnicos: Nº X" abaixo do nome do técnico, link para a aba.
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

- **Repetição de um dia que falhou.** Títulos repetidos (mesma temporada, tipo, competição e clube) e temporadas
  repetidas (`lastSeason`) são ignorados, então um dia refeito depois de um `flush` parcial não pontua duas vezes.
  Um dia refeito em que o arquivo não chegou a ser gravado simplesmente pontua de novo do zero (correto).
- **Peso calculado no momento.** O peso usa o nível dos elencos no dia do título (virada ou final), não uma
  média da temporada; um país muda de peso conforme os elencos mudam.
- **Título continental decidido depois da virada** entra com a temporada da competição (`seasonLabel` da meta
  continental), não com a da liga do clube.
- **Técnicos fixos.** O técnico da IA nunca troca de clube nem se aposenta; quando houver demissões/convites, o
  registro precisará de histórico de clubes (hoje `titles[].squadId` já guarda o clube de cada título).
