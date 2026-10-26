# Etapa 43, parte 5b — Mundo público

Visão geral: `docs/superpowers/specs/2026-10-14-multiplayer-design.md`. Partes 1–5a e 6 na `main` (4.34.3). Regra viva:
`.claude/rules/game/multiplayer.md`. Esta é a última parte do multiplayer.

Decisões do usuário (2026-10-26):
- mundos **oficiais do servidor** (um por vez), sem dono;
- o mundo anda em **horários fixos**, 4 por dia (9h, 13h, 18h, 22h de Brasília), sem esperar ninguém;
- cada horário avança **um dia de jogo** (o próximo dia em que algum técnico tem jogo);
- só clubes das **10 ligas principais**, **até 40 técnicos**;
- quem não abre o mundo por **7 dias** perde o clube (aviso no 5º);
- na sala do mundo, **só a resenha pronta** (sem texto livre);
- o mundo **recomeça a cada versão** publicada; a classificação de cada edição fica num **hall da fama**.

## 1. Abordagem

O mundo público é um mundo em grupo comum (`mode: "multi"` + `world`) com `world.kind = "public"`. Ele reaproveita os
assentos, o executor do avanço em grupo (`src/backend/groupAdvance.ts`), as propostas entre técnicos, rivais e a
classificação. Mudam só três coisas:

1. **quem cria:** o servidor, na subida;
2. **quem decide o alvo do avanço:** o relógio, nos horários fixos, em vez do "pronto até" e do prazo;
3. **posse:** ninguém é dono; todo assento é `member`.

Descartado: um serviço separado para o mundo público (duplicaria o executor e as rotas sem ganho).

## 2. Dados

| Onde | O quê |
|---|---|
| `WorldState.kind?: "friends" \| "public"` | ausente = `friends`. No público: `inviteCode` vazio (sem convite), `deadlineHours: null`, `createdBy: "server"` |
| `WorldState.edition?: { version, startedOn }` | só no público: a versão do jogo (`GAME_VERSION`) e a data real de criação |
| `WorldAdvance.lastSlot?: string` | ISO do último horário executado (idempotência do relógio) |
| `SeatState.lastSeenAt?: string` | ISO da última vez que o técnico abriu o mundo; `inactiveWarnedAt?` o aviso do 5º dia |
| SQLite `public_editions(version, save_id, started_at, ended_at, standings_json)` | hall da fama; `standings_json` = top 10 (`{ rank, nickname, clubName, total, seasons }`), atualizado a cada passo |

Constantes num `PUBLIC_WORLD` (`src/Domain/multiplayer/publicWorldConfig.ts`): `SLOTS` (`["09:00","13:00","18:00","22:00"]`,
fuso `America/Sao_Paulo`), `MAX_MEMBERS` 40, `LEAGUES` (os slugs das 10 ligas de `scripts/faces/wikidata.ts` → `LEAGUES`,
copiados para o domínio), `WARN_DAYS` 5, `INACTIVE_DAYS` 7, `HALL_TOP` 10.

## 3. Ciclo de vida

- **Criação** (`ensurePublicWorld`, chamado em `startWorldClock`, `src/index.ts`): se não há save com
  `world.kind === "public"` e `edition.version === GAME_VERSION`, cria um. A geração do mundo é a do `createSave`, sem
  assento humano (`createWorldOnly`: mesmo mundo, ligas, copas, continentais, seleções, árbitros; nenhum clube humano);
  aplica o kit pré-simulado como o "Começar" (`presimulateWorld` sem assento dono) e nasce em `phase: "running"`. Grava a
  linha em `public_editions`.
- **Edição anterior:** um mundo público de outra versão que ainda exista em disco é apagado (`deleteWorld`) depois de a
  linha dele em `public_editions` receber `ended_at`. Se o deploy já apagou os saves, a linha aberta da edição anterior
  recebe `ended_at` na criação da nova.
- **Sem dono:** as rotas de dono (`invite-code`, `settings`, `invites`, `start`, `members/:id/remove`, `owner`) respondem
  409 `publicWorld`. Sair (`leave`) vale para todos; o último técnico sair não apaga o mundo (o público pode ficar com zero
  assentos: `removeSeat` aceita sair sendo o último num mundo público).
- **Zero assentos:** o avanço do dia roda sem nenhum assento (`loadDaySeats` vazio). Verificar no plano que nenhum passo
  supõe um assento.

## 4. Ritmo (o relógio)

- `worldClockTick` (a cada 60 s, já existe) checa o mundo público: um horário de `SLOTS` já passou e é mais novo que
  `advance.lastSlot` → grava `lastSlot` e dá o passo. Servidor fora em vários horários: executa só um passo na volta.
- **Parada entre horários:** depois de cada passo o mundo fica parado no próximo dia em que algum assento tem jogo oficial
  (clube ou seleção), ainda não jogado. Nesse intervalo cada técnico joga o seu ao vivo (gravação do grupo, como hoje) ou
  marca "Simular".
- **Passo** (`publicStepTarget`, puro): joga o dia em que o mundo está parado e segue dia a dia até o próximo dia com jogo
  de algum assento (exclusive). Jogos sem decisão são simulados pelo assistente (`assistantPatches` com o alvo do passo).
  Sem nenhum assento: o alvo é o próximo dia com rodada de qualquer das 10 ligas.
- `readyUntil`, `deadlineHours`, `waitingSince` e as paradas (`seatStops`: proposta, demissão, fim de temporada) não
  seguram o mundo público; o resumo pendente continua mostrando tudo.
- Teto do passo: os mesmos 450 dias por execução (entressafra longa sem jogo de ninguém).
- Erro num dia: mesma regra de nova tentativa do avanço em grupo; um horário perdido por erro não é repetido, o próximo
  horário continua de onde parou.

## 5. Entrar e sair

- **Lista:** `GET /api/worlds/public` (logado): `{ saveId, members, max, nextSlot, takenClubs, edition, joined }`.
- **Entrar:** `POST /api/worlds/public/join { clubId, manager, sackingEnabled }` (logado, apelido obrigatório → 409
  `noNickname`): clube das 10 ligas (400 `invalidClub` fora delas), livre (409 `clubTaken`), vaga (409 `full`), um assento
  por usuário (409 `alreadyMember`). Usa `addSeat` com `maxSeats: 40` e anúncio de entrada como na liga de amigos.
- **Telas:** opção "Mundo público" no novo jogo (ao lado de "Sozinho" / "Com amigos"), o assistente no modo entrar com só
  as 10 ligas e os clubes livres; card "Mundo público · N/40" na tela inicial (entrar ou continuar).
- **Inatividade:** `lastSeenAt` é atualizado pelo `hello` do socket com o save aberto e por qualquer rota com
  `requireSeat` do mundo público (no máximo uma escrita por hora por assento). No passo do relógio: `WARN_DAYS` sem abrir
  → mensagem `world` / `inactive_warning` (uma vez); `INACTIVE_DAYS` → `removeSeat` (o clube volta à IA, interino e vaga
  como numa demissão), notícia de saída e o técnico recebe `world_removed`. Pode entrar de novo com outro clube livre.

## 6. Social

- Sala `world:<saveId>` do público: `POST .../messages` com texto livre → 403 `publicRoom`; a resenha
  (`POST /api/worlds/:saveId/taunts`) continua. O histórico mostra só resenhas e avisos.
- DM entre amigos, presença, rivais (40 linhas), placar ao vivo e classificação iguais à liga de amigos.

## 7. Tela do mundo (`/world`)

No público: membros (sem botões de dono), "Próximo passo às 18:00" no lugar do prazo, classificação, rivais, resultados e
a aba **Hall da fama** (edições anteriores: versão, período, top 10). Sem convite, sem prazo, sem "Começar".
`GroupAdvanceBand`: mostra o próximo horário e quem ainda não decidiu o jogo do dia; "Pronto até" some (no público só
Jogar / Simular no dia de jogo).

## 8. Custo e medição

- `bun scripts/bench-advance-day.ts`: um passo com assentos nas 10 ligas num dia de rodada cheia (estimativa ~2 min) e a
  memória do processo com o mundo público aberto. Anotar em `multiplayer.md`.
- Durante o passo, as escritas dos técnicos esperam o dia em curso (`withSaveLock`), como hoje.
- Sem efeito de partida: nada em `/test`, `/lab` nem `Statistics.ts`.

## 9. Testes

- Puros: `publicStepTarget` (alvo com e sem assentos, jogos de seleção), horários (`dueSlot` com fuso, idempotência,
  vários horários perdidos = um passo), inatividade (aviso e remoção nos dias certos, uma vez).
- Backend: criação na subida (uma por versão, a anterior fechada no hall da fama), rotas de dono 409, entrar (clube fora
  das 10 ligas, ocupado, cheio, sem apelido), passo do relógio com dois assentos (jogo sem decisão simulado, jogo ao vivo
  gravado entra), último técnico sai e o mundo continua, sala sem texto livre.
- Smoke de temporada: não muda (o público é um mundo multi comum).

## 10. Versão e documentação

- Próxima minor: **4.35**; changelog e `upcoming`.
- `.claude/rules/game/multiplayer.md` ganha "Parte 5b: mundo público"; `social.md` a regra da sala; ROADMAP marca a
  etapa 43 como concluída.

## 11. Limitações

- Um processo só por servidor (relógio, sockets, locks em memória).
- Quem dorme ou trabalha perde a decisão de alguns jogos (o assistente simula).
- O mundo zera a cada deploy; só o hall da fama sobrevive.
- O horário é o de Brasília para todos.
