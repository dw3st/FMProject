# Relatório de fim de temporada

Pedido do usuário (report: "fazer essa tela final bem bonita"), layout B do mock, troféus pintados. Versão **10.5**.
Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- Na virada do país do clube, a janela "Temporada encerrada" (`SeasonNoticeModal`, solo e liga de amigos) busca
  `GET /api/saves/:saveId/season-summary?year=<archiveYear>&club=<clube do aviso>` e mostra o relatório
  (`SeasonSummaryView`). Sem ano, sem clube ou com a rota falhando, o aviso curto de antes.
- Nada novo é simulado nem guardado, salvo a meta: tudo sai do que o save já tem.

| Bloco | Fonte |
|---|---|
| Posição, pontos, V/E/D, gols, títulos, acesso ou queda | Linha da temporada em `clubHistory/{clube}.json` (rótulo `AAAA` ou `AAAA-AA` do ano arquivado); clubes da liga = tabela do arquivo da temporada |
| Meta da diretoria | `SeatState.lastSeason { year, clubId, target, met }`, gravada na virada (a meta antiga é trocada no mesmo dia). Só aparece para o mesmo ano e clube |
| Copa e continental | Títulos da linha; senão os prêmios do extrato: fase de copa vencida = chegou à seguinte, `runner_up` = vice; continental pela maior fase paga (`final` sem título = vice) |
| Dinheiro | Extrato da temporada do assento, do clube em que ele terminou (a partir da última chegada, sem `club_change`); empréstimo do banco recebido não é receita |
| Mercado | Compras = `transfer_out` sem `stage`; contratações = essas mais quem está no elenco com `arrival` na temporada (livre, pré-contrato; base não conta); gasto = todo `transfer_out` menos cláusula paga; recebido = `transfer_in` menos cláusula paga |
| Destaques | Linhas de carreira da temporada no clube, do elenco e da base de hoje; o artilheiro do registro do clube vence quando fez mais (conta quem saiu no meio). Melhor nota: 30% dos jogos da liga, no mínimo 5 |
| Público | `facilities.attendance` entre o primeiro lançamento do extrato e o fim da liga |

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/seasonSummaryTypes.ts` | `SeasonSummary`, `SeasonRun`, `SeasonHighlight`, `SeatLastSeason` |
| `src/Domain/season/seasonSummary.ts` (+ teste) | Puro: `buildSeasonSummary`, `cupRun`, `continentalRun`, `entriesAtClub` |
| `src/backend/seasonSummaryRoutes.ts` (+ `seasonSummary.routes.test.ts`) | Rota (membro do mundo; 400 ano inválido, 404 clube fora do save) |
| `src/backend/advanceDay.ts`, `daySeats.ts` | `ds.rollover.objectiveTarget` → `ds.patch.lastSeason` |
| `src/GameInterface/Components/SeasonSummaryView.tsx`, `SeasonNoticeModal.tsx` | Tela; `Modal size="report"` |
| `data_process/assets/season_end/build_season_end.py` | Arte: layout em PIL, FLUX img2img, recorte dos troféus |

## Arte (`src/example_data/assets/season/`, `GAME_ART_FILES`)

- Troféus (`trophy-league|cup|continental.webp`, 384 px com transparência): um por título da temporada, acima do nome
  da competição. Pintados sobre fundo azul-escuro liso e recortados por preenchimento a partir da borda; a base é de
  mármore claro porque uma base escura se confunde com o fundo.
- Faixas (`banner-title|good|bad.webp`, 1600 × 352): título ou acesso; meta não cumprida ou queda; o resto
  (`seasonBannerFile`).
- Trocar uma imagem pede nome de arquivo novo (cache `immutable`).

## Testes

`bun test src/Domain/season/seasonSummary.test.ts src/backend/seasonSummary.routes.test.ts`.

## Limitações

- A temporada que fechou antes da 10.5 não mostra a meta da diretoria.
- O prêmio de mérito da liga entra no extrato da temporada seguinte: "Prêmios" mostra o que foi pago durante a
  temporada.
- Destaques só de quem ainda está no clube (fora o artilheiro do registro); quem saiu livre na virada fica de fora.
- Num clube assumido no meio da temporada, a tabela é do clube e o dinheiro e o mercado são da passagem do técnico.
- Empréstimos recebidos não contam como contratação; a taxa deles entra no gasto.

## Destaques numa faixa (12.15)

Report do usuário. Os destaques do relatório ficam numa faixa só, com divisórias, em vez de 4 cartões soltos: as bordas de fora se alinham com os 3 quadros de cima.

## Resumos guardados (12.15)

Report do usuário: um técnico fechou a janela e não tinha como rever o resumo. Cada resumo fica congelado no arquivo `seats/<assento>/seasonReports.json` (até 60, os mais novos primeiro; `keptSeasonReport`, `src/backend/seasonSummaryRoutes.ts`). Ele é gravado em três momentos:
- na primeira vez que o resumo é aberto;
- no fim do dia em que a temporada do assento acaba (`captureSeasonReports`, no `runBufferedDay`);
- quando alguém abre a lista.

`GET /api/saves/:saveId/season-reports` lista o resumo da última temporada (`lastSeason`) e as temporadas do histórico dos clubes da carreira assinadas com o nome do técnico. Uma temporada que faltar é montada e guardada nessa hora. Telas: o bloco Temporadas (`Components/SeasonReportsSection.tsx`), na aba Perfil de "Seu técnico" e na página do próprio técnico (`/manager/:id`), com o botão Ver resumo. Um resumo montado depois do fato não tem a meta da diretoria (só a última temporada a tem), e os destaques dele só incluem quem ainda está no clube.
