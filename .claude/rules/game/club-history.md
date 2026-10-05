# Histórico e recordes do clube

Spec: `docs/superpowers/specs/2026-10-04-club-history-design.md`. Etapa 22 do `docs/ROADMAP.md`, versão **3.6**.
Visual: `.claude/rules/ui-standard.md`. Linhas de carreira dos jogadores: `.claude/rules/game/history.md`.

## Regra

- Vale para **todo clube** do save (não só o do jogador): os dados vêm do que o jogo já faz para todo mundo
  (tabela final da liga, linhas de carreira, transferências).
- Só o que aconteceu desde o começo da carreira: os dados de origem não têm títulos reais. A tela mostra
  "Histórico desde <primeira temporada>" (ou a temporada atual, sem histórico ainda).
- Sem migração (protótipo): clube sem arquivo = histórico vazio.

## Dado: `saves/{id}/clubHistory/{squadId}.json`

**Um arquivo por clube**, não um `clubHistory.json` único como o spec dizia: com ~1273 clubes, temporadas e
artilheiros acumulando, um arquivo único passaria de dezenas de MB e seria regravado a cada dia com
transferência. DAL: `readClubHistory(saveId, squadId)` / `writeClubHistory(saveId, history)` (`FileSystemDAL`,
`BufferingSaveDAL` com a chave `clubHistory:<save>:<clube>`), `SaveService.getClubHistory`/`writeClubHistory`.
Tipos em `src/types/clubHistoryTypes.ts`:

```ts
ClubHistory {
  squadId
  seasons: ClubSeasonRow[]   // season, league, tier, position, played/won/drawn/lost, gf, ga, points,
                             // titles, move?: promoted|relegated, topScorer?, manager?
  scorers: Record<playerId, { name, goals, apps, assists }>   // soma de todas as linhas de carreira no clube
  openPartials?: Record<season, Record<playerId, ClubScorer>> // saídas no meio da temporada ainda não fechada
  records: { biggestWin?, biggestLoss?, mostGoalsSeason?, recordSigning?, recordSale?, highestFinish?, unbeaten? }
}
```

Títulos da linha: `league:<slug>`, `cup:<slug>`, `continental:<slug>` (os mesmos das linhas de carreira, com os
pendentes de copa/continental de `meta.pendingTitles`) e `promotion:<liga de onde subiu>` (o spec dizia só
`promotion`; o slug serve para a galeria mostrar "Acesso · <liga>").

## Lógica pura (`src/Domain/clubHistory/clubHistory.ts`, + teste)

| Função | Papel |
|---|---|
| `clubMatchesOf` | Jogos jogados do clube (qualquer competição), do ponto de vista dele, dentro da janela da temporada. Placar final (com prorrogação); pênaltis não contam |
| `applySeason` | Fecha uma temporada: linha (artilheiro da temporada conta as saídas do meio da temporada), soma os artilheiros, fecha `openPartials` da temporada, atualiza recordes. **Idempotente** (mesma temporada e liga = nada muda). Devolve os recordes batidos |
| `applyTransfer` | Transferência com taxa: contratação recorde (comprador) ou venda recorde (vendedor); na venda, a linha parcial do jogador no clube entra nos artilheiros e em `openPartials` |
| `longestUnbeaten` | Maior sequência sem derrota (só jogos da liga, dentro da temporada) |
| `titleGallery`, `topPlayers` | Galeria de títulos por competição (continental, liga, copa, acesso) e top 10 por gols / jogos |

Recordes: maior vitória (saldo, depois gols feitos) e maior derrota (liga, copa e continental da janela da
temporada), mais gols de um jogador numa temporada (no clube), melhor posição (nível da pirâmide, depois
posição), invencibilidade (liga, dentro de uma temporada), contratação e venda recordes (taxa > 0).
**Recorde "batido"** = já havia um valor e o novo é estritamente melhor; o primeiro valor não gera aviso.

## Onde grava (`src/backend/clubHistoryWorld.ts`)

- **Virada do país** (`advanceDay`, passo 3, logo depois das linhas de carreira de `closeSeasonForPlayers`):
  `recordLeagueSeasonHistory` para todo clube da liga virada, com a tabela final, `titlesByClub`,
  `plan.tierChanges`, os jogos da liga + copa do país + continentais (lidos uma vez por unidade,
  `cupAndContinentalFixtures`, filtrados pela janela `[start, end]` da liga) e o técnico do clube
  (`managers.json`, pelo `squadId`).
- **Transferência com taxa:** `recordTransferHistory` logo depois de `executeTransferFee`, no mercado da IA
  (`advanceDay`, inclusive a venda da lista do jogador) e na compra do jogador (`transfers.ts`).
- **Inbox `club_record`** (`ClubRecordInboxMessage`, `buildClubRecordMessage` em
  `src/Domain/clubHistory/recordMessage.ts`): um recorde do clube do jogador batido. No avanço do dia vai para
  `clubRecordMessages` e é gravado depois do `clearInbox` (como as demais mensagens adiadas); na compra do
  jogador sai na hora. Texto traduzido na tela (`clubHistory.inbox*`, `clubRecordTexts`).

## Rota e tela

- `GET /api/saves/:id/clubs/:squadId/history` (`src/backend/clubHistoryRoutes.ts`, dono do save; 404 para
  clube fora do save ou id inválido): `ClubHistoryResponse` com estádio, técnico atual e anteriores (das
  linhas de temporada), `since`, temporadas, galeria, top 10 de gols e de jogos (`current`: está no elenco;
  `retired`: está em `retired.json`) e recordes.
- Aba **História** na tela do elenco (`SquadScreen`, `Components/ClubHistoryView.tsx`) para **qualquer** clube —
  é o perfil do clube, aberto pelos escudos/nomes das tabelas que já levam ao elenco (`/squad/<liga>/<clube>`);
  `?tab=history` abre direto. Seções: cabeçalho (estádio, técnicos, "desde"), galeria de títulos, temporadas
  (padrão de tabela de Ligas, seta de acesso/rebaixamento), artilheiros e mais jogos (jogadores atuais
  destacados e com link, aposentados com selo), cartões de recordes. i18n `clubHistory.*`, `squadScreen.tabHistory`.
- Sem aba nova na barra superior (a Etapa 20 mexe nela em paralelo).

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes e smoke

```
bun test src/Domain/clubHistory src/backend/clubHistory.routes.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "História do clube": todo clube das ligas viradas tem a linha da
temporada; a soma dos gols dos artilheiros de cada um bate com as linhas de carreira no clube no mundo
inteiro (elencos, livres, aposentados); o campeão tem o título da liga.

## Limitações

- Título continental decidido depois da virada do país entra na linha da temporada seguinte (como nas linhas
  de carreira).
- Uma liga europeia de ano civil que vira depois da regeneração continental não vê os jogos continentais da
  temporada antiga (já arquivados) nos recordes de placar.
- Invencibilidade só dentro de uma temporada (não emenda temporadas).
- Repetição de um dia que falhou: a linha da temporada é idempotente, mas uma transferência repetida soma de
  novo a linha parcial nos artilheiros (mesma limitação de não-atomicidade da fase 1 do `flush`,
  `.claude/rules/game/finances.md` → "Extrato").
- A prévia da mensagem na lista da inbox mostra o slug da liga em "melhor posição" (a lista não carrega o
  catálogo de ligas); o corpo da mensagem mostra o nome.
