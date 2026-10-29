# Transmissão do jogo de um amigo

Status: aprovado e feito na 4.41 (2026-10-29): opção A, fases 1 e 2 juntas, espectadores = membros do mundo (liga de
amigos e mundo público). Origem: report do usuário de 2028-05-02 no mundo dos amigos ("no rivals,
mostrar o broadcast e os gols, cartões e subs dos 2 times, e daqui puxar o gancho para ver o jogo do amigo, por ex.
essa final"). É o item "assistir à partida de um amigo" do "Em breve".

## Problema

- O cartão Rivais mostra o placar ao vivo e os "últimos lances", mas só gol, gol anulado, expulsão, intervalo e fim
  (`LiveMomentKind`). Na final City × Real aos 35' 0–0 a lista dizia "Nothing yet", sem amarelos nem trocas.
- Não há como assistir: a partida solo roda no navegador de quem joga (`PixiPitch` → `advanceSim`). Só a partida entre
  dois técnicos (parte 7) roda no servidor, num worker que já manda frames e estado aos dois técnicos.

## Proposta em duas fases

### Fase 1 — lances completos (pequena)

- `live_score` ganha as fases `yellow` e `sub` (o `red` já existe), com `side`, o nome (`scorer` vira `player`;
  `playerIn` na troca) e o minuto. O `MatchScreen` manda pelos eventos `card` e `substitution` do `gameBus`.
- O servidor valida como hoje (nome de um dos dois elencos, minuto que não volta) e guarda nos `moments` (de 12 para
  20). Amarelo e troca não mudam o placar; contam no limite de eventos por jogo, que subiu de 40 para 80.
- `LiveMoments` mostra os dois times: ícone (bola, cartão amarelo/vermelho, setas da troca), minuto, nome e o lado
  (escudo de 20px). Mesmo popup e mesmo cartão de hoje.
- Também na partida entre dois técnicos (o servidor já emite `friend_live` em nome dos dois assentos).

### Fase 2 — assistir (a transmissão)

Botão **Assistir** na linha do amigo ao vivo (cartão Rivais, faixa da partida ao vivo, aba Rivais do `/world`). Abre
`/watch?save=…&seat=…`: o campo desenhado no modo remoto do `PixiPitch` (o mesmo da parte 7, `remoteInterp.ts`), o
placar, o relógio, as escalações com fôlego e cartões, o Resumo (estatísticas) e os lances. Só leitura: nenhum
controle, nenhuma pausa.

**De onde vêm as posições** (decisão principal):

| Opção | Como | Custo | Recomendo |
|---|---|---|---|
| A. Repasse do navegador de quem joga | O `MatchScreen` manda os frames (posições, 5 por segundo) e o estado (1 por segundo) pelo socket **só quando alguém assiste**; o servidor repassa aos espectadores | Subida ~35 KB/s de quem joga enquanto houver espectador; servidor só repassa | **Sim** |
| B. Toda partida ao vivo roda no servidor | Mover a partida solo para um worker como na parte 7 | Um worker por partida ao vivo de todo jogador; muda a partida solo inteira (pausa, velocidade 2×/4×, aba escondida) | Não |
| C. Só o ticker, sem campo | Fase 1 com estatísticas | Nenhum | É a fase 1 |

Regras da opção A:

- **Liga de amigos e mundo público**: só membros do mesmo mundo assistem; até 8 espectadores por partida.
- O servidor guarda em memória quem assiste cada partida (`watchers: Map<chave, Set<socket>>`). Quando o primeiro
  entra, manda `watch_on` a quem joga; quando o último sai (ou cai), `watch_off`. Sem espectador nada é enviado.
- O formato do fio é o mesmo da parte 7 (`H2HFrame`, `H2HWireState`). `wireState`/`wirePlayer` saem de
  `src/backend/h2h/h2hRooms.ts` para `src/Domain/match/wireState.ts`, para o navegador usar também.
- **Velocidade**: quem joga pode estar em 2× ou 4×. O espectador vê no mesmo ritmo (os frames chegam mais rápido; a
  interpolação usa o tempo de jogo dos frames, não o relógio). Pausa de quem joga = pausa na transmissão, com o selo
  "Pausado pelo técnico".
- **Aba escondida**: a partida continua pelo `simClock` e os frames seguem saindo (o socket não para).
- **Entrar no meio**: o espectador recebe o último estado completo (bancos e estatísticas) guardado pelo servidor e
  depois os frames.
- **Fim**: no `end` a tela mostra o placar final e "Ver resultado" (resultado provisório da gravação, como no grupo).
- **Partida entre dois técnicos**: o servidor já tem os frames; o espectador só entra na lista da sala (`h2hRooms`),
  sem depender de navegador nenhum. Mesmo `/watch`.
- **Limites**: frames de quem joga até 8 KB e no máximo 10 por segundo; o servidor descarta o resto. Validação: o
  remetente tem que ser o assento do jogo ao vivo daquela data (a mesma regra do `live_score`).
- **Áudio, chat**: fora. O chat da liga continua no botão Amigos.

Eventos novos (`ServerEvent` / `ClientEvent`): `watch_join { saveId, seatId }`, `watch_leave`, `watch_on` /
`watch_off` (a quem joga), `watch_frame`, `watch_state`, `watch_event` (os mesmos lances que a parte 7 repassa),
`watch_closed { reason }`.

### Fora (ver depois)

- Assistir um jogo da IA.
- Replay depois do jogo.
- Narração / comentários.

## Testes

- Fase 1: `liveScores.test.ts` (amarelo e troca guardados, nome fora do elenco recusado, não muda o placar),
  `LiveMoments` (ícones), chaves i18n.
- Fase 2: `watchRooms.test.ts` (entrar e sair, `watch_on` só com espectador, limite de 8, não membro recusado,
  remetente errado ignorado, estado completo para quem entra no meio, `watch_closed` no fim e quando quem joga cai),
  `wireState` igual dos dois lados.
- Medição: bytes por segundo de subida com 1 espectador, nas três velocidades; CPU do navegador de quem joga com e sem
  transmissão (meta: menos de 5% a mais).

## Perguntas para o usuário

1. Opção A (repasse do navegador) está ok?
2. Espectadores: só a liga de amigos, ou também o mundo público?
3. Fase 1 sai antes, sozinha, ou junto com a fase 2?
