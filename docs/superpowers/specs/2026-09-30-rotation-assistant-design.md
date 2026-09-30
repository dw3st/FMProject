# Rotação: assistente do clube do jogador (+ #10) — Design

Data: 2026-09-30. Status: aprovado. Etapa 6 do `docs/ROADMAP.md` (2.3 Rotação + #10). Versão **1.6**.

A IA já roda o elenco por fôlego desde a Etapa 4 (`autoFillLineupWithFitness`). Falta o clube do
jogador, cuja escalação salva é usada sempre (só lesionados são trocados).

## 1. Regra de troca (pura)

`suggestRotation(slots, lineup, players, date)` em `src/Domain/lineupHelpers.ts` → `{ out, in }[]`.
Mesma regra do seletor da IA: titular com fôlego < `TIRED_FITNESS_THRESHOLD` (75) — goleiro só
< `GK_TIRED_FITNESS_THRESHOLD` (60) e com reserva ≥ `GK_BENCH_FITNESS_FLOOR` (85) — é trocado pelo
melhor reserva elegível da mesma posição por `fitnessAdjustedValue`, só se
`valorReserva ≥ valorTitular × BENCH_SWAP_RATIO`. Reserva lesionado nunca entra; um reserva só é
usado uma vez. Aplica-se sobre a escalação já sem lesionados (`replaceInjuredStarters`).

## 2. Sugestão na prévia (sempre)

- `POST /api/match-setup` devolve `rotationSuggestion: { out, in }[]` (vazio se nada a sugerir).
- `MatchPreviewScreen`: bloco "Poupar N cansados?" listando "sai X (62%) → entra Y (94%)",
  botões **Aplicar** e **Ignorar**. Aplicar vale só para este jogo (não grava a escalação salva).
- O jogo usa a escalação ajustada: ao vivo (`MatchScreen` recebe as trocas aceitas) e simulado
  (`advanceDay`/`resolveUserLineup` recebe as trocas aceitas do dia). As trocas aceitas ficam em
  `meta.rotationOverride = { date, swaps }` do save, válidas só para aquela data.

## 3. Liga/desliga "Assistente escala por fôlego"

- Campo `assistantRotation: boolean` em `TacticsSave` (padrão `false`), na tela de táticas.
- Ligado: `resolveUserLineup` aplica `suggestRotation` sozinho a cada jogo. A prévia mostra
  "O assistente poupou N jogadores" com a lista e um **Desfazer** (só este jogo — grava um override
  vazio com `optOut: true` para a data).

## 4. #10

`docker-compose.yml`: `ports: "127.0.0.1:9400:3000"`. Só o túnel da Cloudflare (host network no
mesmo servidor) acessa; `192.168.18.52:9400` deixa de abrir. Verificar no deploy.

## Verificação

- Unit: `suggestRotation` (cansado trocado; goleiro isento; sem reserva melhor não troca; lesionado
  nunca entra; reserva não usado duas vezes).
- Integração: 3 jogos em 7 dias com `assistantRotation` ligado poupa ao menos 1 titular no 3º;
  override aceito vale só na data.
- Smoke de temporada: com o assistente ligado no clube do jogador, alguma partida teve XI ≠ escalação
  salva por fôlego.
- `/test` e `/lab` sem mudança (mesma lógica da IA, já exposta).
- Changelog 1.6; ROADMAP (Etapa 6 ✅, #10 fechado).
