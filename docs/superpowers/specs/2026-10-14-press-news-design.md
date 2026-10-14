# Etapa 42 — Imprensa e notícias

Versão alvo **4.23**. Decisões do usuário (2026-10-14): coletivas só em momentos marcantes; efeito escondido; página de
notícias do mundo inteiro mais a repercussão das coletivas; efeitos em moral, diretoria e torcida (nada dentro da
partida); a coletiva chega pela caixa de entrada. Visual: `.claude/rules/ui-standard.md`.

## 1. Regra

- Só o **clube do jogador** tem coletivas (técnico de clube; seleção fica de fora). A IA não tem nada.
- A coletiva é um **convite na inbox** (categoria `press`, tópico `actions`, nunca filtrado) com o botão "Responder",
  que abre um modal com 2–3 perguntas de 3 respostas cada. A tela mostra só o texto das respostas; o efeito não é
  mostrado. Ele aparece depois nos medidores e nas manchetes.
- **Notícias do mundo**: geradas no fim de cada dia só do que o jogo já guarda (nada é simulado a mais), gravadas por
  mês, mostradas na página `/news` e num cartão do Painel.
- Sem efeito dentro da partida: `/test`, `/lab`, motor e quickSim não mudam.
- Sem migração (protótipo): `SaveMeta.press` ausente = nenhuma coletiva ainda; sem `news/` = página vazia.

## 2. Gatilhos (`src/Domain/press/triggers.ts`, puro)

Avaliados no avanço do dia, para jogos **oficiais** (liga, copa, continental) do clube do jogador.

**Antes do jogo** — quando o jogo é daqui a 2 dias (convite na véspera, que vence no fim da véspera; jogo de amanhã sem convite fica sem coletiva):

| Gatilho | Condição |
|---|---|
| `derby` | `isDerby` (mesma cidade, ou o adversário é o líder da liga) |
| `knockout` | copa nacional a partir das quartas (`qf`, `sf`, `final`); qualquer fase de mata-mata continental |
| `run_in` | jogo de liga numa das 3 últimas rodadas do clube, com o clube a ≤ 3 pontos de uma fronteira que importa: título (1º), última vaga continental, última vaga de acesso, primeira vaga de rebaixamento |
| `ultimatum` | `board.ultimatum` em andamento |

**Depois do jogo** — no dia seguinte ao jogo (ou à virada):

| Gatilho | Condição |
|---|---|
| `title` | título de liga, copa ou continental do clube |
| `promoted` / `relegated` | virada do país do clube |
| `heavy_defeat` | derrota por 3 gols ou mais |
| `eliminated` | eliminado num mata-mata (copa ou continental) |
| `winless` | o jogo completou 5 oficiais seguidos sem vitória (só no 5º, 10º… da sequência) |
| `upset` | vitória com `matchExpectation` ≤ −0,5 ou derrota com ≥ +0,5 |

**Limite**: uma coletiva a cada 7 dias (`press.lastDate`). Vários gatilhos no mesmo dia: vale um, pela prioridade
`title` > `promoted` = `relegated` > `ultimatum` > `knockout` = `eliminated` > `derby` > `heavy_defeat` > `run_in` >
`winless` > `upset`. Título ignora o limite de 7 dias. Uma coletiva pendente nunca é substituída (o novo gatilho se
perde, salvo título, que encerra a pendente como ignorada e abre a sua). Desempregado: nada.

## 3. Perguntas (`src/Domain/press/questions.ts`, puro)

- Banco por gatilho, 2–3 perguntas sorteadas (`seedFrom(save:press:<id>)`), parâmetros já resolvidos na criação
  (adversário, placar, fase, competição, jogador citado). Texto por chave i18n (`press.q.<chave>`), 2 variantes por
  pergunta.
- Tipos de pergunta e as 3 respostas (tom guardado, nunca mostrado):

| Tipo (`topic`) | Respostas (`tone`) |
|---|---|
| `match` (jogo / momento) | `confident` · `cautious` · `provocative` (clássico) ou `blame_self` (derrota/eliminação) |
| `squad` (elenco) | `defend_squad` · `demand_squad` · `neutral` |
| `player` (destaque: melhor nota do último jogo, artilheiro da temporada, quem falhou — mais gols sofridos/pior nota) | `praise` · `criticize` · `protect` |
| `job` (cargo/diretoria; ultimato e `winless`) | `job_confident` · `ask_signings` · `deflect` |

- Toda coletiva tem uma pergunta `match`; `player` aparece quando há um destaque claro; `job` só em `ultimatum` e
  `winless`. As respostas também têm texto por chave (`press.a.<tone>`, variantes por tipo de gatilho).
- `PressQuestion { id, topic, key, params, playerId?, answers: { id, key }[] }` — o tom fica só no servidor
  (`answer.id` → tom pela tabela do gatilho), nunca no JSON do cliente.

## 4. Efeitos (`src/Domain/press/effects.ts`, puro; constantes em `pressConfig.ts`)

Aplicados na hora da resposta, numa única chamada. Moral pelo mesmo caminho dos eventos de moral (temperamento escala,
nova exportada `afterPressAnswer(squad, ids | "all", delta)` em `morale.ts`); diretoria e torcida por
`applyPressEffect(state, board, fans)` em `boardFans.ts` (mesmo `moveMeters`, ganhos decrescentes acima de 60).

| Tom | Moral | Diretoria | Torcida | Promessa |
|---|---|---|---|---|
| `confident` | elenco +1 | — | +1 | vitória no próximo jogo (`win`) |
| `cautious` | — | — | — | — |
| `provocative` | elenco +1 | −1 | +2 | vitória (`win_bold`) |
| `blame_self` | — | −0,5 | +1 | — |
| `defend_squad` | elenco +2 | −1 se fase ruim (`heavy_defeat`, `winless`, `eliminated`, `ultimatum`) | — | — |
| `demand_squad` | elenco −2 | +1 | +1 | — |
| `neutral` | — | — | — | — |
| `praise` | jogador +4 | — | — | — |
| `criticize` | jogador −4 (profissionalismo ≥ 13: +1) | — | — | — |
| `protect` | jogador +2 | — | — | — |
| `job_confident` | — | +1 | — | meta da temporada (`objective`) |
| `ask_signings` | — | −2 | +1 | — |
| `deflect` | — | — | — | — |
| **ignorar** (vence sem resposta) | — | −1 | — | — |

**Promessas** (`press.promises`, no máximo uma de cada tipo aberta):

| Promessa | Resolvida | Cumprida | Empate | Quebrada |
|---|---|---|---|---|
| `win` | no próximo jogo oficial | torcida +3, diretoria +1 | torcida −1 | torcida −4, diretoria −2 |
| `win_bold` | idem | torcida +5, diretoria +1 | torcida −1 | torcida −6, diretoria −2 |
| `objective` | virada do país do clube (`evaluateSeason` cumpriu/falhou) | diretoria +3, torcida +3 | — | diretoria −4, torcida −4 |

Numa coletiva pós-jogo, `win` / `win_bold` valem para o próximo jogo. Promessa resolvida gera notícia de
repercussão. Troca de clube ou demissão descarta a pendente e as promessas (sem efeito).

## 5. Dados e fluxo

```ts
SaveMeta.press?: {
  pending?: PressConference;            // { id, trigger, kind: "pre" | "post", fixtureId?, date, expires, questions }
  lastDate?: string;
  promises: PressPromise[];             // { id, kind: "win" | "win_bold" | "objective", from, fixtureId?, season? }
  history: PressRecord[];               // últimas 20: { id, date, trigger, answers: { questionId, tone }[] | "ignored" }
}
```

- `expires` (última data em que vale a resposta, até o fim do dia): pré-jogo = a véspera do jogo (nunca respondida no dia do jogo, com o placar à vista); pós-jogo = 3 dias depois.
- **Avanço do dia** (`src/backend/pressWorld.ts`, chamado em `advanceOneDay` depois da moral e da diretoria):
  1. coletiva pendente vencida → ignorada (diretoria −1, notícia `press_absent`);
  2. promessas `win`/`win_bold` resolvidas pelo jogo do clube de hoje; `objective` na virada do país;
  3. gatilhos pós-jogo (jogos de hoje, títulos, virada) e pré-jogo (jogos daqui a 2 dias);
  4. coletiva nova → mensagem `press` / `invite` depois do `clearInbox`.
- Rotas (`src/backend/pressRoutes.ts`, dono do save; POST com `withSaveLock` e `BufferingSaveDAL`):

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/press` | `{ pending: { id, trigger, kind, date, expires, questions (sem tom, ordem das respostas embaralhada) } \| null, history: { id, date, trigger, answered }[] }` |
| `POST /api/saves/:id/press/:pressId { answers: { questionId, answerId }[] }` | Aplica os efeitos, grava a repercussão, fecha a coletiva. 409 `pressClosed` (inexistente/vencida/respondida), 400 `invalidAnswers` (falta pergunta, id desconhecido, repetido), 409 `noClub` |

- A mensagem `press`/`invite` some como pendente (o botão vira "Respondida"/"Encerrada") quando a coletiva fecha.

## 6. Notícias

**Geração** (`src/Domain/news/buildDayNews.ts`, puro): recebe o que o dia produziu e devolve `NewsItem[]`.

| `kind` | Fonte | Regra |
|---|---|---|
| `thrashing` | `StoredDayLog.events` | diferença ≥ 4, liga de nível 1 ou continental |
| `upset` | idem + `clubLevel` dos dois | vencedor com nível ≥ 0,6 abaixo, nível 1, copa ou continental |
| `champion` / `promoted` / `relegated` | virada (plano do país) e campeões de copa/continental | nível ≤ 2 para acesso/rebaixamento; campeão de qualquer nível |
| `new_leader` | tabela antes × depois do dia | liga do jogador e seguidas, a partir da 5ª rodada |
| `big_transfer` | `StoredDayLog.transfers` | taxa ≥ €20M, ou jogador no top 100, ou recorde de contratação do clube comprador |
| `manager_sacked` / `manager_hired` | eventos do `aiManagerDesk` | clubes de nível 1 e seleções |
| `award` | `recordLeagueAwards` / cerimônia | melhor jogador da liga (nível 1) e os mundiais |
| `star_injury` / `star_retired` | lesões graves do dia / aposentados | jogador no top 100 do mundo |
| `national` | competições nacionais | campeão de torneio; favorito (top 8 do Elo) eliminado |
| `club_record` | recordes batidos | clube do jogador e clubes de nível 1 |
| `press_*` | coletiva | `press_quote` (resposta marcante: provocação, cobrança, elogio, pedido de reforços), `press_absent`, `press_promise_kept`, `press_promise_broken` |

- `NewsItem { id, date, kind, importance: 1 | 2 | 3, country?, league?, competition?, clubIds, playerIds, params }`;
  `params` guarda os nomes do dia (clubes, jogadores, placar, valor). Texto por chave `news.<kind>.<n>` (2–3 variantes,
  `n` pelo hash do id), título + uma linha.
- Importância: 3 = título, coletiva do jogador, mundial, transferência ≥ €60M; 2 = demais da liga do jogador/seguidas
  e continental; 1 = o resto.
- Tetos por dia: no máximo 3 por liga (maior importância primeiro, desempate id) e 30 no mundo; coletiva do jogador
  sempre entra.
- **Gravação**: `saves/{id}/news/{AAAA-MM}.json` (`NewsItem[]`, mais novo no fim), DAL bufferizado (fase 1 do flush);
  idempotente por `id` (`<data>:<kind>:<chave>` — um dia refeito não duplica). Meses com mais de 12 de idade são
  apagados na virada do mês.
- Rota `GET /api/saves/:id/news?scope=all|club|league|followed&competition=<slug>&before=<data>&limit=<1..100>`
  (dono do save; padrão `all`, 40): `{ items, nextBefore }`, mais novos primeiro. 400 para parâmetro inválido.

## 7. Telas

- **`/news`** (`src/pages/news`, `NewsScreen`, sem aba na barra superior): `ScreenTitle` "NOTÍCIAS DO **MUNDO**" /
  "WORLD **NEWS**"; `OptionChips` Tudo · Meu clube · Minha liga · Seguidas; `SelectCombobox` "COMPETIÇÃO"; lista
  agrupada por dia (rótulo do dia), cada notícia com escudo 32px (ou bandeira para seleção), manchete em
  `font-semibold`, uma linha `text-muted-foreground`, importância 3 com borda `border-primary`; "Carregar mais".
- **Painel**: cartão "Notícias" com as 5 mais recentes (importância ≥ 2 primeiro) e "Ver todas"; entra depois da
  Caixa de entrada.
- **Modal da coletiva** (`Press/PressModal.tsx`): título da coletiva ("COLETIVA · CLÁSSICO"), cada pergunta com as 3
  respostas em cartões de escolha; "Enviar" só com todas respondidas; depois, "Respostas enviadas" (sem efeito).
- **Inbox**: corpo `press` com o gatilho, o adversário/jogo e o botão Responder (ou o estado).
- i18n `press.*`, `news.*`, `screenTitles.news`, `inbox.categories.press` (en, pt-BR).

## 8. Testes e smoke

```
bun test src/Domain/press src/Domain/news src/backend/press.routes.test.ts src/backend/press.advanceDay.test.ts \
  src/backend/news.routes.test.ts src/Domain/morale src/Domain/boardFans
```

- Puros: gatilhos e prioridade, limite de 7 dias, título furando o limite; sorteio determinístico de perguntas; tom
  nunca na visão do cliente; cada tom move o que a tabela diz (e nada mais); promessas cumpridas/empate/quebradas;
  `buildDayNews` com tetos, importância e ids estáveis.
- Rotas: dono, 409 fechada/respondida/vencida, 400 respostas inválidas, efeito aplicado uma vez.
- Avanço do dia: convite pré-jogo 2 dias antes do clássico; ignorada vence na véspera e cai no avanço da véspera (−1); promessa resolvida
  pelo jogo; notícias gravadas sem duplicar num dia refeito.
- Smoke (`season-rollover-smoke.ts`, seção "Imprensa"; só quando o usuário pedir): houve coletivas, todas respondidas
  pela rota ou ignoradas; nenhuma coletiva da IA; promessas resolvidas; notícias em todos os meses da corrida, nenhum
  dia acima de 30 nem liga acima de 3; a página carrega por escopo.

## 9. Limitações

- O texto é por modelos (sem geração livre); a variedade vem das variantes.
- A repercussão é só manchete: não há opinião de jornalistas nem reação de técnicos adversários.
- Coletivas de seleção ficam de fora.
