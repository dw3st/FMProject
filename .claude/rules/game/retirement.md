# Aposentadoria e craque renascido

Spec: `docs/superpowers/specs/2026-10-01-retirement-reborn-design.md`. Etapa 11b do `docs/ROADMAP.md`, versão **2.4**.
Visual: `.claude/rules/ui-standard.md`.

## Regra

- Na virada de cada país (`advanceDay`, passo 7b, depois do calendário novo e antes das expirações de
  contrato do passo 8) todo jogador de elenco com idade >= 34 e todo livre (`freeAgents.json`) com idade + 1
  >= 34 passa pelo sorteio de aposentadoria. Quem se aposenta sai do mundo; o registro mínimo vai para
  `saves/{id}/retired.json`. A reposição do passo 8 cobre os mínimos por linha.
- Sem migração (protótipo): `retired.json` ausente = lista vazia.

## Modelo (`src/Domain/retirement/`)

| Arquivo | Papel |
|---|---|
| `retirementConfig.ts` | Constantes (`RETIREMENT`) |
| `retirement.ts` (+ teste) | `retireChance`, `retires`, `buildWorldLevels`, `levelPercentile`, `processRetirements`, `expireOffers`, `generateReborn` |
| `rebornMult.ts` | `rebornDpMult` (separado para não criar ciclo com `youth.ts`) |

```
chance = base(idade) x (1,3 - 0,6 x percentil)  limitada a [0, 1];   >= 40: sempre 1
base   = 34: 0,10 · 35: 0,25 · 36: 0,45 · 37: 0,65 · 38: 0,85 · >= 39: 1,0
```

- `percentil` = fração dos jogadores do mundo, da mesma linha (GK/DEF/MID/FWD), com overall estritamente
  menor. O sorteio é determinístico: `seedFrom(save:jogador:ano:retire)`. Livres usam a idade + 1.
- `closedLogs`: o `seasonLog` do elenco já foi zerado pela virada; os jogos e gols da inbox vêm do
  `archive.playerLogs` de cada liga fechada na mesma virada.
- `RetiredPlayer` (`playerTypes.ts`): `id, name, nationality, positions, preferredFoot, profile, retiredOn,
  squadId, age, wasWorldClass, statsAtRetirement, appearances, goals, rebornOffer?`.
- DAL: `readRetired`/`writeRetired` (`getRetired`/`writeRetired` no `SaveService`), bufferizado como
  `freeAgents`. Tiradas do `tactics.lineup` (o id vira "" para os demais manterem o slot) e da `playerSellList` do clube do jogador.

## Inbox `retirement`

`RetirementInboxMessage` (`kind: "retired" | "reborn"`), enfileirada em `deferredRetirementMessages` e
gravada depois do `clearInbox`. Uma mensagem por aposentado do clube do jogador; classe mundial gera
`reborn` (a mesma mensagem, com Aceitar / Recusar) em vez de `retired`.

## Craque renascido

- **Classe mundial:** aposentado do clube do jogador no top 50 do mundo por overall no momento da virada
  (inclui qualquer estrela dourada, que é top 25). Recebe `rebornOffer: "pending"`.
- A oferta vale até a próxima virada do país do jogador (`expireOffers` no passo 7b: `pending` vira `expired`).
- Rotas (`rebornRoutes.ts`, dono do save + `withSaveLock`): `GET /api/saves/:id/reborn` (ofertas pendentes) e
  `POST /api/saves/:id/reborn/:retiredId` `{ accept }`. `409 offerClosed` se não está pendente; `400
  youthFull` se a base já tem `YOUTH.MAX_SIZE` (18).
- **Aceitar** (`generateReborn`): novo id `reborn_<id>_<ano>`, mesmo nome, nacionalidade, posições, pé e perfil;
  17 anos; um único deslocamento somado a todos os atributos originais (a forma relativa preservada) até o
  `weightedScore` bater média da linha do clube - 0,8 (limitada a 1,5-8); contrato de base (3 anos). Entra em
  `squad.youth` com `reborn: { fromId }`.
- **Crescimento:** `rebornDpMult` = 1,3 enquanto idade < 23, aplicado no treino da base (`developYouthSeason`), no
  treino diário e nas partidas (`dailyTraining.ts`, `matches.ts`). Vale pela idade (< 23). Reborn não é dispensado da base aos 19: fica até os 23 ou até ser promovido (`youth.ts`).
- Badge `RebornBadge` (estrela `chart-5` + "Renascido") no elenco, na ficha e na base.

## Testes e smoke

```
bun test src/Domain/retirement src/backend/reborn.routes.test.ts
```

`bun scripts/season-rollover-smoke.ts`, seção "Aposentadoria": houve aposentadorias, registros coerentes (idade
>= 34, ids únicos, ninguém aposentado em elenco/base/livres), ninguém com 40+ nas ligas viradas nem nos livres,
mensagem na inbox para cada aposentado do clube do jogador, e um caminho forçado de renascido aceito pela rota
(17 anos, contrato, na base, oferta `accepted`).


## Livres: sorteio uma vez por ano

O pool de livres só é sorteado uma vez por ano de mundo (`meta.freeAgentsRetiredYear`, `processRetirements({ processFreeAgents })`), não a cada virada de país; senão quase todo livre de 33+ se aposentaria na primeira temporada. Registros de livres têm `freeAgent: true` em `retired.json`. Erros `youthFull`/`offerClosed` da rota de oferta têm texto traduzido na `InboxScreen`.

## Personalidade (Etapa 26)

O renascido herda a personalidade do original (`personalityOf` usa `reborn.fromId`). Ver
`.claude/rules/game/personality.md`.

## Assentos (Etapa 43)

A oferta de renascido é do assento do clube (`rebornSeatId`). Ver `.claude/rules/game/multiplayer.md`.

## Lendas da lista de aposentados (4.38.7)

Report de tester. Estatísticas → Aposentados tem o filtro "Lendas" (`?legends=1`, `isLegend`: não livre e nota ao se aposentar
≥ 4,5 (`RETIREMENT.LEGEND_MIN_LEVEL`, 45 na tela) ou classe mundial — ninguém se aposenta no top 50 do mundo, então só
a classe mundial deixava a lista vazia; no mundo de 2027-09 dava ~15 de 919), com a situação de cada uma: quem a trouxe de volta, como (pontos, dinheiro, renascido) e quando
(`RetiredPlayer.legendOn` / `legendVia`). Uma lenda livre (`legendAvailable`) pode voltar para a base com 17 anos pela
regra do renascido (`legendPlayer`, id `legend_<id>_<ano>`) pagando em **dinheiro**, sem pontos:
`POST /api/saves/:id/legends/:retiredId/hire`, compensação `legendHireFee` (€2M + €4M × (nível − 4,5), entre €2M e
€10M, `RETIREMENT.LEGEND_HIRE`) no extrato (`transfer_out`, `ref.stage = "legend"`). Uma por temporada por técnico
(`AchievementsState.bought.legendMoneySeason`), separada da loja de pontos; cada lenda volta uma vez no mundo. 409
`noClub` / `alreadyBought` / `noMoney` / `offerClosed`, 400 `youthFull`; guarda de lobby. Teste:
`src/backend/legendHire.routes.test.ts`.

## Filtros da lista (4.39.3)

Reports de tester. `GET /api/saves/:id/retired` aceita `q` (nome, sem acento nem caixa, até 60 caracteres), `nation`
(nacionalidade exata) e `notable=1` (`isNotableRetiree`: lenda, ou nível ao se aposentar ≥ `RETIREMENT.NOTABLE_MIN_LEVEL`
3,5; no mundo dos testers, 250 de 1633), aplicados depois de `mine`/`legends` por `filterRetired` (`shop.ts`), e devolve
`nations` (as nacionalidades da lista antes desses filtros). Tela: chip "Só destaques" (ligado por padrão; some na aba
Lendas), busca por nome (300 ms) e seletor de país.
