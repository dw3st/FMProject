# Etapa 17 — Diretoria e torcida (#58) — Design

Data: 2026-10-03. Status: aprovado. Versão **3.2**. Visual: `.claude/rules/ui-standard.md`.

## 1. Medidores (só o clube do jogador)

`SaveMeta.board?: { board: number; fans: number; objective: SeasonObjective; history: {date, board, fans}[] }`
(0..100, início 60/60). Clubes da IA não simulam nada (regra de `.claude/rules/AI-clubs/finance.md`).
Lógica pura em `src/Domain/boardFans/` (config + funções + testes).

- **Diretoria** (atualiza a cada jogo oficial e semanalmente):
  - posição atual vs. meta da temporada (delta por rodada, proporcional à distância da meta);
  - saldo do extrato (negativo derruba aos poucos; positivo segura);
  - títulos (+), eliminação precoce na copa/continental (−, pequeno);
  - transferências: lucro grande (+), gasto acima do orçamento (−).
- **Torcida** (a cada jogo e evento):
  - resultado (últimos 5 jogos com peso maior; derrota em casa pesa mais);
  - clássico/rival (mesma cidade/estado ou maior rival do catálogo, se houver; senão maior pontuação na liga) — ×1,5;
  - títulos (+); venda de ídolo (melhor do elenco por overall ou ≥ 4 temporadas no clube via `history`) (−).
- Decaimento leve em direção a 60 (sem eventos, o humor normaliza).

## 2. Meta da temporada

Na virada do país (e na criação da carreira), a diretoria define `objective` pela posição esperada do clube
(força do elenco/`clubLevel` relativa aos clubes da liga + tier financeiro): `title` (top 1–2),
`continental` (vaga continental pela zona da liga), `top_half`, `mid_table`, `avoid_relegation`; em ligas sem
zonas continentais, só posições. Copa/continental entram como "bônus" (passar de fase rende +).
Mensagem na inbox (categoria `board`): meta da temporada.

## 3. Efeitos

- Torcida → ocupação do estádio (`FILL_RATE` da bilheteria passa a variar 0,45..0,9 conforme a torcida;
  `gateRevenue` recebe o fator) e ganho de seguidores na virada (× 0,8..1,2).
- Diretoria alta (≥ 75 no fim da temporada) → bônus de verba (lançamento `prize`/`board_bonus` no extrato).
- Diretoria baixa:
  - < 35 → aviso (inbox);
  - < 25 → ultimato: meta mínima para as próximas N rodadas (ex.: N=5, X pontos), inbox;
  - < 15 ou ultimato não cumprido → **demissão**, só se `meta.sackingEnabled` (opção do jogador na criação
    do jogo, padrão "ligado" pré-marcado).
    Demissão leva à tela de demitido existente (verificar `FiredScreen`/equivalente) e encerra a carreira
    (save marcado como encerrado; pode iniciar outra).

## 4. Telas

- Novo jogo: opção "Pode ser demitido" (chip sim/não) no passo do técnico.
- Painel, cartão Clube: medidores reais com setinha de tendência (vs. 7 dias atrás) e a meta da temporada.
- Inbox: categoria `board` (meta, aviso, ultimato, elogio, bônus, demissão).

## 5. `/test`, `/lab`

Sem efeito de partida (só fora do jogo): nada no `/test`/`/lab`. Smoke de temporada: seção "Diretoria":
medidores em 0..100, meta definida na virada, bilheteria varia com a torcida, demissão desligada não demite.

## Verificação

Testes puros (deltas, meta por força, decaimento, ultimato, demissão on/off), rota/criação com a opção,
smoke. Changelog 3.2, `.claude/rules/game/board-fans.md`, ROADMAP etapa 17 ✅.
