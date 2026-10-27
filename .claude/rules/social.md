# Amigos e chat

Spec: `docs/superpowers/specs/2026-10-14-friends-chat-design.md`. Etapa 44 do `docs/ROADMAP.md` (#153), versão
**4.24**. Visual: `.claude/rules/ui-standard.md`. Por **usuário**, não por save.

## Regra

- Apelido único (3–20, `[A-Za-z0-9_.-]`, sem diferenciar maiúsculas, sem `admin`/`fmproject`/`westlab`/moderador e
  afins, nem começar com `fm-`, o formato do código de amigo — um apelido igual a um código aparecia no chat como se fosse
  o código), escolhido no primeiro acesso (o `AuthGate` mostra `NicknameSetupScreen` enquanto `/api/auth/me` tem `nickname: null`) e **fixo** depois disso: fica atrelado à conta (e-mail) para sempre,
  sem troca (`nickname_changed_at` guarda a data da escolha). Um apelido gravado que uma regra nova tornou inválido
  aparece como ausente no `/me` e pode ser trocado uma vez por um válido. Código de amigo `FM-XXXX-XXXX` (base32 sem
  0/1/I/O), gerado na primeira chamada de `GET /api/social/me`.
- Amizade só por pedido aceito (apelido ou código); pedido cruzado vira amizade na hora. Máximo 200 amigos e 50
  pedidos enviados pendentes.
- Bloqueio: desfaz a amizade e os pedidos entre os dois; o bloqueado não acha o outro, não pede nem escreve (404 /
  403, nunca "bloqueado"); com bloqueio em qualquer sentido, o histórico e a marca de leitura do DM respondem 403 aos
  dois (`canRead`); numa sala de mundo as mensagens do bloqueado somem para quem bloqueou (histórico e socket).
  Desbloquear não refaz a amizade.
- Salas internas `dm:<idA>:<idB>` (ids em ordem) e `world:<saveId>`. O cliente só vê `dm:<apelido do outro>` e
  `world:<saveId>`. DM: escreve quem é amigo sem bloqueio; o participante lê o histórico enquanto não houver bloqueio
  (sem amizade e sem bloqueio, o histórico antigo continua legível). Mundo: dono ou membro
  (`save_members`, `isSaveMember`) de um mundo com 2+ membros.
- Limites por usuário (429 `rateLimited`): mensagens 10 a cada 10 s, pedidos de amizade 20 por hora (contados antes da
  busca do alvo: um apelido ou código inexistente também gasta), buscas 30 por minuto. Corpo acima de 8 KB: 413
  `tooLarge` (pelo `Content-Length` antes de ler e pelos bytes lidos).
- Mensagem: texto puro de 1–500 caracteres, apagadas depois de 90 dias
  (`startSocialMaintenance`, na subida e a cada 24 h).
- Status de amigo: `playing` (com o clube do save aberto numa aba, `hello`), `online` (visto nos últimos 2,5 min, pelo
  ping do socket ou pelo `POST /api/presence/ping`), `offline`. Só amigos recebem. Abrir o socket não marca presença:
  só o `ping` e o `hello` de uma aba visível (`hello { hidden: true }` não marca). Fechar o socket que mostrava um
  clube espera 15 s (carência) antes de publicar: um recarregar não faz o status piscar.
- `chat_messages.meta` (JSON, migração só aditiva): uma resenha guarda `{ taunt }` (ids e placar real) e
  `ChatMessageView.taunt`; o `body` é o fallback em inglês. Nenhum texto livre além do próprio chat.
- Nenhuma resposta nem evento carrega e-mail ou id de usuário.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/social/socialConfig.ts` | Constantes (`SOCIAL`) |
| `src/Domain/social/nickname.ts`, `rooms.ts`, `message.ts` (+ testes) | Apelido, código, salas, corpo, limite |
| `src/types/socialTypes.ts` | Respostas, eventos do socket, códigos de erro |
| `src/backend/db.ts` (`migrateSocialSchema`) | Colunas `users.nickname/nickname_changed_at/friend_code` e tabelas `friend_requests`, `friendships`, `blocks`, `chat_messages`, `chat_reads` — só acrescenta (`save_members` é do multiplayer, `migrateSaveMembersSchema`) |
| `src/backend/social/socialStore.ts` | Consultas |
| `src/backend/social/roomAccess.ts` | Parâmetro de sala ↔ sala interna, escrita, destinatários |
| `src/backend/social/realtime.ts` | Sockets por usuário, presença, entrega, upgrade de `/api/ws` |
| `src/backend/social/socialRoutes.ts` | Rotas |
| `src/backend/social/maintenance.ts` | Limpeza de 90 dias e varredura de presença (30 s) |
| `src/GameInterface/Social/*` | `SocialProvider`/`useSocial`, `FriendsButton`, `FriendsPanel`, `ChatDock`, `ChatWindow`, `socialApi`, `socialState`, `chatDockState` |

## Rotas (todas exigem login)

| Rota | Faz |
|---|---|
| `GET /api/social/me` | `{ nickname, friendCode }` |
| `PUT /api/social/nickname { nickname }` | só a primeira escolha (o mesmo nome de novo = 200); 400 `invalidNickname`, 409 `nicknameTaken`, 409 `nicknameLocked` (já tem apelido), 413 `tooLarge` |
| `GET /api/social/search?q=` | até 20 `{ nickname, relation }`; 409 `noNickname`, 400 `invalidQuery`, 429 `rateLimited` (30/min) |
| `POST /api/social/requests { nickname \| code }` | `{ status: requested \| friends, nickname }`; 404 `notFound`, 409 `alreadyFriends` / `limit` / `noNickname`, 429 `rateLimited` (20/h) |
| `POST …/requests/:nickname/accept` · `/decline` · `DELETE …/requests/:nickname` | aceitar, recusar, cancelar |
| `GET /api/social/friends` | `{ friends, incoming, outgoing, worlds }` com status e não lidas |
| `DELETE /api/social/friends/:nickname` | desfaz a amizade |
| `GET/POST /api/social/blocks`, `DELETE /api/social/blocks/:nickname` | listar, bloquear, desbloquear |
| `GET /api/social/rooms/:room/messages?before=&limit=` | página de até 50, 403 `noAccess` (inclui DM com bloqueio) |
| `POST /api/social/rooms/:room/messages { body }` | 400 `invalidBody`, 403 `noAccess`, 429 `rateLimited`, 409 `noNickname` |
| `POST /api/social/rooms/:room/read { lastReadId }` | marca lido (só avança); 403 como o histórico |

## Socket (`/api/ws`)

Upgrade no `fetch` do `Bun.serve` (`src/index.ts`), autenticado pelo cookie (401) e com `Origin` do próprio host (403).
Cliente → servidor: `hello { saveId }` (status "jogando" quando o usuário é dono/membro do save), `ping` (a cada 60 s
com a página visível; responde `pong { online }`, a contagem da barra), `typing { room }`. Servidor → cliente:
`message { room, message }`, `presence { nickname, status, club }`, `friend_request { from }`, `friend_update`,
`read { room, lastReadId }`, `typing { room, from }`, `pong { online }`. Frames acima de 2 KB ou inválidos são
ignorados, e por socket no máximo 5 `hello` e 10 `ping` por minuto e 1 `typing` a cada 2 s por sala (o excesso é
ignorado). O logout fecha os sockets daquela sessão (`closeSessionSockets`, código 4001; o cliente não reconecta). O
envio de mensagem é sempre HTTP; sem socket a tela continua funcionando e busca o histórico ao abrir.

Rivais (multiplayer parte 6): cliente → servidor `live_score` (só num mundo em grupo, 30 por minuto por socket,
inválido = ignorado); servidor → cliente `world_results { saveId, results }` e
`friend_live { saveId, seatId, live, goal? }`. A partida ao vivo abre um socket próprio (`useLiveRivals`), sem o
`SocialProvider`. Ver `.claude/rules/game/multiplayer.md` → "Parte 6: rivais".

Cliente: reconecta com espera crescente (1, 2, 5, 10, 30 s). Antes de cada tentativa pergunta `/api/social/me`: 401
(sessão encerrada) ou 404 (servidor sem as rotas sociais) param de vez, e 5 tentativas seguidas que nunca abriram
também. Numa reconexão recarrega os amigos e todas as salas já carregadas. O evento `read` só zera as mensagens até
`lastReadId`. O servidor do lab não monta as rotas sociais (`labAppRoutes`): lá `/api/social/me` é 404 e o socket
nem abre.

## Telas

- Mensagem nova de uma sala que não está aberta na tela: aviso no canto inferior esquerdo (`ChatPopups`, um por sala, até 3,
  some em 7 s; clicar abre a conversa).
- O painel mostra só o apelido ("Você: …"); amigos se adicionam pela busca de apelido. O código de amigo continua na API.
- Barra inferior: "Amigos · N" (amigos online) com o selo de não lidas + pedidos; abre o painel (440 × 640px, até 85% da
  altura, acima da barra, à direita; Escape fecha). O rótulo do botão diz as não lidas ("Amigos: 3 online, 2 não
  lidas"); abrir o painel põe o foco no primeiro controle, fechar devolve ao botão.
- Painel: apelido e código (copiar), abas Amigos (Jogando / Online / Offline / Mundos, menu da linha
  com desfazer amizade e bloquear, com confirmação), Pedidos, Adicionar (busca, código, bloqueados). Sem apelido: só o
  formulário, com o aviso "O apelido não pode ser mudado depois.".
- Janelas: até 3 abertas à esquerda do painel, as outras como abas minimizadas; "Carregar mais", Enter envia,
  Shift+Enter quebra linha, contador de 500, "digitando…". Abrir (ou reabrir) a janela busca o histórico de novo; se
  falhar, "Tentar de novo"; Escape fecha a janela com o foco. Ao recarregar os amigos, as DMs com quem não é mais
  amigo (desfez a amizade) fecham. Estado por aba no `sessionStorage`
  (`fm.social.chats.v1`); o socket reconecta a cada tela.
- A partida ao vivo não tem a barra: o selo aparece ao voltar.

## Testes

```
bun test src/Domain/social src/backend/social src/backend/db.social.test.ts src/backend/auth \
  src/GameInterface/Social src/i18n/social.keys.test.ts src/lab/labAppRoutes.test.ts
```

Navegador: `DEV_AUTO_LOGIN=1 bun run dev`; aba 1 `http://localhost:3000/api/auth/dev-login`, aba 2
`http://127.0.0.1:3000/api/auth/dev-login?as=2` (dois usuários, cookie por host; `.claude/rules/dev-login.md`).

## Limitações

- Um processo só (sockets e presença em memória); o mundo público vai precisar de um barramento entre processos.
- Sem sala pública, denúncia ou moderação; sem anexos, emojis especiais ou edição.
- A sala do mundo lê `save_members` (um membro por assento do mundo, multiplayer). A sala do mundo público só aceita resenha: texto livre dá 403 `publicRoom`.
- Um participante de DM lê o histórico mesmo depois de a amizade acabar (só não escreve), salvo com bloqueio.
- Os limites (mensagens, pedidos, buscas, socket) ficam em memória: reiniciar o servidor zera.
