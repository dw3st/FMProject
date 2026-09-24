# Pertencimento de clubes a ligas (por save)

## Regra

- A pasta `saves/{id}/squads/{liga}/` é a verdade: o clube joga na liga da pasta onde está o arquivo dele.
- **Nunca derive pertencimento do `leagueData.json`** (`standings`). Ele é só catálogo estático: nome, cores, zonas e a liga de origem dos escudos.
- Não existe `leagueMembership.json`. Uma fonte só evita divergência.

## Arquivos

- O stem do arquivo é o `squadId`.
- Clubes nativos têm stem numérico e `slug` diferente (`premier_league/33.json`, `slug: "manchester_united"`).
- Clubes `of_*` têm `slug === id`.

## API (`src/backend/`)

| Peça | O que faz |
|---|---|
| `squadIndex.ts` → `buildSquadIndex(files)` | Índice puro: `byId(id)` → `{leagueSlug, stem, slug, nome, cores}`, `inLeague(liga)` (ordenado por id), `resolve(liga, param)` (id, stem ou slug → stem), `leagues()` |
| `SaveService.getSquadIndex(saveId)` | Monta o índice a partir de `listSquadFiles`, com cache por versão do save |
| `getSquad` / `saveSquad` / `squadExists` | Resolvem o clube pelo índice dentro da liga dada |
| `getSquadById(saveId, id)` | Lê o squad onde quer que ele esteja |
| `moveSquad(saveId, id, liga)` | Grava o arquivo na liga nova (mesmo stem, `leagueSlug` atualizado) e chama `deleteSquad` na antiga |
| `resolveSquadId` | Devolve `{leagueSlug, clubSlug: stem}` |
| `ISaveDAL.deleteSquad` | Remove o arquivo. No `BufferingSaveDAL` vira **tombstone** (`null`): some de todas as leituras e listagens até o `flush`. Uma escrita depois apaga o tombstone. O `writeSquad` bufferizado normaliza o `leagueSlug` |
| `squadRouteResolve.ts` | A rota `/api/saves/:id/squad/:league/:club` tenta o clube na liga e depois o id em qualquer liga. O `/import-squads` nunca ressuscita um clube que já existe no save com o mesmo id |

`advanceDay`, `match-setup` e os kits iniciais usam o índice ou `getSquadById`. Nada disso lê `leagueData.standings`.

## Frontend

- **Escudos pela liga de origem.** Os arquivos ficam em `Data/logos/{liga de origem}/`. Use `catalogLeagueBySquadId(leagues)` (`src/Domain/world/labels.ts`) e passe `catalog.get(id) ?? ligaAtual` para `squadLogoUrl`. `squadLogoUrl` devolve `undefined` para ligas `of_*`.
- **Adversário por id.** Busque `/api/saves/:id/squad/:league/:squadId` com o squadId direto, sem mapear slug pelo `leagueData`.
- **Tabela pelo save.** Posição e classificação vêm de `GET /api/saves/:id/leagues/:slug/standings`.

## Crédito de TV no fim da temporada

- Antes, o crédito só entrava se o `playerSquad` tivesse sido carregado naquele dia. Quando entrava, gravava o squad **anterior ao reset** por cima do squad resetado: o elenco não envelhecia e mantinha o `seasonLog`.
- Agora `applyPlayerBroadcastingCredit` (`src/Domain/season`) soma o crédito no squad já resetado pela transição, antes de gravar.

## Teste ponta a ponta

`bun scripts/membership-smoke.ts` move um clube da Championship para a Premier League e um da PL para a Championship. Depois avança 3 dias com buffer e confere contagens, ids únicos, índice, busca por slug, a rota de squad e a gravação na liga nova. Limitação: o calendário da temporada corrente ainda tem os ids antigos. O calendário novo é assunto do plano 3b.
