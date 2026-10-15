# Multiplayer parte 3 — Avanço em grupo

Etapa 43 (#106). Visão geral: `docs/superpowers/specs/2026-10-14-multiplayer-design.md`. Liga de amigos (parte 2):
`docs/superpowers/specs/2026-10-15-multiplayer-world-design.md`. **Sai junto com a parte 2.**

Decisões do usuário (2026-10-15):
- Cada técnico marca **"pronto até"**; o mundo avança enquanto todos estão prontos.
- O **servidor avança sozinho** (não depende de aba aberta), com o progresso pelo WebSocket.
- **Prazo em horas reais por parada** (12 / 24 / 48 h ou sem prazo), definido pelo dono; vencido, o mundo segue e o
  assistente decide pelos atrasados.
- **A partida ao vivo contra a IA continua:** o mundo para no dia do jogo de um técnico; ele joga ao vivo (ou escolhe
  simular) antes de ficar pronto.

Vale só em `mode: "multi"` e `world.phase === "running"`. O solo não muda (Continuar e avanço rápido como hoje).

## 1. Estado

```ts
// SeatState (por assento)
readyUntil?: string | null;     // última data que o técnico aceita jogar sem ele; null = não está pronto
matchDecision?: { date: string; fixtureId: string; mode: "live" | "simulate" };  // o jogo do dia já resolvido

// SaveMeta.world (mundo)
advance?: {
  running: boolean;             // um executor está rodando dias
  waitingSince: string | null;  // ISO de tempo real em que o mundo parou esperando alguém
  target: string | null;        // última data do avanço em curso
};
```

A gravação ao vivo do dia fica em `seats/{seatId}/liveRecording.json` (`{ date, fixtureId, recording }`), apagada
quando o dia passa.

## 2. Regras

- **Pronto até:** `POST /api/worlds/:saveId/ready { until: "tomorrow" | "next_match" | "YYYY-MM-DD" | null }` grava
  `readyUntil` (resolvido para data; `next_match` = véspera do próximo jogo oficial do clube do assento, para parar no
  dia do jogo; sem clube = a data pedida). Datas antes de amanhã → 400. `null` desmarca.
- **Parada de jogo:** um assento com jogo oficial no dia D só deixa o mundo jogar D quando tem `matchDecision` para D
  (`live` com a gravação guardada, ou `simulate`). `readyUntil` nunca cobre D sem isso: o alvo para na véspera.
- **Outras paradas do assento** (o mundo para na data, esperando ele): demissão, proposta de emprego nova, convite de
  seleção, fim da temporada do país dele. Implementadas como "o avanço do dia devolve `stop` para o assento":
  `readyUntil` dele vira `null` e ele precisa marcar de novo.
- **Alvo do avanço:** `target = min(readyUntil de todos os assentos)`; avança dia a dia de `currentDate` até `target`
  (se `target > currentDate`), parando antes de um dia em que algum assento precisa decidir o jogo. Um assento
  desempregado conta como pronto até a data pedida.
- **Prazo:** quando o mundo está parado (`target <= currentDate` por causa de alguém) e há `deadlineHours`, grava
  `waitingSince`. Passado o prazo, cada atrasado é tratado pelo **assistente**: `readyUntil` = o próximo dia útil
  necessário, `matchDecision` = `simulate`, e o dia roda. Coletivas e propostas do atrasado vencem pelas regras de
  sempre; o diretor decide os contratos (responsabilidade padrão). Inbox `world` / `auto_advanced` para ele. O prazo
  recomeça na próxima parada.
- **Concorrência:** um executor por mundo (`withSaveLock` por dia; `advance.running` impede dois). Marcar pronto durante
  um avanço só grava `readyUntil`; o executor relê o alvo a cada dia.

## 3. Executor (`src/backend/groupAdvance.ts`, novo)

- `kickWorld(saveId)`: chamado depois de `ready`, de `match-decision`, da gravação ao vivo, da entrada/saída de membro
  e pelo relógio do prazo. Se o alvo é depois de hoje e não há executor, roda em segundo plano:
  1. lê assentos, calcula o alvo;
  2. roda um dia (`runBufferedDay(saveId, recordings)` com as gravações ao vivo guardadas do dia);
  3. aplica as paradas do resultado (`payloadForSeat`), apaga as gravações e decisões usadas;
  4. manda `world_progress { saveId, date, target, waitingFor: apelidos[] }` pelo socket; repete.
- Erro num dia: para, grava `logError("world", …)`, `advance.running = false`, manda `world_progress` com `error`.
  O próximo `kickWorld` tenta de novo (o dia é idempotente por ser bufferizado).
- **Relógio do prazo:** `startWorldClock()` na subida do servidor, a cada 60 s varre os mundos multi `running` com
  `waitingSince` e prazo vencido e chama `kickWorld` (lista mantida em memória a partir de `world_codes`).
- Na subida do servidor, `advance.running` preso volta a `false`.

## 4. Partida ao vivo

- `match-setup` continua; no multi a resposta inclui a data e o `fixtureId`.
- No fim da partida ao vivo, o cliente manda `POST /api/worlds/:saveId/live-recording { date, fixtureId, recording }`
  (em vez de `/api/advance-day`) → grava a gravação, `matchDecision = live`, e mostra o resultado como hoje. O dia só
  roda quando o executor chegar nele (o resultado oficial vem do dia; a tela de resultado mostra o placar gravado).
- `POST /api/worlds/:saveId/match-decision { date, fixtureId, mode: "simulate" }` para quem não quer jogar.
- Jogo entre dois assentos (409 `seatOpponent` hoje): os dois decidem `simulate` (ou o prazo decide); o motor completo
  joga com as duas táticas (já existe).

## 5. Telas

- **Barra superior no multi:** o Continuar vira **Pronto até…** (menu: amanhã, meu próximo jogo, uma data); sem o
  botão de avanço rápido. Em dia de jogo do clube, o botão é **Jogar** (prévia → partida) com "Simular" no menu.
  Marcado, mostra "Pronto até 12/03 · esperando 2" e permite desmarcar.
- **Faixa do grupo** no topo do Painel e da tela da liga: a data do mundo, o alvo, quem falta (apelidos) e o prazo
  restante ("Avança sem eles em 5 h"). Durante o avanço: "Avançando… 14/03 de 20/03".
- **Tela da liga:** status por membro (pronto até, esperando o jogo, atrasado, sem clube).
- **Resumo:** ao chegar ao Painel depois de um avanço, o resumo dos dias (o `DaySummaryModal` com os dias acumulados
  do assento; `seats/{seatId}/pendingSummary.json` guarda os payloads dos dias rodados sem ele olhar).
- i18n `world.advance.*`.

## 6. Rotas (todas `requireSeat`, só multi; solo → 409 `notMulti`)

| Rota | Faz |
|---|---|
| `POST /api/worlds/:saveId/ready` | Grava `readyUntil`, chama `kickWorld` |
| `POST /api/worlds/:saveId/match-decision` | `simulate` do jogo do dia D (só o próprio jogo, só antes do dia rodar) |
| `POST /api/worlds/:saveId/live-recording` | Guarda a gravação do jogo de D (valida fixture, data e placar) |
| `GET /api/worlds/:saveId/advance` | Estado do grupo: data, alvo, membros e status, prazo restante |
| `POST /api/advance-day`, `/advance-until` | No multi: 409 `groupAdvance` (só o executor avança) |

## 7. Testes

- Puros: cálculo do alvo (mínimo, paradas de jogo, desempregado), resolução de `next_match`, prazo vencido.
- Executor (com assentos de teste): para na véspera do jogo de um assento; segue depois do `simulate`; usa a gravação
  ao vivo no dia certo e a apaga; prazo vencido simula pelo atrasado e manda a mensagem; dois `ready` simultâneos
  rodam um executor só; erro num dia para e libera; parada por demissão/proposta zera o `readyUntil` do assento.
- Rotas: solo 409, datas inválidas, gravação de outro assento/dia 400.
- Fluxo: 3 assentos, 30 dias, com um jogo ao vivo, um simulado e um atraso vencido.
- Medição: tempo real até a próxima parada com 3 assentos em ligas diferentes (anotar na regra).
- Smoke de temporada com 2 assentos: só quando o usuário pedir.

## 8. Limitações

- Um processo de servidor; o executor e o relógio do prazo vivem em memória (a subida do servidor retoma).
- O resultado oficial do jogo ao vivo só aparece no mundo quando o executor roda aquele dia.
- Sem pausa da liga pelo dono (o prazo "sem prazo" já espera todos).
