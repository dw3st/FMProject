# Imprensa (coletivas) e notícias do mundo

Spec: `docs/superpowers/specs/2026-10-14-press-news-design.md`. Plano: `docs/superpowers/plans/2026-10-14-press-news.md`.
Etapa 42 do `docs/ROADMAP.md`, versão **4.23**. Visual: `.claude/rules/ui-standard.md`. Diretoria: `board-fans.md`; moral: `morale.md`.

## Regra

- **Coletivas** só do clube do jogador: nos momentos marcantes (gatilhos abaixo) chega um convite na caixa de entrada; o jogador
  responde 3 perguntas escolhendo um tom entre 3. As respostas mexem na moral do elenco ou de um jogador, na diretoria e na
  torcida, e algumas viram **promessas** cobradas no jogo seguinte ou na virada. Nenhum efeito é mostrado antes de responder.
- No máximo **uma coletiva por vez** (`PressState.pending`) e uma a cada `MIN_GAP_DAYS` (7); só o título fura o intervalo e fecha uma
  pendente (ela conta como ignorada).
- **Ignorar** (deixar vencer) custa diretoria (−1) e vira notícia (`press_absent`).
- **Notícias**: `saves/{id}/news/{AAAA-MM}.json`, montadas todo dia a partir do que o avanço do dia já produziu (nada é relido do
  mundo). Mostradas na página `/news` e num cartão do Painel. Valem para o mundo todo, não só para o clube do jogador.
- IA não tem coletivas. Sem migração (protótipo): save sem `press` / `news/` simplesmente não tem nada.
- Estado em `SaveMeta.press` (`PressState`: `pending?`, `lastDate?`, `winless`, `promises`, `history` das últimas `PRESS.HISTORY` = 20).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/pressTypes.ts`, `newsTypes.ts` | Tipos (`PressConference`, `PressState`, `PressPromise`, `NewsItem`, `DayNewsInput`) |
| `src/Domain/press/pressConfig.ts` | Todas as constantes (`PRESS`) |
| `src/Domain/press/triggers.ts` (+ teste) | Gatilhos pré e pós-jogo, `pickTrigger`, `isRunIn`, `zoneBoundaries`, `nextWinless` |
| `src/Domain/press/questions.ts` (+ teste) | `buildConference` (perguntas, tons, variantes), `conferenceView` (sem o `tone`) |
| `src/Domain/press/effects.ts` (+ teste) | `answerConference`, `ignoreConference`, `resolveMatchPromises`, `resolveObjectivePromise`, `validateAnswers` |
| `src/Domain/news/buildDayNews.ts` (+ teste) | `buildDayNews` (itens, importância, tetos), `NEWS`, `newsVariant` |
| `src/Domain/boardFans/boardFans.ts` | `applyPressEffect` (diretoria e torcida) |
| `src/Domain/morale/morale.ts` | `afterPressAnswer` (moral do elenco todo ou de um jogador, pelo `withEventDelta`) |
| `src/Domain/inbox/inboxEvents.ts` | `buildPressInviteMessage` (categoria `press`, tópico `actions`) |
| `src/backend/pressWorld.ts` | `pressDay`: o passo do dia (ausência, promessas, convite novo) |
| `src/backend/newsWorld.ts` | `collectDayNews`, `writeDayNews`, `oldestMonthKept`, coletor do dia (`NewsDayCollector`) |
| `src/backend/pressRoutes.ts`, `newsRoutes.ts` | Rotas |
| `src/backend/dal/*`, `SaveService.ts` | `appendNews`, `getNewsMonth`, `listNewsMonths`, `pruneNews` (bufferizados) |
| `src/backend/advanceDay.ts` | Ganchos: coletor de notícias, `pressDay` depois da diretoria e da moral, convite depois do `clearInbox`, `writeDayNews` |
| `src/GameInterface/Press/*` | `PressModal`, `PressInboxBody`, `pressApi` |
| `src/GameInterface/News/*`, `src/pages/news/` | `NewsScreen`, `NewsList`, `newsText`, `newsApi`; `NewsCard` em `Dashboard/HomeCards.tsx` |

## Gatilhos

Pré-jogo: olhados só nos jogos do clube **daqui a 2 dias**; o convite nasce com a data do dia seguinte (a véspera do jogo) e
vence na **véspera** (`expires = jogo − 1`): pode ser respondido até o fim da véspera, nunca no dia do jogo (o placar já seria
visível). Um jogo de amanhã sem convite não ganha coletiva pré-jogo. Pós-jogo: nos jogos de hoje e na virada; o convite nasce com a **data do dia seguinte** e
vale `POST_VALID_DAYS` (3) dias.

| Gatilho | Quando | Tipo |
|---|---|---|
| `title` | campeão da liga na virada, título de copa ou continental no dia | pós |
| `promoted` / `relegated` | movimento de nível do clube na virada | pós |
| `ultimatum` | diretoria com ultimato em andamento | pré |
| `knockout` | copa a partir das quartas, ou mata-mata continental | pré |
| `eliminated` | eliminado de uma competição hoje | pós |
| `derby` | `isDerby` (mesma cidade, ou o líder da liga com jogos) | pré |
| `heavy_defeat` | derrota por `HEAVY_DEFEAT_MARGIN` (3) ou mais | pós |
| `run_in` | liga: últimas `RUN_IN_ROUNDS` (3) rodadas e a ≤ `RUN_IN_POINTS` (3) pontos de uma fronteira da tabela (título, vaga continental, acesso, queda; `zoneBoundaries`) | pré |
| `winless` | sequência sem vencer de 5, 10, 15… jogos (`WINLESS_STEP`), contada em todas as competições oficiais | pós |
| `upset_win` / `upset_loss` | vitória com expectativa ≤ −0,5 / derrota com expectativa ≥ 0,5 (`matchExpectation`) | pós |

Prioridade (`PRESS.PRIORITY`): title, promoted, relegated, ultimatum, knockout, eliminated, derby, heavy_defeat, run_in, winless,
upset_win, upset_loss. Um único candidato por dia (o de maior prioridade), só se não há coletiva pendente e o último convite foi
há 7 dias ou mais.

`roundsLeft` do `run_in` = total de rodadas − rodada do jogo + 1; um jogo remarcado pode errar em 1.

## Perguntas

Três por coletiva (`buildConference`): **jogo** (a pergunta do gatilho), **jogador** (se há destaque) e **elenco** ou **cargo**.
Cada pergunta tem 3 respostas fixas por tópico e 2 variantes de texto (`PRESS.VARIANTS`), sorteadas por `seedFrom(save:id)`.

| Tópico | Tons (1ª, 2ª, 3ª) |
|---|---|
| jogo | `confident`, `cautious`, e `blame_self` em fase ruim (`PRESS.BAD`) ou `provocative` |
| elenco | `defend_squad`, `demand_squad`, `neutral` |
| jogador | `praise`, `criticize`, `protect` |
| cargo (`ultimatum`, `winless`) | `job_confident`, `ask_signings`, `deflect` (no lugar do elenco) |

Jogador: pós-jogo, o pior de nota na derrota (`culprit`) ou o melhor com nota ≥ 7,5 (`star`); pré-jogo, o artilheiro da
temporada com ≥ 5 gols (`scorer`). Sem ninguém, a pergunta de jogador não existe.

## Efeitos e promessas

Efeito imediato (`PRESS.TONE`; `squad` e `player` = moral, `board` e `fans` = medidores):

| Tom | Elenco / jogador | Diretoria | Torcida |
|---|---|---|---|
| `confident` | +1 | 0 | +1 |
| `cautious`, `neutral`, `deflect` | 0 | 0 | 0 |
| `provocative` | +1 | −1 | +2 |
| `blame_self` | 0 | −0,5 | +1 |
| `defend_squad` | +2 | 0 (−1 extra numa fase ruim) | 0 |
| `demand_squad` | −2 | +1 | +1 |
| `praise` | jogador +4 | 0 | 0 |
| `criticize` | jogador −4 (+1 num profissional, `takesDemandWell`) | 0 | 0 |
| `protect` | jogador +2 | 0 | 0 |
| `job_confident` | 0 | +1 | 0 |
| `ask_signings` | 0 | −2 | +1 |

A moral passa pelo `withEventDelta` (temperamento escala). Ignorar: diretoria `IGNORED_BOARD` (−1).

Promessas (`PROMISE_OF`): `confident` → `win`, `provocative` → `win_bold`, `job_confident` → `objective`. Só uma de cada tipo aberta
por vez. `win` e `win_bold` de uma coletiva pré-jogo valem para o jogo do convite (`fixtureId`); numa pós-jogo, para o próximo jogo
oficial. `objective` vale a meta da diretoria da temporada e se resolve na virada do país do clube.

| Promessa | Cumprida (vitória / meta) | Empate | Quebrada |
|---|---|---|---|
| `win` | diretoria +1, torcida +3 | 0 / −1 | −2 / −4 |
| `win_bold` | +1 / +5 | 0 / −1 | −2 / −6 |
| `objective` | +3 / +3 | 0 / 0 | −4 / −4 |

Manchetes `press_quote` saem dos tons `provocative`, `demand_squad`, `criticize`, `praise`, `ask_signings` (`QUOTE_TONES`).

## Coletiva no avanço do dia (`pressDay`)

Roda depois da diretoria e da moral do dia, com o `board` local já movido pelos jogos. Ordem:

1. Convite vencido (`date >= expires`) = ignorado. A resposta vale até o **próprio dia do prazo** (`currentDate <= expires`) pela rota;
   o avanço que sai do dia do prazo (`date >= expires`) a ignora se ela ainda estiver pendente.
2. Jogos do clube hoje: resolve promessas de jogo, atualiza `winless`.
3. Virada: resolve a promessa `objective` (meta cumprida ou não) e descarta as de jogo da temporada velha.
4. Candidatos pós-jogo (hoje e virada) e pré-jogo (jogos daqui a 2 dias); `pickTrigger` escolhe um.
5. O convite é emitido **depois do `clearInbox`** da virada (como as demais mensagens adiadas) com a data do dia seguinte.

As ausências e promessas resolvidas viram notícias (`press_absent`, `press_promise_kept`, `press_promise_broken`).

Custo do dia (`bun scripts/bench-advance-day.ts --days 7 --buffered`): sem piora mensurável (antes 4251 / 3162 ms, depois 2533 / 2242 ms
no dia comum; o ruído da máquina é de ±30%).

## Notícias

`collectDayNews` junta o que o dia já tem (jogos, títulos, subidas e quedas, transferências, técnicos, prêmios, lesões e
aposentadorias de craques, seleções, recordes de clube, imprensa) e `buildDayNews` monta os itens; `writeDayNews` grava no mês.

| Tipo | Fonte e regra | Importância base |
|---|---|---|
| `thrashing` | jogo de 1ª divisão ou competição com diferença ≥ 4 (`THRASHING_MARGIN`) | 1 |
| `upset` | vitória (margem < 4) de um clube com `clubLevel` ≥ 0,6 abaixo do derrotado (`UPSET_LEVEL_GAP`); o nível só é lido para esses jogos | 1 |
| `champion` | campeão de liga (virada), copa ou continental | 3 |
| `promoted` / `relegated` | movimentos de nível, só vindos de nível ≤ 2 (`MOVES_MAX_TIER`) | 1 |
| `new_leader` | novo líder (≥ 5 jogos) da liga do jogador ou de uma seguida | 2 |
| `big_transfer` | transferência com taxa ≥ €20M (`BIG_FEE`), ou de craque do top 100 do mundo (`famousIds`, cache por mês), ou recorde de contratação (só de comprador de nível 1 ou o clube do jogador); ≥ €60M (`HUGE_FEE`) vale 3 | 1 |
| `manager_sacked` / `manager_hired` | técnicos da IA de clubes de 1ª divisão; interinos não viram notícia | 1 |
| `award` | melhor jogador da liga (1ª divisão, 1) e mundiais (3) | 1 ou 3 |
| `star_injury` | lesão grave de craque | 1 |
| `star_retired` | aposentado famoso = top 50 do mundo (`levels.top` da aposentadoria, `WORLD_CLASS_TOP`), só de elenco (livre não conta) | 1 |
| `national` | campeão de torneio de seleções 3; demais 2 | 2 ou 3 |
| `club_record` | recorde batido do clube do jogador ou de 1ª divisão (menos o de contratação, que é a notícia da transferência) | 1 |
| `press_*` | coletivas do jogador (acima) | 3 |

- **Craque** (transferência e lesão) = `famousIds` (o top 100 do mundo do olheiro), relido uma vez por mês e só quando há
  transferência com taxa ou lesão grave no dia. **Aposentado famoso** é outro corte: top 50 (`levels.top`).
- **Importância:** a base sobe para 2 se a notícia é da liga do jogador, de uma seguida ou de uma competição; 3 fica 3.
- **Tetos por dia:** a imprensa sempre entra; o resto por importância (desempate pelo id) com no máximo `PER_LEAGUE` (3) por liga ou
  competição e `PER_DAY` (30) no total. O mesmo dia refeito gera os mesmos ids (`{data}:{tipo}:{chave}`; a chave de jogo leva a
  competição, porque o id da partida só é único dentro dela).
- **Gravação e poda:** `appendNews` acrescenta ao arquivo do mês sem duplicar ids; no dia 1 de cada mês `pruneNews` apaga os meses
  além de `MONTHS_KEPT` (12, este incluído). Texto por `news.<tipo>.<variante>` (3 variantes, `newsVariant` estável pelo id).

## Rotas (`requireSaveOwner`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/press` | `{ pending, history }`; `pending` sem os tons (`conferenceView`); `history` só `{ id, date, trigger, answered }` (`PressRecordView`) |
| `POST /api/saves/:id/press/:pressId { answers: [{ questionId, answerId }] }` | Responde (`withSaveLock`, uma unidade bufferizada: elenco, meta e notícias juntos). 400 `invalidAnswers`, 409 `noClub` / `pressClosed` (sem pendente, outro id ou depois do prazo) |
| `GET /api/saves/:id/news?scope=all\|club\|league\|followed&competition=&before=YYYY-MM-DD&limit=1..100` | Mais novas primeiro; `{ items, nextBefore }`; nunca parte um dia entre duas páginas; 400 para escopo, limite, data ou competição inválidos |

## Telas

- **Caixa de entrada:** categoria `press` (ícone próprio, tópico `actions`, sempre ligado): assunto pelo gatilho, corpo com a validade e o botão
  Responder (`PressInboxBody`) que abre o `PressModal`.
- **`PressModal`:** uma pergunta por bloco, três respostas, Enviar só com todas respondidas; nenhum efeito é mostrado.
- **`/news`** (`NewsScreen`): chips Mundo / Meu clube / Minha liga / Seguidas, seletor de competição (não lista competições de
  seleção), lista por dia (`NewsList`: escudo e manchete) e "Carregar mais".
- **Painel:** cartão `NewsCard` com as maiores notícias dos últimos dias e link para `/news`.
- i18n `press.*`, `news.*`, `inbox.categories.press`, `dashboard.home.news*` (en, pt-BR); testes de chaves em `press.keys.test.ts` / `news.keys.test.ts`.

## `/test`, `/lab`

Sem efeito de partida: a imprensa só lê o resultado do jogo; nada no motor, no quickSim nem no `Statistics.ts`. Nada a exibir.

## Testes e smoke

```
bun test src/Domain/press src/Domain/news src/backend/dal/news.dal.test.ts src/backend/press.advanceDay.test.ts \
  src/backend/press.routes.test.ts src/backend/news.advanceDay.test.ts src/backend/news.routes.test.ts \
  src/GameInterface/Press src/GameInterface/News src/i18n
```

`scripts/season-rollover-smoke.ts`, seção "Imprensa": a coletiva pendente é respondida pela rota (tons por `n % 3`; uma em cada quatro
fica para vencer); no fim: houve coletivas, nenhuma resposta dupla, promessas abertas só com clube, notícias em todo mês da corrida,
nenhum dia com mais de 30 itens e nenhuma liga com mais de 3 num dia (fora `press_*`), e `GET /news` responde nos quatro escopos.

## Limitações

- Uma coletiva por vez e a cada 7 dias: um dia com vários gatilhos só atende o de maior prioridade.
- `roundsLeft` da reta final vem do total de rodadas; um jogo remarcado pode errar em 1.
- A promessa de jogo de uma coletiva pós-jogo vale o próximo jogo oficial, qualquer competição.
- As notícias só enxergam o que o dia produziu.
- O seletor de competição da página não lista competições de seleção.
- **A chave de texto de cada resposta revela o tom** (`press.a.<tom>.<variante>`): aceito, o jogo é single-player. A ordem das três
  respostas é embaralhada pela semente da coletiva (`buildConference`, fluxo próprio `:order`; ids posicionais `-a0..-a2`), então a
  posição não diz o tom; a rota nunca manda o campo `tone`.
