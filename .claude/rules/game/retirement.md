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
  `freeAgents`. Tiradas do `tactics.lineup` e da `playerSellList` do clube do jogador.

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
  `squad.youth` com `reborn: { fromId, until: ano + 6 }`.
- **Crescimento:** `rebornDpMult` = 1,3 enquanto idade < 23, aplicado no treino da base (`developYouthSeason`), no
  treino diário e nas partidas (`dailyTraining.ts`, `matches.ts`). Vale pela idade; `until` é informativo.
- Badge `RebornBadge` (estrela `chart-5` + "Renascido") no elenco, na ficha e na base.

## Testes e smoke

```
bun test src/Domain/retirement src/backend/reborn.routes.test.ts
```

`bun scripts/season-rollover-smoke.ts`, seção "Aposentadoria": houve aposentadorias, registros coerentes (idade
>= 34, ids únicos, ninguém aposentado em elenco/base/livres), ninguém com 40+ nas ligas viradas nem nos livres,
mensagem na inbox para cada aposentado do clube do jogador, e um caminho forçado de renascido aceito pela rota
(17 anos, contrato, na base, oferta `accepted`).
