# VAR e reclamação do técnico — desenho

Etapa 39 do `docs/ROADMAP.md` (#109), versão **4.18**. Decisões do usuário (2026-10-10) no §9. Depende da
Etapa 38b (árbitros com qualidade e rigor, `.claude/rules/game/referees.md`), das faltas e cartões
(`.claude/rules/game-engine/fouls.md`) e do impedimento (`game-rules/offside.md`).

## 1. Objetivo

- O juiz passa a errar de vez em quando, e quanto pior o árbitro, mais erra.
- Nas competições com VAR, a maioria desses erros é corrigida numa revisão curta e visível.
- O técnico do jogador pode reclamar com o árbitro depois de um lance contra o time: ganho pequeno, risco de cartão e
  suspensão.

## 2. Erros do juiz (motor completo)

Cinco tipos de erro (`RefereeErrorKind`), rolados no momento da decisão, sem nenhum sorteio novo quando o árbitro não
existe (s = qualidade ausente ⇒ jogo de antes, por construção):

| Tipo | Quando rola | Efeito sem correção |
|---|---|---|
| `phantom_penalty` | Desarme/duelo **sem falta** do defensor dentro da própria área | Pênalti marcado (sem cartão) |
| `missed_penalty` | Falta do defensor dentro da própria área | Jogo segue (sem pênalti, sem cartão) |
| `missed_offside` | Receptor em impedimento num passe/bola em profundidade/bola alta | Bandeirinha não marca; jogo segue |
| `wrong_red` | Falta que daria amarelo | Vermelho direto |
| `missed_red` | Falta que daria vermelho direto | Amarelo |

- Chance = `BASE[tipo] × qualityMult(q)`, `qualityMult = 1,5 − 0,8 × q/100` (≈1,5 no pior, ≈0,7 no melhor, 1 em 62,5).
- Meta (medida): **≈ 0,25 erro por partida** (1 a cada 4 jogos) com o árbitro médio, antes do VAR.
- `phantom_penalty` e `missed_penalty` calibrados para se compensarem: volume de gols do mundo ±3% (M1).
- Partida sem árbitro (save antigo, `/test` com "Off", `/lab` sem variante de árbitro): nenhum erro.
- Constantes em `src/GameEngine/Configs/VarConfig.ts` (`VAR_CONFIG`); lógica pura em `src/GameEngine/Domain/Var.ts`.

## 3. VAR

- **Competições com VAR** (`hasVar(fixture)`, puro, `src/Domain/referees/var.ts`): 1ª divisão dos 10 países das
  ligas principais (os mesmos de `scripts/faces/wikidata.ts` `LEAGUES`), as 4 continentais, e copa nacional a partir
  das quartas (`qf`, `sf`, `final`). Base nunca.
- **Lances revisáveis:** pênalti marcado, gol (impedimento não marcado no lance — o receptor impedido participou da
  posse que terminou em gol em até `GOAL_CHAIN_SECONDS` 15 s de jogo), vermelho direto, falta na área não marcada
  (`missed_penalty`). `wrong_red`/`missed_red` revisáveis. Impedimento marcado errado não existe (o motor não gera).
- **Correção:** cada erro revisável é corrigido com `CORRECTION` 0,8. Lances certos também são revistos às vezes
  (`CHECK_CORRECT` 0,25 dos pênaltis/vermelhos certos), sempre confirmados (sem erro do VAR).
- **No motor:** a revisão é uma fase morta curta (`GameState.varReview`, como os congelamentos de bola parada): o jogo
  para `REVIEW_SECONDS` (3 s reais na partida ao vivo; nenhum tempo de jogo), e a decisão é aplicada:
  - pênalti anulado → tiro livre indireto para o time que defendia (no ponto do lance);
  - pênalti não marcado corrigido → pênalti (cobrança normal, `resolveInMatchPenalty`), com o cartão que a falta teria;
  - gol anulado → placar desfeito, tiro livre de impedimento para o time que sofreu; estatística do gol e da nota
    revertidas (evento `goalDisallowed` que `Statistics`/`PlayerRating` desfazem);
  - vermelho errado → vira amarelo (o jogador volta se a expulsão ainda não tirou ninguém: a revisão acontece antes da
    remoção); vermelho não dado → vermelho.
- Eventos: `varReview { kind, outcome: confirmed|overturned, team, playerId }`, `refereeError { kind, corrected }`,
  `goalDisallowed`. Debug: categoria `var`.
- **quickSim:** sem lance; sorteia por Poisson erros (pela qualidade) e revisões (se a fixture tem VAR) só como
  estatística da partida e do árbitro. Placar, gols e cartões não mudam.

## 4. Reclamar com o árbitro (só o técnico do jogador, partida ao vivo)

- O botão "Reclamar" aparece por `COMPLAINT_WINDOW` 6 s reais depois de um lance contra o time do jogador: falta
  marcada contra, cartão para um jogador dele, pênalti contra, impedimento contra, revisão do VAR contra.
- Por reclamação (n = reclamações já feitas no jogo, s = rigor do árbitro):
  - amarelo `0,20 × (1 + 0,6 n) × (1 + 0,3 s)`; com amarelo já recebido, vermelho; vermelho direto `0,02 × (1 + n)`;
  - sem cartão: +1 de moral no elenco (pelo `withEventDelta`, uma vez por jogo) e, com chance 0,15, rigor do
    árbitro contra o adversário +0,25 até o fim do jogo (`GameState.refereeBias`, só nas faltas/cartões do time B);
  - no máximo uma reclamação por lance.
- **Cartão do técnico:** amarelo = diretoria −1; vermelho = diretoria −3, expulso da beira do campo (o resto do jogo sem
  mexer: substituições automáticas do auxiliar como a IA, sem tática/mentalidade) e suspensão
  `SaveMeta.managerBan = { matches }` (1 jogo; 2 se foi a 3ª reclamação ou mais). Inbox `discipline` /
  `manager_banned`.
- **Jogo suspenso:** a escalação e a tática antes do jogo continuam do jogador; na partida, painel de substituições e
  tática desligados ("Técnico suspenso"), trocas automáticas do auxiliar (`aiSubstitutions` ligado para o time A).
  A partida conta 1 jogo cumprido ao terminar (qualquer competição oficial do clube). Prévia mostra o aviso.
- Técnicos da IA não reclamam.

## 5. Estatísticas e telas

- `Statistics.ts` (time): `refereeErrors`, `varReviews`, `varOverturned`; `MatchTeamStats` opcionais; day log
  `MatchEvent.var = { errors, reviews, overturned }`.
- **Estatísticas → Árbitros:** colunas Erros/J e Revisões (anuladas).
- **Partida ao vivo:** faixa VAR ("Checando pênalti…" → "Pênalti anulado"), linha no Resumo, botão Reclamar perto do
  placar, cartão do técnico no Resumo e no técnico desenhado (cartão sobre a cabeça como o árbitro).
- **Resultado:** lances do VAR na lista de eventos.
- i18n `var.*`, `complaint.*` (en, pt-BR). Changelog 4.18; `upcoming` sem o VAR.

## 6. `/test`, `/lab`, MCP

- `/test`: seletor "Ref error" (Off · Auto · forçar cada tipo no próximo lance possível), chip "VAR" (on/off),
  cenário `var-penalty` (pênalti inventado revisto e anulado), botão "Complain" para o time A, `EnergyPanel` com a
  qualidade e o `refereeBias`.
- `/lab`: `Variant.var` (bool) e `Variant.refereeQuality`; `TeamRawStats.refereeErrors/varReviews/varOverturned` →
  `VariantSummary` → linhas no `PairDetail`.
- MCP `summary` mostra `varReview` e `refereeBias`.

## 7. Medições

- **M1** (motor, Premier + Championship, ~1200 jogos por braço, com × sem erros): gols, chutes, pênaltis e cartões
  ±3%; erros/jogo ≈ 0,25 sem VAR; com VAR, erros sobreviventes ≈ 0,05.
- **M2** (qualidade 20 × 90): erros ~2×.
- **M3** (reclamação, simulação pura de 10 000 jogos com 2 reclamações): taxa de amarelo/vermelho/suspensão por
  temporada (meta: ~1 suspensão por temporada reclamando sempre, quase nenhuma reclamando pouco).
- quickSim pareado: placar idêntico.

## 8. Testes e smoke

- Puros: chances, `hasVar`, correção, reclamação, suspensão.
- Motor: cada tipo de erro forçado gera o efeito; o VAR o corrige; gol anulado desfaz placar e estatística; sem
  árbitro nada muda (mesmo `Math.random` ⇒ mesmo resultado).
- Rota da gravação: a partida ao vivo grava `managerCards`; o avanço do dia aplica a suspensão e a desconta.
- Smoke, seção "VAR": erros e revisões no log só com árbitro; VAR só em fixtures com VAR; gol anulado nunca no placar;
  suspensão forçada pela rota cumpre 1 jogo e some.

## 9. Decisões do usuário (2026-10-10)

- VAR na 1ª divisão das 10 ligas principais, continentais e copas a partir das quartas.
- Técnico suspenso assiste ao jogo sem mexer; o auxiliar faz as trocas.
- Cerca de 1 erro importante a cada 4 jogos antes do VAR; juiz fraco erra ~2× o bom.
- Os ~10% piores árbitros continuam sem apitar (sem rodízio).
- Erro simulado dentro do motor (não sorteado depois do jogo).

## 10. Limitações

- Sem impedimento marcado errado, sem gol com falta no lance, sem mão.
- O VAR nunca erra.
- Técnicos da IA não reclamam nem são expulsos.
- O quickSim não muda placar por erro de árbitro.

## 11. Resultados (2026-10-11)

Bases finais (`VAR_CONFIG.BASE`): `phantom_penalty` 0,014 · `missed_penalty` 0,2 · `missed_offside` 0,11 · `wrong_red`
0,0045 · `missed_red` 0,3. Duas rodadas de calibração antes: a 1ª dava 0,19 erro/jogo com mais pênaltis inventados que
não marcados; a 2ª acertava o volume, mas o `wrong_red` (0,02) quase dobrava os vermelhos (+74%), então ele caiu para
equilibrar com o `missed_red` e o impedimento subiu.

**M1** (`bun scripts/var-measure.ts engine <liga> 400 --arm none|err|var --seed 11`, Premier + Championship, 800 jogos
por braço, árbitro médio q 62,5, rigor 0; "none" = sem qualidade = o motor de antes):

| Braço | Gols | Chutes | Pênaltis | Amarelos | Vermelhos | Erros/jogo | Corrigidos | Sobreviventes | Revisões | Gols anulados |
|---|---|---|---|---|---|---|---|---|---|---|
| none | 1,926 | 5,004 | 0,334 | 2,35 | 0,080 | — | — | — | — | — |
| err | 1,999 (+3,8%) | 5,197 | 0,339 (+1,5%) | 2,28 (−3%) | 0,085 (+6%) | 0,260 | — | 0,260 | — | — |
| var | 1,996 (+3,6%) | 5,142 | 0,370 (+11%) | 2,35 | 0,092 | 0,318 | 0,154 | 0,164 | 0,224 | 0,005 |

Ruído de cada braço ~±3% nos gols (800 jogos). Erros por tipo (err): impedimento 0,12, pênalti não marcado 0,07,
pênalti inventado 0,055, vermelho errado 0,007, vermelho não dado 0,007. Com VAR, os sobreviventes são quase todos
impedimentos que não viraram gol (0,136/jogo, irrelevantes por desenho: o VAR só revê o gol); sem eles, sobram
**0,033** erros por jogo (meta ≈ 0,05).

**M2** (`--quality 20` × `90`, Premier, 300 jogos cada): 0,333 × 0,167 erro/jogo = **2,0×**.

**M3** (`bun scripts/var-measure.ts complaint 10000`, temporadas de 38 jogos, rigor sorteado −0,5..0,5): reclamando 1
vez por jogo, 7,3 amarelos e **0,75 suspensão** por temporada; 2 vezes, 4,1 suspensões; 3 vezes, 8,2 (13,3 jogos); sem
reclamar, nenhuma.

**quickSim pareado** (`quick 2000`): placar e estatísticas dos jogadores idênticos em 2000 de 2000 jogos; 0,236 erro,
0,172 revisão, 0,107 alterada por jogo (constantes `QUICK_*` ajustadas depois para o motor: 0,28 erro, 48% corrigidos).

**Desvios do desenho:** impedimento não marcado só no passe normal e na bola solta (não na disputa aérea); o erro
forçado do `/test` é sempre corrigido com VAR (salvo o impedimento); erros e revisões contados por time no
`Statistics` (prejudicado / contra quem foi a decisão), o total do jogo em `MatchEvent.var`; reclamações perdidas ao
recarregar a página no meio da partida; gols do mundo +3,7% (dentro do ruído, mas acima da meta de ±3%).
