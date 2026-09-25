# Controles ao vivo da partida, estrela dos mitos e login de desenvolvimento — Design

Data: 2026-09-25. Status: aprovado pelo usuário.

## Escopo

Cinco mudanças independentes, numa branch só (`feat/match-live-controls`):

0. Login automático em desenvolvimento (para testar telas no navegador sem digitar credenciais).
1. Mentalidade ao vivo na partida: ataque total / equilibrado / defesa.
2. Estrela dourada nos 50 jogadores de maior overall do mundo.
3. A partida continua rodando com a aba em segundo plano.
4. Velocidade 4x.

## 0. Login de desenvolvimento

- Rota `GET /api/auth/dev-login`, registrada em `src/backend/auth/routes.ts`.
- Só responde quando **todas** as condições valem: `process.env.DEV_AUTO_LOGIN === "1"`,
  `process.env.NODE_ENV !== "production"` e o host do pedido é `localhost` ou `127.0.0.1`.
  Fora disso responde 404, como se a rota não existisse.
- Cria (ou reaproveita) o usuário `dev@localhost` pelo `AuthService`, abre uma sessão, grava o
  cookie de sessão igual ao login normal e redireciona (302) para `/start`.
- Teste: rota 404 sem a variável, 404 com `NODE_ENV=production`, 404 com host externo; com tudo
  certo, 302 + `Set-Cookie` de sessão válida.
- Documentar em `.claude/rules/` (arquivo novo `.claude/rules/dev-login.md` curto) como usar:
  `DEV_AUTO_LOGIN=1 bun src/index.ts` e abrir `http://localhost:3000/api/auth/dev-login`.

## 1. Mentalidade ao vivo

- Tipo `Mentality = "attacking" | "balanced" | "defensive"` em `src/types/tacticsTypes.ts`.
- Função pura `axesWithMentality(style, mentality): TacticalAxes`:
  - `balanced`: `axesFor(style)` sem mudança.
  - `attacking`: `pressing_style` sobe um degrau (low_block → mid_block → high_press),
    `defensive_line` sobe um degrau (deep → normal → high), `width = "wide"`, `build_up = "direct"`.
  - `defensive`: `pressing_style` desce um degrau, `defensive_line` desce um degrau,
    `width = "narrow"`, `build_up` inalterado.
  - Degraus saturam nas pontas.
- `applyTeamTacticsConfig(team, style, mentality = "balanced")` e
  `applyTeamAttackConfig(team, style, mentality = "balanced")` passam a usar
  `axesWithMentality`. O estilo continua sendo a referência das intenções de time
  (`IntentDetection` segue lendo o estilo); a mentalidade só desloca os eixos.
- **Partida (`MatchScreen`)**: três botões (ataque total / equilibrado / defesa) na barra de
  controles, com o estado atual destacado. Trocar aplica na hora para o time A. O time B (IA) fica
  em `balanced`. Começa em `balanced` a cada partida. Não é salvo.
- **`/test`**: seletor de mentalidade por time ao lado do seletor de estilo.
- **`/lab`**: campo `mentality` opcional por variante (padrão `balanced`) em `lab/types.ts`,
  editável no `VariantEditor`/`ScenarioBuilder`, aplicado pelo `scenarioRunner`/`balanceWorker`
  onde o estilo já é aplicado; aparece no rótulo da variante.
- i18n: `match.mentality.attacking|balanced|defensive` (en, pt-BR).

## 2. Estrela dourada (top 50 do mundo)

- Função pura `topPlayerIds(squads, n = 50): Set<string>` em `src/Domain/world/stars.ts`:
  ordena todos os jogadores do mundo por `Player.computeOverallAvg` (desempate por id) e devolve
  os `n` primeiros.
- Endpoint `GET /api/saves/:id/stars` → `{ playerIds: string[] }`, com dono do save exigido
  (`requireSaveOwner`) e cache por save carimbado com `getSaveDataVersion(saveId)`.
- Front: hook `useStarPlayers(saveId)` (um fetch por sessão de tela) e componente
  `StarBadge` (estrela dourada pequena, `Icon` do projeto — acrescentar o ícone em `Icons.tsx`
  se não existir) com tooltip "Mito da atualidade" (i18n `players.star`).
- Onde aparece: tabela do elenco, card do jogador no dashboard, tabela do olheiro, tela do
  jogador e painéis de time da partida. Em cada lugar, ao lado do nome.

## 3. Partida em segundo plano

- Hoje `PixiPitch` avança a simulação dentro do `app.ticker` (requestAnimationFrame), que o
  navegador congela com a aba oculta.
- Novo relógio da simulação, separado do desenho:
  - `src/GraficsEngine/simClock.ts`: cria um Worker a partir de um Blob inline que faz
    `setInterval(() => postMessage(0), 100)`. Timers de Worker não são congelados pela aba oculta.
    Fallback: se `Worker` não existir, `setInterval` no thread principal.
  - A cada pulso: `elapsed = now − last` (tempo real, em segundos, limitado a 5 s por pulso),
    multiplicado por `gameSpeed`; avança `tickState` em passos fixos de `SIM_STEP = 1/60` s de
    tempo de jogo até consumir o acumulado. O lote **para** quando um passo marca gol
    (`goalScored`) ou muda `matchPhase`, e descarta o resto do acumulado, para que as pausas de
    apresentação (gol, intervalo, fim) continuem funcionando.
  - Respeita `paused` (não avança) e é destruído no cleanup do componente.
- O `app.ticker` só desenha `stateRef.current`. O modo `/test` (`keepTickerAlive`) continua
  funcionando: comandos de teste que hoje chamam `tickState(state, 0)` ficam como estão.
- Emissão de `stateChanged` passa para o relógio (uma vez por pulso, depois do lote).
- Teste unitário da função de lote (`advanceSim(state, elapsedGameSeconds)`), pura: consome em
  passos fixos, para no gol, para na troca de fase.

## 4. Velocidade 4x

- O botão 2× vira um grupo 1× / 2× / 4× (`gameSpeed ∈ {1, 2, 4}`), no mesmo estilo dos outros
  controles.

## Testes e verificação

- Unitários: dev-login (condições), `axesWithMentality`, `topPlayerIds`, `advanceSim`.
- `bunx tsc --noEmit -p .` e `bun test`.
- No navegador (com o dev-login): partida trocando mentalidade, 4x, aba oculta por ~1 min e o
  relógio da partida avançou; estrela visível no elenco de um clube grande.
