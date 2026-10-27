# Multiplayer parte 7: partida ao vivo entre dois técnicos

Aprovado com o usuário em 2026-10-27. Depende das partes 1–6 (`.claude/rules/game/multiplayer.md`). Versão alvo **4.36**.

## Decisões do usuário

| Pergunta | Escolha |
|---|---|
| Como os dois se encontram | A: sala de espera; quem clica em "Jogar ao vivo" espera o outro, que recebe um aviso; começa quando os dois clicam em Começar; Simular por qualquer um encerra a sala |
| Ritmo | B: velocidade fixa (normal, ~7 min); 3 pausas de até 30 s por técnico |
| Queda no meio | B: o jogo não para; o auxiliar assume na hora; o técnico retoma quando volta |
| Arquitetura | 1: o servidor roda a partida (um worker por partida) e manda o estado aos dois navegadores |

## 1. Fluxo

1. **Prévia** de um jogo contra outro assento: `Jogar ao vivo` e `Simular`. `POST /api/match-setup?live=1` deixa de dar 409 `seatOpponent` para o jogo do clube (o jogo de seleção entre dois técnicos continua só simulado).
2. **Sala** (`/match-room`, título "SALA DO **JOGO**"): os dois escudos e técnicos com o estado (`away` fora, `in` na sala, `ready` pronto), atalhos para Formação e Táticas, `Começar` e `Simular`.
3. Entrar na sala avisa o outro: aviso no canto (`h2h_invite`, socket), mensagem `world` / `h2h_invite` na caixa e o "Pronto até" do outro vira `Entrar no jogo`.
4. A partida começa quando os dois estão `ready`. Até lá cada um pode mudar a tática salva (o worker lê a tática do assento na largada).
5. **Simular** (sala, prévia ou barra), por qualquer um: o jogo vira simulado para os dois (`matchDecision` simulate nos dois assentos), a sala fecha e o outro recebe `h2h_closed { reason: "simulated" }`. A sala não tem prazo próprio: o prazo do grupo vale; o assistente que simula fecha a sala.
6. **Partida:** velocidade fixa 1×. Cada técnico tem `H2H.PAUSES` (3) pausas de até `H2H.PAUSE_SECONDS` (30) s; durante a pausa os dois mexem no time; só quem pausou retoma antes do fim.
7. **Controles de cada um:** substituições (entram na próxima bola parada), troca de posição, tática ao vivo, mentalidade, formação, instruções e marcação individual. Os mesmos da partida sozinha.
8. **Queda:** sem socket do técnico, o worker liga `autoSubs[lado]` (troca da IA). Ao voltar, ele recebe o estado completo e `autoSubs` desliga (salvo técnico suspenso, que fica sempre no auxiliar).
9. **Fim:** o worker monta a gravação (`buildPlayedMatchRecording`, a mesma da partida ao vivo) e o servidor grava como `liveRecording` do assento mandante e `matchDecision: live` nos dois. O dia usa essa gravação quando o grupo avança. Os dois vão para o resultado (`/match-result?pending=1`).
10. **Rivais:** os outros membros recebem o placar ao vivo da partida pelos mesmos `friend_live` (o servidor emite em nome dos dois assentos; os `live_score` dos navegadores dessa partida são ignorados).
11. **Servidor reiniciado:** a partida em memória se perde; ao subir, as salas somem e os dois assentos voltam a ter o jogo sem decisão (nada foi gravado). Mensagem `h2h_lost` na caixa dos dois.

Fora desta versão: seleção ao vivo entre dois técnicos, espectadores, velocidade 2×/4×.

## 2. Arquitetura

### Montagem da partida (compartilhada)

Hoje o `MatchScreen` monta o `GameState` inicial no cliente a partir da resposta do `match-setup` (lineups, formações, tática, familiaridade, moral, gramado, clima, árbitro, inscrição, cobradores, disciplina do técnico, instruções e marcação). Essa montagem sai para uma função pura `buildLiveMatchState(input)` (`src/Domain/match/liveMatchSetup.ts`) com um lado por time (`A` = casa, `B` = visitante). O `MatchScreen` solo passa a usá-la (comportamento idêntico); o worker usa a mesma com os dois lados humanos.

Do lado do servidor, a parte do `match-setup` que monta os dados de um assento sai para `matchSetupFor(saveId, seatId, { live })` (`src/backend/matchSetup.ts`), usada pela rota (sem mudança de resposta) e pela sala (uma vez por assento, cada um com a sua tática, instruções e marcação).

### Worker por partida

- `src/backend/h2h/h2hWorker.ts` (Bun `Worker`): isola os globais do motor (`gameBus`, configs de tática por time, `Statistics`, `PlayerRating`). Recebe `init { setup }`, comandos e `pause/resume`; roda `advanceSim` a cada `H2H.TICK_MS` (50 ms) com o tempo real × 1.
- Mensagens para o processo principal: `frame` (posições + bola + relógio, a cada `H2H.FRAME_MS` 100 ms), `state` (o `GameState` sem campos de debug, a cada 1 s e depois de cada lance), `event` (lances do `gameBus` que a tela usa: gol, gol anulado, cartão, falta, impedimento, lesão, substituição, VAR, intervalo, fim), `done { recording }`.
- `src/backend/h2h/h2hRooms.ts` (processo principal): salas em memória por `saveId:fixtureId`, estado da sala, sockets dos dois técnicos, encaminha frames/estado/eventos, valida comandos (o técnico só mexe no próprio lado), aplica pausas (contagem e tempo), liga/desliga o auxiliar, grava o resultado. Um worker por partida; termina no `done` ou se os dois técnicos saírem da sala antes de começar.

### Socket (`/api/ws`)

Cliente → servidor: `h2h_join { saveId, fixtureId }`, `h2h_ready`, `h2h_cmd { cmd }` (sub, swap, tactics, mentality, formation, instructions, marking), `h2h_pause`, `h2h_resume`, `h2h_leave`.
Servidor → cliente: `h2h_room { room }`, `h2h_invite { saveId, fixtureId, from }`, `h2h_frame`, `h2h_state`, `h2h_event`, `h2h_paused { by, until, left }`, `h2h_closed { reason }`, `h2h_done`.
Limites: comandos 20 por 10 s por socket; frames maiores que 8 KB ignorados.

### Navegador

- `PixiPitch` ganha a prop `remote`: não simula (não chama `advanceSim`), desenha o `GameState` que chega e interpola as posições entre dois `frame` (o mesmo `renderInterp` de hoje, com o passo = intervalo dos frames).
- `MatchScreen` com `mySide: "A" | "B"` (hoje fixo em A): lista do time, controles, painel de substituição e tática agem no lado do técnico; o campo continua virado com a casa à esquerda (`mirror` quando ele é visitante, como hoje). Os `h2h_event` são reemitidos no `gameBus` local, então Resumo, avisos, mapa de posse e estatísticas funcionam sem mudança.
- `src/GameInterface/H2H/*`: `MatchRoomScreen`, `useH2HRoom` (socket), `PauseBar`.

## 3. Telas

- Prévia contra outro técnico: `Jogar ao vivo` / `Simular`; com o outro na sala, "Fabio está te esperando" e `Entrar`.
- Sala: escudos, técnicos e estados, atalhos para Formação e Táticas, `Começar`, `Simular`, linha de estado ("Esperando o Fabio entrar", "Fabio está pronto").
- Aviso no canto e caixa de entrada para o outro; barra de cima com `Entrar no jogo`.
- Partida: sem velocidade; `Pausar · 2`; faixa "Fabio pausou · 0:24" (`Retomar` para quem pausou); selo "Fabio saiu · auxiliar no comando"; técnico adversário com o rosto dele.
- Resultado: a tela de sempre, para os dois.

## 4. Medições, testes, limites

- **Medições:** CPU e memória do servidor com 1 e 3 partidas simultâneas; bytes por segundo por navegador; 200 partidas pelo worker contra `simulateMatch` com os mesmos times (gols por jogo dentro do ruído).
- **Testes:** `buildLiveMatchState` igual à montagem antiga (mesmo estado inicial); sala (entrar, pronto, começar, simular, prazo do grupo, saída antes de começar); comandos (dono do lado, limite e tempo das pausas, retomada só por quem pausou); queda e volta (auxiliar liga/desliga); gravação usada pelo dia; ponta a ponta com dois usuários (localhost e 127.0.0.1).
- **`/test`, `/lab`:** nada muda (mesma mecânica, outro lugar).
- **Limites:** um processo só (salas e workers em memória); servidor reiniciado = partida perdida (pode ser jogada de novo); sem espectadores; seleção fora; sem 2×/4×.
