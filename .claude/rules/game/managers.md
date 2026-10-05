# Ranking de técnicos

Spec: `docs/superpowers/specs/2026-10-02-manager-ranking-design.md`. Etapa 11d do `docs/ROADMAP.md` (#33),
versão **2.6**. Visual: `.claude/rules/ui-standard.md`.

## Regra

- Um técnico por clube, gravado em `saves/{id}/managers.json` (`ManagerRecord[]`, `src/types/managerTypes.ts`).
  Sem migração: o arquivo nasce no `createSave` (save antigo sem o arquivo = ranking vazio).
- Títulos e acessos dão pontos ao técnico do clube **no momento** do título. Desde a Etapa 25 os técnicos da IA são
  demitidos e contratados (seção "Técnicos da IA" abaixo): o ponto vai para quem está no clube naquele dia.
- `/test` e `/lab`: sem efeito de partida, nada a exibir.

```ts
interface ManagerRecord {
  id; name; squadId; isPlayer: boolean;
  points: number;           // soma de titles[].points
  seasons: number;          // viradas do país do clube
  lastSeason?: string;      // rótulo da última temporada contada (não conta duas vezes num dia refeito)
  titles: { season; kind: "league" | "cup" | "continental" | "promotion"; competition; squadId; points }[];
  clubs?: { squadId; from; to?; left?: "sacked" | "moved" | "contract" | "interim" }[];  // todos (Etapa 25)
  freeSince?; interim?: true; hiredOn?; lastFinish?; retired?: true;
  target?: { season; target };  // meta da diretoria do clube atual, cache da revisão de segunda
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

## Troca de clube do jogador (Etapa 20, `.claude/rules/game/jobs.md`)

- O registro do jogador nasce com `clubs: [{ squadId, from: início }]`.
- Aceitar uma proposta (`moveHumanManager`, D4 da Etapa 25): sem troca — o técnico do clube novo vai para o pool
  (`left: "moved"`), o clube antigo recebe interino + vaga e contrata pela regra da IA; a passagem antiga fecha
  (`to`, `left: "moved"`) e abre a nova.
- Demissão / fim de contrato (`sackHumanManager`): o jogador fica com `squadId ""` (`left: "sacked"` ou
  `"contract"`) e um interino (`coach_<clube>_<data>`, "Técnico interino do <clube>") assume, com vaga.
- A rota devolve `clubs` com o nome de cada clube; a aba Técnicos mostra a carreira ao abrir o técnico do jogador.
- Invariante: cada clube tem exatamente um técnico; um técnico pode estar sem clube.

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
- **Demissão repetida num dia refeito.** Mesma não-atomicidade: um dia refeito pode repetir uma demissão já gravada
  em `managers.json` sem a meta (as vagas ficam na meta).

## Técnicos da IA: demissão, pool de livres e contratação (Etapa 25, 4.0)

Spec `docs/superpowers/specs/2026-10-05-living-market-design.md` §2. Regras, não simulação: técnicos da IA não têm
salário, multa nem contrato.

- **Invariante:** todo clube tem exatamente um técnico (interino conta); um técnico pode estar sem clube.
  `buildInitialManagers(..., from)` grava a primeira passagem de todos.
- **Demissão** (`src/Domain/managers/aiManagers.ts`, constantes em `aiManagersConfig.ts`), revisão **toda
  segunda** (`createAiManagerDesk.mondayReview`, `src/backend/managerWorld.ts`) para cada clube da IA de uma liga
  com ≥ 30% das rodadas:
  `pressão = (posição − meta)/tamanho`; `forma` = pontos por jogo da `form` da tabela (últimos 5 — o spec dizia 6);
  `p = 0` com pressão < 0,2, forma ≥ 1,3, < 60 dias no cargo, nas 3 últimas rodadas, interino ou já demitido na
  temporada; senão `min(0,35, 0,06 + 0,8 × (pressão − 0,2)) × paciência (LOW 0,8 · MEDIUM 1 · HIGH 1,2 · ELITE 1,4)
  × 1,5 se forma < 0,8`. Sorteio `seedFrom(save:clube:data:sack)`. A meta (`objectiveFor`) é calculada uma vez por
  liga por temporada e guardada no registro (`target`).
- **Na virada do país** (`rollover`, passo 3): `lastFinish` (percentil da posição final) de todo técnico; rebaixado
  p 0,6, meta falhada por ≥ 25% do tamanho p 0,4, campeão/acesso 0.
- **Ao demitir:** o técnico vai para o pool (`squadId ""`, `freeSince`, passagem fechada `left: "sacked"`), o clube
  recebe um interino (`coach_<clube>_<data>`, "Técnico interino do <clube>", `interim`) e uma vaga em
  `meta.managerVacancies[clube] = { since, hireOn }` (7..21 dias).
- **Contratação** no `hireOn` (`hireDue`, todo dia): alvo = prestígio do clube × 100 (`worldPrestige`, cache por mês);
  candidatos livres (`−|reputação − alvo| + 8 × peso de lugar + ruído`; acima de alvo + 15 só livre há > 1 ano),
  com 20% de chance o melhor empregado de um clube ≥ 0,10 menos prestigioso (1 cadeia por dia; o clube dele ganha
  interino + vaga), e o interino (+10 com ≥ 1,6 ponto por jogo, senão −30). Reputação da IA
  (`aiManagerReputation`): a do jogador com a diretoria trocada por `lastFinish`.
  Interino substituído: sem pontos e sem título é apagado, senão vai ao pool (`left: "interim"`).
- **Aposentadoria:** livre há > 2 temporadas (730 dias), ou > 180 dias sem pontos de ranking → `retired` (fica no
  arquivo, sai do pool e da aba). O prazo curto para quem não tem pontos é ajuste de calibração (o spec previa só as
  2 temporadas): sem ele o pool estabilizava em ~0,11 × clubes.
- **Inbox `manager_news`** (`ManagerNewsInboxMessage`): demissões e contratações da liga do jogador, agrupadas por dia.
- **Rota:** `GET /managers?scope=world|country|free` (aposentados fora), itens com `clubs` (todos, com `left`),
  `free`, `interim`; o do jogador com `earnings`. Aba Técnicos: chip "Livres", "Sem clube"/"Interino", carreira de
  qualquer técnico com o motivo da saída, "Ganhos na carreira" no perfil do jogador.
- **Histórico do clube:** "Técnicos anteriores" vem das passagens de `managers.json` (mais as linhas de temporada).

Medido (`bun scripts/market-sim.ts 3 --no-market`, 1273 clubes): trocas de técnico por temporada nível 1 21–24%,
níveis 2+ 18–21%; mediana de permanência ~1,6 temporada; pool de livres 0,088 → 0,082 → 0,075 × clubes; 0 quebras
da invariante.

Testes: `bun test src/Domain/managers src/backend/managers.market.test.ts src/backend/managers.rollover.test.ts`.
Smoke: seção "Mercado vivo" (um técnico por clube toda segunda, passagens fechadas com motivo, demissões, vagas
preenchidas em ≤ 21 dias, todo interino sobre uma vaga).
