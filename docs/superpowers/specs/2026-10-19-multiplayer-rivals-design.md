# Rivais: resultados, placar ao vivo e resenha na liga de amigos

Data: 2026-10-19. Versão alvo: **4.34**. Depende do multiplayer partes 2–5a (`.claude/rules/game/multiplayer.md`) e do
chat (`.claude/rules/social.md`). Vale só em mundos `mode: "multi"` com `world`; o solo não muda.

## Objetivo

Jogando numa liga de amigos, o técnico hoje não sabe como os outros estão indo. Ele deve ver, sem procurar:

1. o resultado de cada jogo dos amigos assim que o dia roda;
2. um painel com a situação de cada amigo (posição, forma, próximo jogo);
3. o placar da partida ao vivo de um amigo enquanto ela acontece, inclusive durante a própria partida;
4. um jeito rápido de provocar: reações em ícone e frases prontas, enviadas ao chat da liga.

Tom: sóbrio. **Nenhum emoji** e nenhum texto com cara de gerado — frases curtas, do jeito que se fala na resenha;
textos de tela no mínimo ("Fabio · Vasco 0–3 Bahia").

## 1. Resultados do dia

- **Fonte:** o executor do avanço em grupo (`src/backend/groupAdvance.ts`) roda um dia por vez. Depois de cada dia
  gravado, monta os jogos dos clubes humanos daquele dia a partir de `outcome.payload.events` (`MatchEvent` cujo
  `home` ou `away` é o `clubId` de um assento): `buildSeatResults` (puro, `src/Domain/rivals/results.ts`).
- **`SeatResult`** (`src/types/rivalsTypes.ts`): `id` (`<data>:<competição>:<fixtureId>:<seatId>`), `date`, `seatId`,
  `nickname`, `clubId`, `clubName`, `opponentId`, `opponentName`, `home: boolean`, `competition`, `score`
  (do ponto de vista do clube: `for`, `against`), `decider?` (pênaltis), `goals` (minuto, lado, autor; vem de
  `MatchEvent.goals`, o motor completo sempre grava) e `situations` (abaixo). Um jogo entre dois assentos vira dois
  resultados, um para cada lado.
- **Situações** (`resultSituations`, puro): `big_win` (saldo ≥ 3), `big_loss` (saldo ≤ −3), `home_loss`, `away_win`,
  `comeback_win` (esteve perdendo e venceu), `blown_lead` (esteve vencendo e não venceu), `late_equalizer` (empatou
  aos 88' ou depois), `late_winner` (gol da vitória aos 88' ou depois), `draw`, `win`, `loss`, `shootout_win`,
  `shootout_loss`. Sempre ao menos uma (`win`/`draw`/`loss`).
- **Gravação:** `saves/{id}/rivalsFeed.json` (do mundo, bufferizado na fase 1 como os demais), lista dos últimos
  `RIVALS.FEED_MAX` (300) resultados, mais novos primeiro; id repetido num dia refeito não duplica.
- **Push:** depois do `flush` do dia, evento `world_results { saveId, results: SeatResult[] }` para todos os
  membros (sem o e-mail, só apelidos). Cada membro recebe todos, inclusive os próprios (a tela filtra).

## 2. Painel Rivais

- **Rota:** `GET /api/worlds/:saveId/rivals` (membro; solo 409 `notMulti`): uma linha por assento atual:
  apelido, rosto (`managerFaceUrl`), clube, liga, posição na liga (tabela do save), forma (últimos 5 do feed, V/E/D),
  último resultado, próximo jogo (`seatMatchDates`), pontos e posição na classificação da liga de amigos
  (`standingsView`), e o placar ao vivo, se houver (seção 3).
- **Telas:**
  - `/world` ganha as abas **Rivais** (tabela padrão `TABLE_STYLE`, a própria linha destacada, abre o feed filtrado
    do amigo) e **Resultados** (o feed por dia, filtro por amigo, cada linha com as ações de resenha).
  - Painel do jogo: cartão **Rivais** (só no multi) com uma linha por amigo: apelido, posição, forma em 5
    marcadores, e "ao vivo · 1–0 · 67'" quando joga.
  - Aviso de resultado: no canto inferior esquerdo (mesma pilha do `ChatPopups`), um por resultado novo de amigo,
    "Fabio · Vasco 0–3 Bahia", borda fina na cor do resultado (`primary` vitória, `muted` empate, `destructive`
    derrota), com os botões de resenha; some em 8 s, no máximo 3 na tela (o resto só no feed).
- Recarrega com `world_results`, `world_members` e `friend_live`.

## 3. Placar ao vivo do amigo

- **Envio (cliente → servidor), pelo socket `/api/ws`:** novo `ClientEvent`
  `live_score { saveId, fixtureId, phase, minute, score: { for, against }, scorer? }`, `phase` ∈ `start`, `goal`,
  `half`, `end`. O `MatchScreen` manda `start` no apito inicial, `goal` em cada gol (com o nome do autor), `half` no
  intervalo e `end` no fim, só num mundo multi. Nada além disso (~5–10 mensagens por jogo).
- **Validação no servidor** (`src/backend/rivals/liveScores.ts`): usuário membro do save; o jogo é do clube do
  assento dele na data atual do mundo (`fixtureId` em `seatMatchDates` daquele dia); placar não negativo e só
  crescendo; minuto 0..130; no máximo `RIVALS.LIVE_MAX_EVENTS` (40) eventos por jogo; frame inválido é ignorado em
  silêncio, como os demais do socket.
- **Estado:** em memória, por mundo (`Map<saveId, Map<seatId, LiveScore>>`), com apelido, clube, adversário, placar,
  minuto, último gol, `updatedAt`. Sai quando chega `end` (fica 10 min como "terminado"), quando o executor roda o
  dia daquele jogo, ou depois de 15 min sem evento ("interrompido", depois some). Fechar o socket do jogador não
  apaga na hora (a carência cobre um recarregar).
- **Repasse:** `ServerEvent` `friend_live { saveId, live: LiveScoreView | null, seatId }` aos outros membros.
  `GET /api/worlds/:saveId/live` devolve os placares em andamento (quem abriu a tela depois).
- **É provisório:** o resultado oficial continua sendo o do dia (seção 1). A tela escreve "ao vivo".
- **Telas:**
  - Na própria partida ao vivo: faixa discreta acima do campo, uma linha por amigo jogando
    ("Fabio · 1–0 · 67'", escudo 20px). Num gol dele a linha destaca por 4 s e mostra o autor. Clicar na linha abre
    as ações de resenha num popover pequeno, sem pausar a partida.
  - Fora da partida: no cartão Rivais e na aba Rivais; um gol vira um aviso no canto ("Fabio · gol · 1–0 · 67'").
- `/test`, `/lab`: nada (não é mecânica do motor).

## 4. Resenha: reações e frases

- **Reações:** 4, em ícone do `Icons.tsx` (monocromático, `text-muted-foreground`, hover `text-foreground`):
  `applause` (palmas), `fire`, `laugh`, `sorry` (lamento). Ícones novos entram no `Icons.tsx`.
- **Frases:** catálogo fixo `src/Domain/rivals/taunts.ts`: `TAUNTS: Record<situação, string[]>` (ids), textos em
  `rivals.taunts.<id>` (pt-BR e en). Umas 4 por situação, mais um grupo `live_goal_against` (gol sofrido ao vivo) e
  `live_goal_for`. Exemplos pt-BR:
  - `home_loss`: "Em casa, hein." · "A torcida pediu o ingresso de volta."
  - `big_loss`: "Três no lombo." · "Foi passeio."
  - `big_win`: "Tá voando." · "Chegou chegando."
  - `late_equalizer`: "Salvou no apagar das luzes."; `blown_lead`: "Quase, né."
  - `comeback_win`: "Virou e calou geral." · "Tava morto."
  - `live_goal_against`: "Ih." · "Acordou não, né?"
  O menu mostra só as frases das situações daquele resultado (ou do lance ao vivo). O usuário revisa o catálogo antes
  de publicar.
- **Envio:** `POST /api/worlds/:saveId/taunts { target: { result: id } | { live: seatId }, kind: "reaction" | "phrase", id }`
  (membro; lobby 409). O servidor confere que o alvo existe (feed ou placar ao vivo), que não é do próprio assento
  (400 `self`) e que a frase pertence a uma situação do alvo (400 `invalidTaunt`); usa o limite de mensagens do chat
  (429). Grava uma mensagem na sala `world:<saveId>` com `meta` (nova coluna `chat_messages.meta`, JSON, migração
  só aditiva): `{ taunt: { kind, id, target: nickname, club, opponent, score, live?, minute? } }` e um `body` em
  inglês como fallback. Nenhum texto livre do cliente entra.
- **No chat:** `ChatMessageView.taunt?` — a mensagem aparece como uma linha sóbria: escudo 20px, "Vasco 0–3 Bahia"
  em `tabular-nums`, o ícone da reação ou a frase em itálico abaixo, traduzida no idioma de quem lê. O alvo recebe o
  aviso de mensagem nova como qualquer mensagem do chat.

## Arquivos (previstos)

| Arquivo | Papel |
|---|---|
| `src/types/rivalsTypes.ts` | `SeatResult`, `ResultSituation`, `LiveScoreView`, `RivalRow`, `TauntMeta` |
| `src/Domain/rivals/rivalsConfig.ts` | `RIVALS` (tamanho do feed, limites do ao vivo, tempos dos avisos) |
| `src/Domain/rivals/results.ts` (+ teste) | `buildSeatResults`, `resultSituations`, `formOf` |
| `src/Domain/rivals/taunts.ts` (+ teste) | catálogo, `tauntsFor(situations)`, validação |
| `src/Domain/rivals/liveScore.ts` (+ teste) | validação pura de um `live_score` contra o estado anterior |
| `src/backend/rivals/liveScores.ts` | estado em memória, repasse, limpeza |
| `src/backend/rivals/rivalsRoutes.ts` | `rivals`, `live`, `results` (feed paginado), `taunts` |
| `src/backend/groupAdvance.ts`, `dal/*`, `SaveService.ts` | feed do dia, `world_results` |
| `src/backend/db.ts`, `social/socialStore.ts`, `social/realtime.ts` | coluna `meta`, `live_score` no socket |
| `src/GameInterface/World/Rivals*.tsx`, `ResultsFeed.tsx`, `TauntActions.tsx`, `LiveRivalsStrip.tsx` | telas |
| `src/GameInterface/Social/ChatWindow.tsx`, `ChatPopups.tsx` | mensagem de resenha, avisos de resultado e gol |
| `src/GameInterface/Dashboard/HomeCards.tsx`, `MatchScreen.tsx` | cartão Rivais, faixa e envio do placar ao vivo |

## Testes

- Puros: resultados de um dia (um lado, dois assentos se enfrentando, pênaltis), situações (cada uma, virada pelo
  minuto dos gols), forma, catálogo (toda situação tem frase; toda frase tem chave pt-BR e en), validação do placar
  ao vivo (placar caindo, minuto fora, jogo de outra data, excesso de eventos).
- Backend: `world_results` chega a todos os membros depois do dia e o feed não duplica num dia refeito; `live_score`
  de quem não é membro ou de jogo alheio é ignorado; `GET live` some depois do dia rodar; `taunts` 400/403/409/429,
  mensagem com `meta` e sem texto livre; DM/solo intactos.
- i18n: chaves `rivals.*` nas duas línguas.
- `bun run ui:audit` limpo.

## Fora do escopo

Assistir ao campo do amigo; frases escritas pelo jogador além do chat; resenha no solo; reações a jogos da IA;
histórico de resenhas além do próprio chat.

## Limitações

- Placar ao vivo depende do navegador de quem joga: aba fechada vira "interrompido" até o dia rodar.
- O placar ao vivo é do cliente (só validado por coerência); o oficial é o do dia.
- Estado ao vivo em memória (um processo só, como o resto do multiplayer).
