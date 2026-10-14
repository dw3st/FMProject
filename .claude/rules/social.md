# Amigos e chat

Spec: `docs/superpowers/specs/2026-10-14-friends-chat-design.md`. Etapa 44 do `docs/ROADMAP.md` (#153), versão
**4.24**. Visual: `.claude/rules/ui-standard.md`. Por **usuário**, não por save.

## Regra

- Apelido único (3–20, `[A-Za-z0-9_.-]`, sem diferenciar maiúsculas, sem `admin`/`fmproject`/`westlab`/moderador e
  afins), escolhido na primeira abertura de Amigos, troca a cada 30 dias. Código de amigo `FM-XXXX-XXXX` (base32 sem
  0/1/I/O), gerado na primeira chamada de `GET /api/social/me`.
- Amizade só por pedido aceito (apelido ou código); pedido cruzado vira amizade na hora. Máximo 200 amigos e 50
  pedidos enviados pendentes.
- Bloqueio: desfaz a amizade e os pedidos entre os dois; o bloqueado não acha o outro, não pede nem escreve (404 /
  403, nunca "bloqueado"); as mensagens dele somem para quem bloqueou. Desbloquear não refaz a amizade.
- Salas internas `dm:<idA>:<idB>` (ids em ordem) e `world:<saveId>`. O cliente só vê `dm:<apelido do outro>` e
  `world:<saveId>`. DM: escreve quem é amigo sem bloqueio; o participante lê o histórico. Mundo: dono (`saves`) ou
  membro (`save_members`) de um mundo com 2+ membros.
- Mensagem: texto puro de 1–500 caracteres, 10 a cada 10 s por usuário (429), apagadas depois de 90 dias
  (`startSocialMaintenance`, na subida e a cada 24 h).
- Status de amigo: `playing` (com o clube do save aberto numa aba, `hello`), `online` (visto nos últimos 2,5 min, pelo
  ping do socket ou pelo `POST /api/presence/ping`), `offline`. Só amigos recebem.
- Nenhuma resposta nem evento carrega e-mail ou id de usuário.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/social/socialConfig.ts` | Constantes (`SOCIAL`) |
| `src/Domain/social/nickname.ts`, `rooms.ts`, `message.ts` (+ testes) | Apelido, código, salas, corpo, limite |
| `src/types/socialTypes.ts` | Respostas, eventos do socket, códigos de erro |
| `src/backend/db.ts` (`migrateSocialSchema`) | Colunas `users.nickname/nickname_changed_at/friend_code` e tabelas `friend_requests`, `friendships`, `blocks`, `chat_messages`, `chat_reads`, `save_members` — só acrescenta |
| `src/backend/social/socialStore.ts` | Consultas |
| `src/backend/social/roomAccess.ts` | Parâmetro de sala ↔ sala interna, escrita, destinatários |
| `src/backend/social/realtime.ts` | Sockets por usuário, presença, entrega, upgrade de `/api/ws` |
| `src/backend/social/socialRoutes.ts` | Rotas |
| `src/backend/social/maintenance.ts` | Limpeza de 90 dias e varredura de presença (30 s) |
| `src/GameInterface/Social/*` | `SocialProvider`/`useSocial`, `FriendsButton`, `FriendsPanel`, `ChatDock`, `ChatWindow`, `socialApi`, `socialState`, `chatDockState` |

## Rotas (todas exigem login)

| Rota | Faz |
|---|---|
| `GET /api/social/me` | `{ nickname, friendCode, nicknameChangeableOn }` |
| `PUT /api/social/nickname { nickname }` | 400 `invalidNickname`, 409 `nicknameTaken`, 409 `tooSoon { nicknameChangeableOn }` |
| `GET /api/social/search?q=` | até 20 `{ nickname, relation }`; 409 `noNickname`, 400 `invalidQuery` |
| `POST /api/social/requests { nickname \| code }` | `{ status: requested \| friends, nickname }`; 404 `notFound`, 409 `alreadyFriends` / `limit` / `noNickname` |
| `POST …/requests/:nickname/accept` · `/decline` · `DELETE …/requests/:nickname` | aceitar, recusar, cancelar |
| `GET /api/social/friends` | `{ friends, incoming, outgoing, worlds }` com status e não lidas |
| `DELETE /api/social/friends/:nickname` | desfaz a amizade |
| `GET/POST /api/social/blocks`, `DELETE /api/social/blocks/:nickname` | listar, bloquear, desbloquear |
| `GET /api/social/rooms/:room/messages?before=&limit=` | página de até 50, 403 `noAccess` |
| `POST /api/social/rooms/:room/messages { body }` | 400 `invalidBody`, 403 `noAccess`, 429 `rateLimited`, 409 `noNickname` |
| `POST /api/social/rooms/:room/read { lastReadId }` | marca lido (só avança) |

## Socket (`/api/ws`)

Upgrade no `fetch` do `Bun.serve` (`src/index.ts`), autenticado pelo cookie (401) e com `Origin` do próprio host (403).
Cliente → servidor: `hello { saveId }` (status "jogando" quando o usuário é dono/membro do save), `ping` (a cada 60 s
com a página visível; responde `pong { online }`, a contagem da barra), `typing { room }`. Servidor → cliente:
`message { room, message }`, `presence { nickname, status, club }`, `friend_request { from }`, `friend_update`,
`read { room, lastReadId }`, `typing { room, from }`, `pong { online }`. Frames acima de 2 KB ou inválidos são
ignorados. O envio de mensagem é sempre HTTP; sem socket a tela continua funcionando e busca o histórico ao abrir.

## Telas

- Barra inferior: "Amigos · N" (amigos online) com o selo de não lidas + pedidos; abre o painel (340px, até 60% da
  altura, acima da barra, à direita; Escape fecha).
- Painel: apelido e código (copiar, trocar apelido), abas Amigos (Jogando / Online / Offline / Mundos, menu da linha
  com desfazer amizade e bloquear, com confirmação), Pedidos, Adicionar (busca, código, bloqueados). Sem apelido: só o
  formulário.
- Janelas: até 3 abertas à esquerda do painel, as outras como abas minimizadas; "Carregar mais", Enter envia,
  Shift+Enter quebra linha, contador de 500, "digitando…". Estado por aba no `sessionStorage`
  (`fm.social.chats.v1`); o socket reconecta a cada tela.
- A partida ao vivo não tem a barra: o selo aparece ao voltar.

## Testes

```
bun test src/Domain/social src/backend/social src/backend/db.social.test.ts src/backend/auth \
  src/GameInterface/Social src/i18n/social.keys.test.ts
```

Navegador: `DEV_AUTO_LOGIN=1 bun run dev`; aba 1 `http://localhost:3000/api/auth/dev-login`, aba 2
`http://127.0.0.1:3000/api/auth/dev-login?as=2` (dois usuários, cookie por host; `.claude/rules/dev-login.md`).

## Limitações

- Um processo só (sockets e presença em memória); o mundo público vai precisar de um barramento entre processos.
- Sem sala pública, denúncia ou moderação; sem anexos, emojis especiais ou edição.
- A sala do mundo só tem membros quando a parte 2 do multiplayer gravar `save_members`.
- Um participante de DM lê o histórico mesmo depois de a amizade acabar (só não escreve).
