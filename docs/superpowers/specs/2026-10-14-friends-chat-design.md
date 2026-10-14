# Etapa 44 — Amigos e chat (#153)

Decisões do usuário (2026-10-14): **apelido único**, buscável dentro do jogo, e **código de amigo** para adicionar
direto (o e-mail nunca aparece); conversas = **mensagem direta entre amigos** e, quando o multiplayer chegar, **uma
sala por mundo** (sem sala pública agora); **na barra inferior do jogo** (`StatusBar`), estilo Steam; bloqueio,
histórico de 90 dias e status online / offline / "jogando" com o clube (recomendação aceita). Independe dos assentos do
multiplayer (é por **usuário**, não por save): pode ser feita em paralelo à parte 1
(`docs/superpowers/specs/2026-10-14-multiplayer-design.md`). Visual: `.claude/rules/ui-standard.md`.

## 1. Regra

- Todo usuário logado tem um **apelido** (3–20 caracteres, `[A-Za-z0-9_.-]`, único sem diferenciar maiúsculas, sem
  palavras reservadas como `admin`, `fmproject`, `westlab`) e um **código de amigo** gerado (`FM-XXXX-XXXX`, base32
  sem letras ambíguas). O apelido é pedido na primeira vez que ele abre Amigos; pode trocar uma vez a cada 30 dias.
- **Amizade** só por pedido aceito: pedido pelo apelido (busca) ou pelo código; o outro aceita ou recusa. No máximo
  200 amigos e 50 pedidos pendentes enviados.
- **Bloqueio:** desfaz a amizade, cancela os pedidos entre os dois, o bloqueado não acha o outro na busca, não manda
  pedido nem mensagem; as mensagens antigas dele somem para quem bloqueou. Desbloquear não refaz a amizade.
- **Conversas (salas):**
  - `dm:<userA>:<userB>` (ids em ordem): só entre amigos; com a amizade desfeita ou bloqueio, ninguém escreve.
  - `world:<saveId>`: os membros do mundo multiplayer (`save_members`, parte 2 do multiplayer). A tabela e a regra de
    acesso já ficam prontas; a sala só aparece quando existir mundo com mais de um membro.
- **Mensagem:** 1–500 caracteres de texto puro (sem HTML, sem markdown); limite de 10 mensagens a cada 10 s por
  usuário (429); guardadas por **90 dias** (apagadas por uma limpeza diária no servidor).
- **Status de um amigo:** `online` (página do jogo aberta e visível nos últimos 2,5 min), `offline`, ou `playing`
  com o nome do clube do save aberto naquele momento. Só amigos veem o status; a contagem global "N online" continua.
- Nada aparece para quem não é amigo além do apelido (na busca). E-mail e ids internos nunca saem do servidor.

## 2. Dados (SQLite, `src/backend/db.ts`)

```sql
ALTER users ADD nickname TEXT;            -- índice único sobre lower(nickname)
ALTER users ADD nickname_changed_at INTEGER;
ALTER users ADD friend_code TEXT UNIQUE;  -- gerado na primeira abertura de Amigos
friend_requests(from_user, to_user, created_at, PRIMARY KEY(from_user, to_user))
friendships(user_a, user_b, since, PRIMARY KEY(user_a, user_b))     -- user_a < user_b
blocks(user_id, blocked_id, created_at, PRIMARY KEY(user_id, blocked_id))
chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, from_user TEXT, body TEXT, created_at INTEGER)
  -- índice (room, id)
chat_reads(user_id, room, last_read_id, PRIMARY KEY(user_id, room))
```

Criadas com `CREATE TABLE IF NOT EXISTS` / colunas adicionadas se faltarem (o banco de produção já existe com usuários:
**nada é apagado**, só acrescentado). Testes usam o banco temporário do preload.

## 3. Tempo real

- **WebSocket** em `/api/ws` no próprio `Bun.serve` (`websocket` handler em `src/index.ts`), autenticado pelo cookie
  de sessão no upgrade (sem sessão: 401). Um usuário pode ter várias abas: o servidor guarda as conexões por usuário.
- Cliente → servidor: `hello { saveId? }` (o save aberto, para o status "jogando": o servidor confere que o usuário é
  dono/membro e lê o nome do clube), `ping` a cada 60 s com a página visível (substitui o `POST /api/presence/ping`
  para quem está com o socket aberto; a rota continua), `typing { room }` (opcional, não guardado).
- Servidor → cliente: `message { room, id, from, body, at }`, `presence { userId do amigo → status }`,
  `friend_request`, `friend_update` (aceitou, desfez, bloqueou), `read { room, lastReadId }` (para as outras abas).
- Envio de mensagem é por HTTP (`POST`), com validação e limite; o socket só **entrega**. Sem socket (rede ruim), a
  tela continua funcionando por HTTP e busca o histórico ao reabrir.
- Tudo em memória por processo (um servidor só, como hoje). O mundo público vai precisar de um barramento entre
  processos — fora do escopo.

## 4. Rotas (todas exigem login; `src/backend/social/*`)

| Rota | Faz |
|---|---|
| `GET /api/social/me` | `{ nickname \| null, friendCode, nicknameChangeableOn }` (gera o código na primeira vez) |
| `PUT /api/social/nickname { nickname }` | 400 `invalidNickname`, 409 `nicknameTaken`, 409 `tooSoon` |
| `GET /api/social/search?q=` | até 20 apelidos que começam com `q` (≥ 3 caracteres), sem bloqueados nos dois sentidos, com a relação (`friend`, `pending_out`, `pending_in`, `none`) |
| `POST /api/social/requests { nickname \| code }` | pedido; se já houver pedido do outro, vira amizade na hora. 404 `notFound` (também quando bloqueado), 409 `alreadyFriends`, 409 `limit` |
| `POST /api/social/requests/:userRef/accept` · `/decline` · `DELETE /api/social/requests/:userRef` (cancelar) | `userRef` = apelido |
| `GET /api/social/friends` | amigos com status e não lidas por conversa; pedidos recebidos e enviados |
| `DELETE /api/social/friends/:nickname` | desfaz a amizade |
| `POST /api/social/blocks { nickname }` · `DELETE /api/social/blocks/:nickname` · `GET /api/social/blocks` | bloquear, desbloquear, listar |
| `GET /api/social/rooms/:room/messages?before=&limit=` | histórico (até 50 por página), 403 sem acesso |
| `POST /api/social/rooms/:room/messages { body }` | 400 `invalidBody`, 403 `noAccess`, 429 `rateLimited` |
| `POST /api/social/rooms/:room/read { lastReadId }` | marca lido |

`room` vem como `dm:<apelido>` ou `world:<saveId>` na URL (o servidor traduz para o id interno); nunca expõe user ids.

## 5. Telas (barra inferior, estilo Steam)

- **Botão "Amigos"** na `StatusBar`, à direita (antes da versão): ícone `users` + "Amigos · 3" (amigos online) e um
  selo com as não lidas. Abre o **painel de amigos** encaixado acima da barra, no canto direito (largura ~340px,
  altura até 60% da tela), sobre o conteúdo, sem mudar a moldura das telas.
- **Painel:** topo com o apelido e o código (botão copiar); abas `SegmentedTabs` **Amigos · Pedidos · Adicionar**:
  - Amigos: grupos "Jogando", "Online", "Offline" (bolinha de status, apelido, "Jogando · Manchester United", não
    lidas); clique abre a conversa; menu da linha: desfazer amizade, bloquear.
  - Pedidos: recebidos (Aceitar / Recusar) e enviados (Cancelar).
  - Adicionar: busca por apelido (lista com "Adicionar" / "Pedido enviado" / "Aceitar") e campo de código.
  - Sem apelido ainda: o painel mostra só o formulário "Escolha seu apelido".
- **Janelas de conversa** acima da barra, à esquerda do painel (até 3 abertas; as demais viram abas minimizadas na
  barra, como no Steam): histórico com "carregar mais", campo de texto (Enter envia, Shift+Enter quebra linha),
  contador 500, aviso de limite. Minimizar / fechar.
- Como cada tela do jogo é uma página própria, o estado das janelas abertas fica no `sessionStorage` (por aba) e o
  socket reconecta ao trocar de tela; as mensagens vêm do servidor.
- Só nas telas com a barra inferior (o jogo). A partida ao vivo não tem a barra: o selo de não lidas aparece quando
  a pessoa volta.
- i18n `social.*` (en, pt-BR); ícones novos só via `Icons.tsx`; textos e tamanhos pelo `ui-standard.md`.

## 6. Arquivos

| Arquivo | Papel |
|---|---|
| `src/backend/db.ts` | Tabelas novas e colunas |
| `src/Domain/social/nickname.ts` (+ teste) | Validação do apelido, palavras reservadas, geração do código de amigo |
| `src/Domain/social/rooms.ts` (+ teste) | Id da sala DM (ordem dos ids), parse de `dm:`/`world:`, regras de acesso puras |
| `src/backend/social/socialStore.ts` (+ teste) | Consultas SQLite (amizades, pedidos, bloqueios, mensagens, lidas, limpeza de 90 dias) |
| `src/backend/social/socialRoutes.ts` (+ teste) | Rotas da seção 4 |
| `src/backend/social/realtime.ts` (+ teste) | Conexões por usuário, presença, entrega, `hello`/`ping` |
| `src/index.ts`, `src/backend/routes.ts` | `websocket` e `/api/ws`; rotas |
| `src/GameInterface/Social/*` | `FriendsButton`, `FriendsPanel`, `ChatWindow`, `useSocial` (socket + estado), `socialApi` |
| `src/GameInterface/Components/StatusBar.tsx`, `Layout.tsx` | Botão e camada do painel |

## 7. Testes

- Puros: apelido (tamanho, caracteres, reservados, caixa), código (formato, sem ambíguos), sala DM (mesmo id dos dois
  lados), parse de sala.
- Store/rotas: apelido único (caixa), troca a cada 30 dias, busca sem bloqueados, pedido cruzado vira amizade, limites,
  bloqueio desfaz e esconde, DM só entre amigos, sala de mundo só para membros, limite de 10/10 s, histórico paginado,
  lido, limpeza de 90 dias, nenhuma resposta contém e-mail ou user id.
- Tempo real: dois sockets de teste (`Bun.serve` em porta aleatória) — mensagem enviada por HTTP chega ao outro; status
  `playing` com o clube; bloqueado não recebe nada.
- Navegador (dev server, dev-login com dois usuários em duas abas anônimas): adicionar por código, conversar, bloquear.

## 8. Limitações

- Um processo só (conexões e presença em memória).
- Sem sala pública, denúncia ou moderação (vem se houver sala pública).
- Sem anexos, emojis especiais ou edição de mensagem.
- A sala do mundo só tem membros quando a parte 2 do multiplayer existir.
