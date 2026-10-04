# Etapa 20 — Convites de clubes (troca de clube na carreira) — Design

Data: 2026-10-04. Status: aprovado. Versão **3.5**.

## Ideia

O técnico do jogador recebe propostas de outros clubes de acordo com a reputação dele: posição no ranking de
técnicos, campanha da temporada e títulos. Ele pode aceitar e trocar de clube no meio da carreira, sem começar
um jogo novo. A demissão deixa de encerrar a carreira: o técnico fica desempregado e recebe propostas de clubes
menores.

## 1. Reputação do técnico (puro, `src/Domain/jobs/`)

`reputation` 0..100, calculada na hora (nada gravado além do que já existe):

```
reputation = 45 % ranking (posição no mundo → percentil)
           + 30 % temporada atual (diretoria 0..100)
           + 15 % títulos nas últimas 3 temporadas (liga, copa, continental, acesso; pontos do ranking)
           + 10 % tempo de carreira (temporadas, satura em 5)
```

## 2. Quem oferece (força do clube)

Cada clube do mundo tem um **prestígio** = percentil do `clubLevel` no mundo, puxado pelo tier financeiro
(LOW −0,1 … ELITE +0,1). Um clube só oferece se o prestígio dele estiver na faixa
`[prestígio atual − 0,05, reputação/100 + 0,10]`, ou seja, um passo acima, com rara chance de um salto maior.
Desempregado: a faixa vai até o prestígio do último clube − 0,05 (clubes menores).

- Preferência: mesmo país (peso 3), mesmo continente (2), resto (1); só ligas com calendário ativo.
- Nunca o próprio clube, nunca um rival direto (mesma cidade) no meio da temporada.

## 3. Quando chegam

| Janela | Ofertas | Validade |
|---|---|---|
| Virada do país do jogador (fim de temporada) | 0–3, sorteio pela reputação (reputação 80 → ~2 em média; 40 → ~0,3) | até o primeiro jogo da temporada nova |
| Meio da temporada (uma vez, ~metade das rodadas) | 0–1, só se a reputação ≥ 60 ou a diretoria ≥ 80 | 7 dias |
| Desempregado (demitido) | 1–3 ofertas a cada 2 semanas de jogo | 14 dias |

Mensagem nova na inbox, categoria `job`: clube, liga, objetivo que a diretoria vai pedir, orçamento,
força do elenco (posição esperada na liga), com **Aceitar** / **Recusar**. Recusar não tem custo; aceitar
pede confirmação num modal ("Você vai deixar o <clube>").

## 4. Aceitar: o que muda

Tudo num único dia bufferizado (mesmo padrão da virada):

1. **Clube e liga:** `meta.clubId`, `leagueSlug`, `leagueName`, `followedLeagues` passam ao clube novo
   (como já acontece quando o clube do jogador muda de liga).
2. **Técnicos (`managers.json`):** troca: o técnico do clube novo vai para o clube antigo (os dois clubes
   continuam com um técnico cada). O registro do jogador guarda a passagem (`clubs: { squadId, from, to }[]`).
3. **Clube antigo vira IA:** ganha `financialTier`/`aiTransferBudget` pela regra da IA; perde `staff`,
   `styleFamiliarity` e a base (`youth`): os jovens da base são promovidos pela regra da IA (1–2) e o resto vai
   para os livres. `finances.budget` antigo fica sem uso.
4. **Clube novo vira do jogador:**
   - saldo inicial = a verba de transferências sazonal que a IA teria (`aiTransferBudgetOf`), lançada no
     extrato como `kind: "club_change"` (o extrato mostra "Chegada ao <clube>"); a invariante "soma do extrato
     = saldo" continua valendo por temporada;
   - `staff` inicial pelo tier do clube (`initialStaff`), `styleFamiliarity` inicial (50, estilo da tática 75);
   - tática: `tactics.json` refeito com a formação da IA desse clube (`aiFormation`) e XI automático; estilo
     equilibrado;
   - diretoria e torcida em 60 com a meta da temporada calculada para o clube novo (`objectiveFor`);
     a meta do meio da temporada usa a posição atual.
5. Inbox do clube antigo arquivada (as mensagens ficam; as de oferta pendentes caem).

## 5. Demissão vira desemprego

Com "Pode ser demitido" ligado, a demissão grava `meta.unemployed = { since, lastClubId }` em vez de encerrar.
O jogo continua avançando (o botão Continuar vira "Aguardar propostas" e avança dias); as telas de clube mostram
"Sem clube" e só ficam liberadas Inbox, Ligas, Estatísticas, Olheiro. Aceitar uma proposta volta tudo ao normal.
A tela `/fired` passa a ser só a notícia da demissão, com "Ver propostas". Sem proposta em 120 dias de jogo,
oferta garantida de um clube do menor prestígio da faixa.

## 6. Telas

- **Inbox:** categoria `job` com o cartão da proposta.
- **Painel:** cartão do clube mostra "Reputação: N" junto do ranking; com proposta pendente, aviso "1 proposta".
- **Ranking de técnicos:** clicar no técnico mostra a carreira com os clubes (passagens).
- **Novo jogo:** sem mudança.

## 7. Fora do escopo (nesta etapa)

Técnicos da IA trocando de clube entre si, demissões de técnicos da IA, o jogador procurar emprego
ativamente, multa rescisória, salário do técnico.

## 8. Verificação

Testes puros (reputação, faixa de prestígio, sorteio por janela), rota de aceitar/recusar (dono do save,
oferta vencida 409), troca completa num dia (clube antigo IA sem staff/youth, novo com staff/extrato/tática,
managers trocados, extrato soma o saldo). Smoke de temporada com uma troca forçada: a carreira segue na liga
nova, a virada seguinte roda normal. `/test` e `/lab`: sem efeito de partida. Changelog 3.5, ROADMAP etapa 20.
