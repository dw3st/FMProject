# Moral e conversas com jogadores

Spec: `docs/superpowers/specs/2026-10-04-morale-talks-design.md`. Etapa 23 do `docs/ROADMAP.md`, versão **3.8**.
Visual: `.claude/rules/ui-standard.md`. Mecanismo de execução espelhado de `style-training.md`.

## Regra

- Só o **clube do jogador** simula moral (regras, não simulação, para a IA — `.claude/rules/AI-clubs/finance.md`):
  `RosterPlayer.morale` (0..100, início 65), `RosterPlayer.squadStatus` (papel escolhido; ausente = sugerido),
  `RosterPlayer.moraleLog` (janela de minutos, tendência, conversas) e `Squad.moraleClub` (pedidos de conversa e
  promessas). A IA não grava nada e joga no neutro (65 = efeito zero).
- Criação da carreira (`createSave`) e troca de clube (`takeOverClub`): todo o elenco em 65, sem conversas nem
  promessas (`initClubMorale`). Clube que vira IA (`releaseHumanClub`, demissão): tudo some (`stripClubMorale`).
  Jogador que sai do clube do jogador (venda, empréstimo, volta de empréstimo, livre) perde os campos
  (`stripPlayerMorale`); quem chega começa em 65. Start kit: sem moral nos kits (`stripHumanOnly`), o clube do
  jogador recomeça em 65 depois do kit. A pré-simulação do kit (`marketFrozen`) não roda moral.
- `seasonLog.morale` (o buff aleatório antigo de pré-jogo, `computeBuffedStats`) **não** é esta moral e continua
  como estava (calibração do motor intocada). O aviso "moral baixa" do Desenvolvimento passou a ler a moral nova.
- Sem migração (protótipo): campos ausentes = 65 / sugerido / vazio.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/moraleTypes.ts` | `SquadStatus`, `MoraleBand`, `TalkReason`, `TalkAnswer`, `PlayerMoraleLog`, `TalkRequest`, `PlayerPromise`, `ClubMoraleState` |
| `src/Domain/morale/moraleConfig.ts` | Todas as constantes (`MORALE`) |
| `src/Domain/morale/morale.ts` (+ teste) | Puro: faixa, fator, multiplicadores (partida, quickSim, DP, salário), papel sugerido, expectativa e janela de minutos, `moraleDay` (o dia inteiro), `answerTalk`, `afterRenewal`, `refusesRenewal`, `afterListedForSale`, `moraleAttention`, `init/stripClubMorale` |
| `src/GameEngine/Configs/MoraleConfig.ts` | Override de moral por time (lab, `/test`); `matchMoraleOf` |
| `src/GameEngine/Domain/gameState.ts` | `withMoraleExecution` nos atributos do titular e do banco; `GamePlayer.morale` (debug) |
| `src/GameEngine/Domain/SimulateMatch.ts` | `options.morale` (time inteiro); sempre define/limpa o override |
| `src/Domain/advanceDay/quickSim.ts` | `homeMorale`/`awayMorale` → força das linhas |
| `src/backend/moraleWorld.ts` | E/S: `applyMoraleDay` (chamado pelo `advanceDay`), `clubMatchSummary`, `marketAfterRequests` |
| `src/backend/moraleRoutes.ts` (+ `morale.routes.test.ts`) | Rotas (abaixo) |
| `src/backend/advanceDay.ts` | Um passo por dia, depois do mercado e da virada; propostas novas viram `moraleBids`; notícias depois do `clearInbox` |
| `src/backend/contractRoutes.ts` | Revoltado recusa renovar sem promessa (400 `unhappy`); renovação aceita +6 e cumpre a promessa; `demand` traz `moraleBand`/`moraleDemandMult`/`refuses` |
| `src/backend/transfers.ts` | `POST /sell-list`: listar sem ele pedir −8 |
| `src/Domain/negotiation/bids.ts` | Pedido de transferência: chance extra de proposta por dia e faixa de nota mais larga |
| `src/backend/jobWorld.ts`, `SaveService.ts`, `startKits.ts` | Início / fim da moral (troca de clube, carreira nova, kit) |
| `src/GameInterface/Components/MoraleBadge.tsx` | Rosto (`face-*` em `Icons.tsx`) + texto da faixa |
| `src/GameInterface/Morale/*` | `TalkModal`, `PlayerMoralePanel` (ficha), `MoralePromises` (elenco), `PlayerTalkBody` (inbox), `useMorale` |
| `src/GameInterface/SquadRosterTable.tsx` | Coluna Moral e filtro "Só insatisfeitos" (só o próprio elenco) |
| `src/GameInterface/Dashboard/dashboardData.ts`, `HomeCards.tsx` | Cartão Atenção: pedidos de conversa e promessas vencendo (7 dias) |
| `src/GameInterface/Contracts/*` | Renovação mostra a exigência ligada à moral |
| `scripts/morale-measure.ts` | Medição (abaixo) |

## Faixas e efeitos

| Faixa | Moral | DP | Salário pedido |
|---|---|---|---|
| Muito feliz | ≥ 80 | ×1,05 | — |
| Contente | 60–79 | ×1 | — |
| Neutro | 40–59 | ×1 | — |
| Insatisfeito | 25–39 | ×0,95 | +15% |
| Revoltado | < 25 | ×0,9 | +15%, e recusa renovar sem promessa de renovação |

**Partida:** `fator` = (moral − 65)/65 abaixo de 65 (−1 em 0) e (moral − 65)/35 acima (+1 em 100): simétrico, atributos de ×0,98 a ×1,02.
Motor: atributos × (1 + 0,02 × fator), teto 10, por jogador, na montagem do titular e do banco (depois da
execução da familiaridade). Em 65 / ausente a função devolve o **mesmo objeto**: nada muda por construção. O
quickSim só aplica quando recebe a moral de um lado (`homeMorale`/`awayMorale`, o lab): linhas × (1 + 0,02 ×
fator). O avanço de dia nunca passa nada (quickSim é IA × IA).

## Papel no elenco e minutos

- **Sugerido** (`suggestedStatuses`): por linha (GK/DEF/MID/FWD) em ordem de nota; os titulares de um XI ~4-3-3
  (1/4/3/3) são `starter`, os `KEY_COUNT` (3) melhores do elenco que forem titulares viram `key`; abaixo disso, até
  21 anos `youth`, os próximos da linha (0/2/2/1) `rotation`, o resto `backup`. O jogador escolhe na ficha
  (`PUT .../squad-status`, `null` volta ao sugerido).
- **Expectativa** (jogos completos em 5 oficiais): key 4–5, starter 3–4, rotation 2–3, backup 0–1, youth 0–1.
- **Janela:** os minutos das últimas 5 partidas oficiais do clube (liga, copa, continental), por jogador
  (0 quando não jogou), com as mesmas saídas sintéticas do pós-jogo (lesionado sem substituto, expulso:
  `substitutionsWithExits`); vale com ≥ 3 jogos, escalada para 5. Partida em que ele já estava lesionado ou suspenso
  antes do jogo não entra na janela (nem conta para uma promessa de minutos). A janela zera na virada do país do
  clube.
- **Segunda-feira** (só se entrou partida nova na janela desde a última segunda; pausa e entressafra não mexem,
  `moraleLog.newMatches`): acima do topo da expectativa +1 (+2/+3 com 1/2 jogos a mais), dentro 0, abaixo −1,5 por jogo
  faltando (arredondado, pelo menos −1, no máximo −6). Lesionado ou suspenso nunca perde por minutos.

## Variação (`moraleDay`, um dia, nesta ordem)

| Evento | Moral |
|---|---|
| Vitória / derrota do time (todo o elenco) | +1 / −1 |
| Gol (+1 cada), nota ≥ 7,5 (+1) | até +2 por jogo |
| Segunda: minutos × expectativa | −6 … +3 |
| Segunda: deriva para 65 | 5% da distância |
| Promessa cumprida / quebrada | +8 / −15 (quebrada também gera pedido de transferência) |
| Promessa feita | +3 |
| Renovação aceita / conversa de contrato recusada (ou ignorada) | +6 / −10 |
| Listado para venda sem pedir | −8 |
| Elogiar / cobrar (1 vez a cada 30 dias) | +2 / +1 contente, −3 nos demais |
| Recusar (ou deixar o pedido vencer, 14 dias) | −5 |

**Pedido de transferência:** revoltado (< 25) numa segunda pede para sair: entra na lista de venda marcado
(`SellCandidate.requested`) e a inbox avisa. Com o pedido, propostas da IA chegam mais (25% de chance extra por dia
e faixa de nota ±1 em vez de ±0,5), e o clube do jogador vende como um vendedor LOW da IA: pressão financeira 1,0
no `saleContext` e a proposta limitada à taxa que esse vendedor aceita (`buildAiTransferBid` com `seller`). Um
jogador que o técnico listou à mão nunca é marcado nem tirado da lista pelo pedido. É retirado numa segunda com moral ≥ 50 (sai da lista se só estava por pedido;
uma promessa de saída aberta o mantém).

## Conversas (inbox `player`)

O jogador pede conversa (no máximo 2 pedidos novos por semana somando todos os motivos, inclusive `wants_move`,
`moraleClub.week`; um aberto por jogador, 28 dias de silêncio depois
de respondido):

| Motivo | Quando | Respostas |
|---|---|---|
| `minutes` | segunda, moral < 40 e abaixo da expectativa | prometer minutos, prometer saída, elogiar, recusar |
| `contract` | segunda, key/starter a ≤ 183 dias do fim do contrato, sem promessa de renovação | prometer renovação, elogiar, recusar (−10) |
| `wants_move` | proposta da IA por ele no dia, moral < 60 ou o clube é mais forte | prometer saída, elogiar, recusar |
| `chance` | segunda, `youth` com moral ≥ 70 e notas recentes ≥ 6,8 e subindo | prometer minutos, elogiar, recusar |
| (sem pedido) | botão "Conversar" da ficha | elogiar, cobrar |

**Promessas** (`Squad.moraleClub.promises`, na ficha, no bloco "Promessas" do Elenco e no cartão Atenção):

- **Minutos:** joga (entra em campo) X das próximas 5 partidas oficiais; cumprida assim que chega a X, quebrada
  quando não dá mais.
- **Saída:** entra na lista de venda (pedido) e precisa sair (venda ou empréstimo) em 14–120 dias (padrão 60).
  Saiu: a promessa acaba. Passou do prazo: quebrada.
- **Renovação:** abre a renovação na hora; renovar em 30 dias cumpre (+6 + 8), senão quebrada.

## Rotas (`requireSaveOwner`; escrita com `withSaveLock`; sem clube → 409 `noClub`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/morale` | Por jogador: moral, faixa, papel (e o sugerido), expectativa, jogos na janela, tendência de 7 dias, pedido de transferência, respostas aceitas; pedidos e promessas |
| `POST /api/saves/:id/talks/:playerId { answer, minutes?, days? }` | Responde o pedido (ou conversa livre). 400 `invalidAnswer`/`invalidMinutes`/`invalidDays`/`onLoan`, 404 `notYourPlayer`. `promise_sale` lista como pedido; `promise_renewal` devolve `openRenewal` |
| `PUT /api/saves/:id/players/:playerId/squad-status { status \| null }` | Papel no elenco |

## Telas

- **Elenco:** coluna Moral (rosto + faixa) e chip "Só insatisfeitos"; bloco "Promessas" com pedidos e promessas.
- **Ficha (próprio jogador):** moral com valor e tendência de 7 dias, expectativa × jogos, pedido de transferência,
  papel (chips Auto/5 papéis), promessas, botão "Conversar"/"Responder" (`TalkModal`).
- **Inbox:** categoria `player` (`talk` com o botão Responder enquanto o pedido está aberto, `promise_kept`,
  `promise_broken`, `transfer_request`).
- **Painel:** cartão Atenção lista pedidos de conversa e promessas vencendo em 7 dias.
- **Renovação:** aviso "Insatisfeito: pede 15% a mais" ou "não renova sem promessa".
- i18n: `morale.*`, `inbox.categories.player`, `contracts.refusal.unhappy` (en, pt-BR).

## `/test`, `/lab`

- `/test`: seletor de moral por time ("Roster" = cada jogador com a própria, ou 0/25/50/65/80/100 para o time
  inteiro, via override); o `EnergyPanel` mostra a moral média e o multiplicador de atributos; cenário `morale-gap`
  (A em 100, ×1,02; B em 20, pelo próprio elenco); o painel QuickSim recebe a moral dos dois lados.
- `/lab`: `Variant.morale` (slider, ausente = 65) → `simulateMatch(..., { morale })` e `homeMorale/awayMorale` no
  quickSim; rótulo `· mor N`; linha "Morale" no `PairDetail` (`TeamRawStats.morale` → `avgMorale`).
- Nenhuma estatística nova em `Statistics.ts`: o efeito aparece em vitórias, gols e chutes.

## Medição (`bun scripts/morale-measure.ts`)

Motor completo, `premier_league`, pares aleatórios, os dois lados `balanced` e 4-3-3, fôlego 88; cada par joga duas
vezes com a moral trocada (mesmo mando). "V−D" = vitórias − derrotas do lado testado. O motor não tem semente: 4
processos de 400 somados (`--out`/`--sum`); erro padrão da vitória ±1,2 p.p. em 1600 jogos, ±1,7 em 800.

| Confronto | jogos | V / E / D do lado testado | V−D | gols | chutes |
|---|---|---|---|---|---|
| 100 × 65 | 1600 | 40,7 / 26,4 / 32,9 | +7,8 | 1,22–1,08 | 2,89–2,56 |
| 25 × 65 | 800 | 34,0 / 26,4 / 39,6 | **−5,6** | 1,08–1,18 | 2,60–2,77 |
| 65 × 65 (`--engine-seed 11`) | 200 | 35,0 / 27,5 / 37,5 | −2,5 | 1,20–1,27 | 2,65–2,76 |
| sem moral nenhuma (`--baseline --engine-seed 11`) | 200 | 35,0 / 27,5 / 37,5 | −2,5 | 1,20–1,27 | 2,65–2,76 |

- **65 × 65 é idêntico à partida sem moral**, jogo a jogo, com o mesmo `Math.random` semeado (fator 0: a função
  devolve o mesmo objeto, nenhum sorteio a mais).
- **25 × 65:** −5,6 p.p. em V−D (≈ −2,8 p.p. em vitórias, a métrica da familiaridade (V − D)/2): dentro da faixa
  ±2–4 do spec. Atributos × 0,988.
- **100 × 65 (fator +1, atributos ×1,02):** 1600 jogos, V/E/D 40,7 / 26,4 / 32,9, **V−D +7,8** (≈ +3,9 p.p. em
  vitórias, (V − D)/2), gols 1,22–1,08, chutes 2,89–2,56: dentro da faixa ±2–4. Na primeira versão (fator +0,5,
  ×1,01) o lado feliz não se distinguia do ruído (V−D −0,1 em 1600 jogos); por isso ficou simétrico.
- quickSim (20 000 jogos pareados, mesma semente): 100 × 65 V−D +1,0 (fator +1); 25 × 65 −0,4; 65 × 65 e sem moral idênticos
  (37,1/25,9/37,0). O efeito no quickSim é pequeno (força × 1 ± 0,012, expoente de força 0,29) e só existe no lab.

```
bun scripts/morale-measure.ts premier_league 400 --high 100 --low 65 --seed 1 --out a.json
bun scripts/morale-measure.ts --sum a.json,b.json
bun scripts/morale-measure.ts premier_league 200 --high 65 --low 65 --engine-seed 11   # = --baseline --engine-seed 11
bun scripts/morale-measure.ts premier_league 20000 --high 25 --low 65 --quick
```

## Testes e smoke

```
bun test src/Domain/morale src/GameEngine/Domain/Morale.engine.test.ts src/backend/morale.routes.test.ts \
  src/Domain/advanceDay/quickSim.test.ts src/Domain/negotiation src/lab/familiarityLabel.test.ts src/backend/jobs.test.ts
```

`scripts/season-rollover-smoke.ts`, seção "Moral": todo jogador do clube do jogador com moral em 0..100 todo dia,
nenhum clube da IA grava moral, pelo menos um pedido de conversa na temporada e uma promessa resolvida (o smoke
responde os primeiros pedidos com uma promessa: minutos, renovação ou saída, conforme o motivo).

## Limitações

- O peso da torcida no resultado é ±1 fixo (sem clássico/expectativa).
- Uma promessa de saída cumprida não dá +8 (o jogador já saiu); o empréstimo também conta como saída.
- Equilíbrio: na temporada, titular regular de clube que vence ainda tende a 85–100 (minutos +1 por semana com jogo
  e resultados positivos superam a deriva de 5%); nas pausas e na entressafra só a deriva age, puxando para 65.
- Pedidos de conversa abertos na virada do país do jogador são reenviados depois do `clearInbox` (id estável
  `player-talk-<talkId>`).

## Personalidade (Etapa 26)

Temperamento escala todo delta de evento (`withEventDelta`, ×1 ± 0,25), ambição o déficit de minutos e os limiares
(pedido de transferência `25 + 8 × t`, `wants_move` `60 + 10 × t`, clube mais forte só com ambição ≥ 13), lealdade o
listado sem pedir (×1 + 0,5 t) e a promessa quebrada (×1 − 0,3 t); leal (≥ 15) não pede transferência por moral e
só quer sair com moral < 40; profissional ignora a perda de DP por moral baixa e aceita bem "cobrar". Ver
`.claude/rules/game/personality.md`.

## Responsabilidades (Etapa 30, 4.6)

Com o diretor cuidando dos contratos, a conversa de motivo `contract` não vira pedido nem mensagem: `moraleDay` recebe
`directorContractTalk` e responde na hora (+3 se ele renova, −10 se não). Ver `.claude/rules/game/responsibilities.md`.

## Prêmios (Etapa 32)

`afterAward(squad, playerId, kinds)`: o premiado do clube do jogador ganha moral pelo `withEventDelta` (melhor jogador /
mundial +10, revelação / artilheiro / goleiro +8, seleção +5, gol da temporada +4; o maior prêmio da virada). Ver
`.claude/rules/game/awards.md`.

## Torneios de base (Etapa 36)

`moraleLog.youthMinutes` guarda os minutos dos últimos 5 jogos de base (`.claude/rules/game/youth-competitions.md`). Na
segunda, para `youth`, `backup` e `rotation` com déficit, a base reduz a perda por minutos (`p + 0,5 × y`), nunca dá
bônus; zera na virada como `minutes`.
