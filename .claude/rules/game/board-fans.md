# Diretoria e torcida

Spec: `docs/superpowers/specs/2026-10-03-board-fans-design.md`. Etapa 17 do `docs/ROADMAP.md` (#58), versão
**3.2**. Visual: `.claude/rules/ui-standard.md`.

## Regra

- Dois medidores 0..100 **só do clube do jogador**, em `SaveMeta.board` (`BoardState`, `src/types/boardTypes.ts`):
  `board` (diretoria) e `fans` (torcida), início 60/60. Clubes da IA não simulam nada
  (`.claude/rules/AI-clubs/finance.md`: regras, não simulação).
- `SaveMeta.sackingEnabled`: opção do novo jogo ("Pode ser demitido", chip Sim/Não no passo do técnico, Sim
  pré-marcado). Sem ela, não há ultimato nem demissão; aviso e elogio continuam.
- `SaveMeta.ended` (`CareerEnded`): gravado na demissão. A carreira acabou: `advanceOneDay` devolve **409**, e
  toda tela de carreira redireciona para `/fired` (`GameSaveProvider`, exceto `/`, `/login`, `/start`,
  `/new-game`, `/fired`, `/test`, `/lab`, `/coming-soon`). O jogador pode começar outra carreira.
- Sem migração (protótipo): save sem `board` simplesmente não tem medidores.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/boardFans/boardFansConfig.ts` | Todas as constantes (`BOARD_FANS`) |
| `src/Domain/boardFans/boardFans.ts` (+ teste) | Puro: meta, partida, eventos, transferências, semana, revisão (aviso/ultimato/elogio/demissão), fim de temporada, bônus, histórico/tendência, ocupação do estádio, seguidores |
| `src/backend/boardWorld.ts` | E/S: `objectiveFromSquads` (força `clubLevel` + tier da liga), `boardAfterMatches` (jogos do dia do clube do jogador) |
| `src/backend/SaveService.ts` | `createSave` grava `sackingEnabled` e o `board` inicial com a primeira meta |
| `src/backend/advanceDay.ts` | Partidas, copa/continental, venda na lista, segunda-feira, virada, revisão diária, demissão, inbox `board` |
| `src/backend/transfers.ts` | Compra do jogador que deixa o saldo negativo (diretoria −4) |
| `src/backend/advanceUntil.ts` | Para o avanço rápido no dia da demissão (`sacked`) |
| `src/Domain/finance/gate.ts` | `gateRevenue(..., fillRate)` |
| `src/GameInterface/Dashboard/HomeCards.tsx` (`ClubCard`) | Medidores reais com seta de tendência (7 dias), meta e ultimato |
| `src/GameInterface/FiredScreen.tsx` | Tela de demitido com `meta.ended` (motivo, tempo no clube, jogos, aproveitamento, posição, títulos) |
| `src/GameInterface/NewGameWizard.tsx` | Opção "Pode ser demitido" |
| `src/GameInterface/InboxScreen.tsx`, `boardText.ts` | Categoria `board` |

## Meta da temporada (`objectiveFor`)

Posição esperada = posição do clube ordenando a liga por `clubLevel` + bônus de tier (LOW −0,1, MEDIUM 0, HIGH
+0,1, ELITE +0,2; o jogador usa o tier natural da receita). `target` = pior posição que ainda cumpre:

| Posição esperada | Meta | `target` |
|---|---|---|
| ≤ 2 | `title` | 1 |
| ≤ vagas continentais da zona (`ucl`/`uel`/`uecl`/`lib`/`sud`, maior `to`) | `continental` | última vaga |
| ≤ metade | `top_half` | metade |
| a 2 posições ou menos da zona `rel` | `avoid_relegation` | n − rebaixados |
| resto | `mid_table` | 70% da liga (acima da zona) |

Liga sem zonas continentais: só posições. Definida no `createSave` (a mensagem sai no `/presimulate`, depois do kit)
e na virada do país do jogador, com a composição nova (depois das mudanças de liga). Copa e continental são bônus.

## Medidores

| Evento | Diretoria | Torcida |
|---|---|---|
| Jogo oficial (liga, copa, continental) | V +0,8 / E 0 / D −0,8 (×1,5 clássico) | V +2,5 / E −0,3 / D −2,5; derrota em casa ×1,5; clássico ×1,5; forma: (pontos dos últimos 5 − 7 × n/5) × 0,3 |
| Jogo da liga | + 2,5 × (meta − posição) / tamanho × peso (0,4 → 1 ao longo da temporada) | — |
| Mata-mata decidido nos pênaltis | conta como vitória/derrota | idem |
| Título (liga na virada; copa/continental no dia) | +12 | +12 |
| Fase passada na copa/continental | +1 | +1,5 |
| Eliminação precoce (copa antes das quartas, continental na fase de grupos) | −2,5 | −2 |
| Acesso / rebaixamento | +10 / −15 | +10 / −12 |
| Venda com taxa ≥ 10% da receita anual | +3 | — |
| Venda de ídolo (melhor overall do elenco ou ≥ 4 temporadas no clube pelo `history`) | — | −8 |
| Compra que deixa o saldo negativo | −4 | — |
| Segunda-feira, saldo negativo | −1 a −2,5 (mais fundo, mais cai) | — |
| Segunda-feira, saldo ≥ 0 | +0,2 | — |
| Segunda-feira, deriva para 60 | 2% da distância | 3% da distância |

Clássico: mesma cidade (`venue.city`, sem acento/caixa); sem rival da cidade, o líder da liga.

## Revisão diária (`reviewBoardStatus`) e demissão

- `< 35`: aviso (uma vez por queda; rearma em ≥ 40). `≥ 80`: elogio (rearma abaixo de 70).
- `< 25` (só com `sackingEnabled`): ultimato — 7 pontos nas próximas 5 partidas da liga. Cumprido: +5, mensagem
  `ultimatum_met`. Não cumprido: demissão.
- `< 15` (só com `sackingEnabled`): demissão.
- A demissão grava `meta.ended` (data, motivo `board`/`ultimatum`, clube, liga, posição, medidores, campanha), manda a
  mensagem `sacked` e a resposta do dia traz `sacked: true` (o front vai para `/fired`).

## Fim de temporada (virada do país do jogador)

1. Seguidores: a variação da reação (`applyHumanSeasonReaction`) × 0,8..1,2 pela torcida (perda: o espelho).
2. `evaluateSeason`: meta cumprida +8 + 12 × folga/tamanho (máx. 15); falhada −(6 + 30 × distância/tamanho) (máx. 20).
3. Título da liga, acesso, rebaixamento.
4. Diretoria ≥ 75: bônus = receita anual × (2% + 4% × (diretoria − 75)/25), lançado no extrato da temporada nova
   como `prize` com `ref.stage = "board_bonus"` (`ledgerText` → `boardBonus`), mensagem `bonus`.
5. Demissão (só a decisão; avisos vêm da revisão diária).
6. Meta nova; os dois medidores mantêm metade da distância a 60; o ultimato cai.

## Efeitos

- **Bilheteria:** `stadiumFillRate(fans)` — 0,45 (torcida 0), 0,65 (60, igual a `GATE.FILL_RATE` da IA), 0,9 (100),
  linear por partes. `computeAdvanceDayMoney({ fillRate })` e a projeção do `FinancesScreen`.
- **Seguidores:** ver "Fim de temporada".

## Inbox `board`

`BoardInboxMessage` (`kind`: `objective`, `warning`, `ultimatum`, `ultimatum_met`, `praise`, `bonus`, `sacked`),
enfileirada em `boardMessages` e gravada depois do `clearInbox` da virada. Assunto e texto traduzidos na tela
(`inbox.board.*`); o assunto gravado é só o fallback em inglês.

## Telas

- Painel, cartão do clube: diretoria e torcida com a seta (`trendOf`, contra 7 dias atrás em `board.history`,
  14 fotos diárias), a meta (`board.objective.*`) e o ultimato em andamento.
- `/fired`: dados reais de `meta.ended`; "Encontrar novo clube" abre o novo jogo.

## `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## Testes e smoke

```
bun test src/Domain/boardFans src/backend/board.advanceDay.test.ts src/Domain/finance src/Domain/inbox
```

`board.advanceDay.test.ts`: demissão ligada por padrão e diretoria no chão → `sacked`, `meta.ended`, mensagem e 409 no
dia seguinte; demissão desligada com tudo em 0 → nunca demite nem dá ultimato; a virada define a meta nova.

`scripts/season-rollover-smoke.ts` (save com demissão desligada), seção "Diretoria": medidores presentes e em 0..100
todo dia, meta nova na virada (e mensagem `objective`), nunca demitido, toda bilheteria da liga dentro da faixa de
ocupação da torcida e variando com ela. A checagem do saldo na virada lê a bilheteria e o bônus da diretoria do extrato
do dia; a de seguidores aceita a faixa 0,8..1,2.

## Limitações

- O peso de clássico por cidade depende de `venue.city` dos dados; clubes sem cidade só têm o "jogo grande" contra o líder.
- Venda de ídolo só pela lista de venda (mercado da IA); não há outra saída de jogador com taxa do clube do jogador.
- A tendência compara com a foto mais recente de 7+ dias atrás; uma carreira nova não mostra seta na primeira semana.
