# Multiplayer parte 2 — Liga de amigos (mundo compartilhado)

Etapa 43 (#106). Visão geral e parte 1: `docs/superpowers/specs/2026-10-14-multiplayer-design.md`; regra da parte 1:
`.claude/rules/game/multiplayer.md`. Avanço em grupo: `docs/superpowers/specs/2026-10-15-multiplayer-group-advance-design.md`
(parte 3). **As partes 2 e 3 vão ao ar juntas** (decisão do usuário, 2026-10-15): a parte 2 sozinha não é jogável.

Decisões do usuário (2026-10-15):
- A liga nasce no **novo jogo** ("Jogar com amigos"); um save solo continua solo.
- Convite **pela lista de amigos e por link com código**.
- **Até 8 técnicos** por liga.
- Quem sai (ou é tirado) **devolve o clube à IA** e a vaga abre.
- O dono **só sai depois de passar a posse**; se for o último membro, sair apaga o mundo.

## 1. Estados do mundo

`SaveMeta.world?: WorldState` (só em `mode: "multi"`):

```ts
interface WorldState {
  phase: "lobby" | "running";
  inviteCode: string;          // 10 caracteres base32 sem 0/1/I/O, único entre os mundos
  deadlineHours: 12 | 24 | 48 | null;   // usado pela parte 3; padrão 24
  createdBy: string;           // userId do criador (só auditoria; a posse é save_members)
}
```

- **`lobby`:** o mundo existe (`createSave` com o clube do dono), mas a pré-simulação ainda não rodou e o dia não
  avança. Membros entram e escolhem clube.
- **`running`:** depois de "Começar". Novos membros ainda entram (até 8) e escolhem um clube sem humano, na data atual.
- O solo não tem `world` e não muda.

## 2. Criação (novo jogo)

- Passo novo no começo do `NewGameWizard`: **Sozinho** / **Com amigos** (cartões de escolha). O resto do assistente
  (liga, clube, técnico) é igual.
- `POST /api/saves` com `mode: "multi"` cria o mundo em `lobby` com o assento do dono e `inviteCode` novo. **Não chama
  `/presimulate`**: o assistente vai para a tela da liga (`/world`).
- Limite de saves: continua 5 mundos como dono (os em `lobby` contam); como membro, sem limite.

## 3. Convite e entrada

- **Link:** `/join/<código>`. Página pública que exige login (o `AuthGate` volta para ela depois do login).
  `GET /api/worlds/by-code/:code` → `{ saveId, name, owner (apelido ou nome do técnico), members, max, phase, takenClubs }`;
  404 com código inválido ou trocado; 409 `full` com 8 membros; 409 `alreadyMember` (com o `saveId`, a tela leva ao mundo).
- **Pela lista de amigos:** na tela da liga, "Convidar amigos" lista os amigos (`/api/social/friends`) e manda
  `POST /api/worlds/:saveId/invites { nickname }` (só o dono; o convidado tem de ser amigo dele, senão 404). O convidado recebe o evento de socket
  novo `world_invite { saveId, name, from, code }` e um item "Convites para ligas" no painel de Amigos (Aceitar abre
  `/join/<código>`, Recusar some). Convites ficam em memória e na tabela `world_invites(save_id, user_id, from_user,
  created_at)` (só para a lista; não substituem o código). Limite de 20 convites pendentes por mundo.
- **Entrada:** `/join/<código>` mostra a liga e, logado, o mesmo seletor de país/liga/clube do novo jogo, com os clubes
  de humanos desabilitados ("Técnico humano"), e depois o formulário do técnico (nome, nacionalidade, avatar).
  `POST /api/worlds/join { code, clubId, manager }` → `addSeat` (`src/backend/seats.ts`) com `role: "member"`.
  Erros: 404 código, 409 `full`, 409 `alreadyMember`, 409 `clubTaken` (outro humano pegou antes), 400 manager inválido.
  Dentro de `withSaveLock`; o contador de 8 é conferido dentro do lock.
- Em `running`, `addSeat` já cobre a entrada no meio da temporada (folgas pelo próprio clube, TV da temporada, contrato
  do técnico). Nada novo.
- **Trocar o código:** `POST /api/worlds/:saveId/invite-code` (dono) gera outro; o link antigo dá 404.

## 4. Lobby e início

- Tela da liga (`/world`, página nova dentro do `Layout`; em `running` também é acessível pela barra: ícone de grupo
  ao lado do bloco do dia, só no multi). Seções:
  - **Membros:** rosto, nome do técnico, apelido, clube (escudo) e liga, papel (Dono). Na parte 3 ganha o status do
    avanço.
  - **Convite:** link com Copiar, "Trocar código" (dono), "Convidar amigos" (dono).
  - **Prazo** (dono): `OptionChips` 12 h / 24 h / 48 h / Sem prazo (`PUT /api/worlds/:saveId/settings { deadlineHours }`).
  - **Começar** (dono, só em `lobby`): roda `/presimulate` (já só do dono e uma vez por mundo) e muda para `running`;
    mostra o `PreSeasonLoadingScreen`; os outros membros recebem `world_started` no socket e vão para o Painel.
  - Membros em `lobby` veem "Esperando o dono começar"; todas as outras telas do jogo redirecionam para `/world`
    enquanto o mundo está em `lobby`.
- O chat do mundo (`world:<saveId>`, Etapa 44) já funciona para os membros; a tela tem um botão "Chat da liga".

## 5. Gestão (dono e membros)

| Ação | Quem | Rota | Efeito |
|---|---|---|---|
| Tirar membro | dono | `POST /api/worlds/:saveId/members/:seatId/remove` | `removeSeat`: o clube volta à IA (`releaseHumanClub`, com interino e vaga como numa demissão); o técnico fica no ranking como livre; o assento e a linha de `save_members` saem; o removido recebe `world_removed` no socket |
| Sair | membro (não dono) | `POST /api/worlds/:saveId/leave` | O mesmo `removeSeat` no próprio assento |
| Passar a posse | dono | `POST /api/worlds/:saveId/owner { seatId }` | `role` troca; o antigo dono vira membro |
| Sair sendo dono | dono | `leave` | 409 `transferFirst` se há outros membros; se é o único, apaga o mundo (como o apagar de hoje) |
| Apagar | dono | `DELETE /api/saves/:id` (já existe) | Todos perdem; os membros recebem `world_deleted` |

- `removeSeat(saveId, seatId)` (novo, `src/backend/seats.ts`): dentro de `withSaveLock`; apaga `saves/{id}/seats/{seatId}/`
  (arquivos do assento), tira o id de `meta.seats`, fecha a passagem do técnico com o motivo novo `left: "left_world"`
  (o registro fica no ranking como livre, `squadId ""`), devolve o clube à IA. Mensagem na caixa de cada membro restante e notícia do mundo
  (`news` tipo novo `world_member`, importância 3, só no mundo multi).
- Entrada de membro também vira notícia `world_member` ("X assume o Y").

## 6. Lista de saves e telas

- `/start`: o save multi tem o selo "Com amigos · N/8" e o papel ("Dono"/"Membro"); em `lobby`, "Na sala de espera".
  Apagar só aparece para o dono; o membro tem "Sair da liga".
- O ícone de liga na barra superior só aparece no multi.
- i18n `world.*` (en, pt-BR). UI segue `.claude/rules/ui-standard.md` (título "SUA **LIGA**" / "YOUR **LEAGUE**").

## 7. Socket (novos `ServerEvent`)

`world_invite`, `world_started { saveId }`, `world_removed { saveId }`, `world_deleted { saveId }`,
`world_members { saveId }` (alguém entrou/saiu; a tela recarrega). Entrega por usuário (`realtime.ts`), só a membros
(ou ao convidado, no `world_invite`).

## 8. Dados

- `SaveMeta.world` (acima).
- SQLite: `world_invites` (nova, só acrescenta); `save_members` sem mudança.
- SQLite: `world_codes(code PRIMARY KEY, save_id)` acha o mundo pelo código sem abrir metas; atualizada ao criar,
  trocar o código e apagar o mundo. O código também fica em `meta.world.inviteCode` (exibição).

## 9. Testes

- Rotas: criar multi (lobby, sem presimulate), `by-code` (404/409), `join` (clube tomado, cheio, já membro, corrida
  de dois `join` no mesmo clube), trocar código, convite por amigo (só dono, evento de socket), começar (só dono, uma
  vez, `world_started`), tirar membro (clube vira IA com interino, arquivos do assento somem, técnico livre no
  ranking), sair, passar a posse, dono sair (409 / apagar).
- Redirecionamento das telas em `lobby`.
- Fluxo: dono cria, 2 amigos entram, dono começa, um sai no meio, outro entra no clube liberado.
- `/test`, `/lab`: sem efeito de partida.

## 10. Limitações

- Um processo de servidor por mundo (como a parte 1).
- Sem reserva de assento nem troca de clube de um membro (sair e entrar de novo).
- Convites pela lista só para amigos do dono.
