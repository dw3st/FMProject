# Janelas de transferência, pré-contrato e disputa pelo alvo (Etapa 25)

Spec: `docs/superpowers/specs/2026-10-05-living-market-design.md` (decisões D1–D9 aprovadas com a recomendação).
Versão **4.0**. Técnicos da IA e contrato do técnico do jogador: `managers.md` e `jobs.md`. Negociação:
`negotiation.md`. Mercado da IA: `.claude/rules/AI-clubs/transfer-needs.md`.

## Regra

- Cada **país** tem duas janelas por temporada, derivadas das datas da sua **liga de nível 1** (`topLeagueOf`,
  `meta.activeLeagues`). Nada é gravado: `windowStatus(temporada, data)` é pura, a cada dia.
  - **Pré-temporada:** de `fim da temporada anterior + 14` a `início + 16` (Europa 31/05 → 31/08; ano civil
    ~meados de dezembro → 21/02).
  - **Meio:** 31 dias a partir do dia 1 do mês do ponto médio da temporada (depois do dia 15, o mês seguinte):
    Europa 01/01 → 31/01, ano civil 01/07 → 31/07.
  - País sem pirâmide: pela própria liga. Sem temporada conhecida: aberta.
- **Quem precisa da janela aberta: o país do clube comprador** (o vendedor pode estar fechado).

| Ação | Fora da janela? |
|---|---|
| Compra com taxa (humano, IA × IA, propostas da inbox, contraproposta, rival no prazo) | Não (409 `windowClosed { opensOn }`) |
| Início de empréstimo (pedir, ceder, aceitar `loan_bid`) | Não |
| Volta de empréstimo | Sim |
| Contratar livre (humano, `freeAgentTick`, reposição da virada) (D7) | Sim |
| Renovar, promover da base, dispensar, listar/tirar da lista | Sim |
| Pré-contrato (D2) | Sim |

- **Carência de chegada (D1):** uma carreira nova abre o mercado do clube do jogador por 30 dias a partir de
  `meta.careerStart` (gravado no `createSave`), mesmo com a janela do país fechada. Na troca de clube, não.
- **Conversas:** com a janela do jogador fechada, as conversas de compra caem (as proibições `closedUntil` ficam).
  As propostas da IA pelos jogadores do humano vencem no fecho da janela do comprador.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/market/windowConfig.ts` | Constantes (`WINDOWS`) |
| `src/Domain/market/windows.ts` (+ teste) | `seasonWindows`, `windowsAround`, `windowStatus`, `humanWindowStatus` (carência), `isDeadlineRush`, `daysToClose` |
| `src/backend/marketWindowWorld.ts` | `buildWindowContext` / `loadWindowContext`: status por liga/clube/país do dia, o do clube humano, `windowClosedResponse` |
| `src/Domain/transfer/marketRotation.ts` | `dailyMarketTick(..., { windows })`: só compradores com janela aberta (fase 2 e propostas da fase 3) |
| `src/Domain/negotiation/rivals.ts` (+ teste) | Candidatos rivais, `rollRival`, `rivalFloor`, `starterChance`, `preferenceScore`, `preferredClub` |
| `src/Domain/negotiation/preContract.ts` | `preContractEligible`, `answerPreContract` |
| `src/backend/rivalWorld.ts` | `rollRivalFor`, `resolveRivalDeadlines` (venda ao rival no prazo), `applyDuePreContracts`, `prestigeOf` |
| `src/backend/marketRoutes.ts` | `GET /transfer-windows`, `POST /pre-contracts`, `GET/POST /manager-contract` |
| `src/GameInterface/Transfers/transferWindow.tsx` | `useTransferWindows`, faixa `WindowBanner`, aba `WindowsTable` |
| `scripts/market-sim.ts` | Medição (abaixo) |

## Mercado da IA

- Fase 1 (necessidades, listas de venda) o ano todo. Fase 2: tentativas = `stochasticRound(ATTEMPTS_PER_OPEN_DAY (35)
  × Σ pesos / tamanho do pool)`, sorteadas entre os compradores com necessidade e janela aberta; peso
  `DEADLINE_MULT` (1,5) nos últimos 5 dias da janela. Sem `windows` (scripts antigos, `contracts-sim`) o tick é o
  de antes (10 tentativas/dia).
- Fase 3 (propostas pelos jogadores do humano): só compradores com janela aberta; até 2 propostas vivas por jogador,
  de clubes diferentes (D6).

## Pré-contrato (D2)

- Só humano ← IA: jogador da IA com `contract.until` em até 183 dias (sem empréstimo). Termos normais
  (`evaluateContractOffer`), sem taxa; se a IA renovaria (`aiShouldRenew`), o clube humano precisa ganhar na
  preferência (`preferenceScore`, contra a renovação na curva e o prestígio do clube atual) — senão
  `{ accepted: false, reason: "prefersCurrent" }`.
- Gravado em `market.preContracts` (`{ playerId, fromClubId, toClubId, wage, years, date }`). Na virada do país do
  clube de origem (passo **8a**, antes das expirações) o jogador sai sem taxa e entra no clube do jogador com o
  contrato combinado (`pre_contract_joined`); some do clube de origem, elenco cheio (`HUMAN_MAX_SQUAD`, 36; na rota contam só os pré-contratos com `toClubId` do clube atual) ou o técnico trocou de clube →
  cai (`pre_contract_failed`). A IA nunca o renova (ele já saiu antes).

## Disputa pelo mesmo alvo

- Na **primeira oferta do dia** por um jogador da IA (rota de compra), e uma vez por dia para alvos que já têm rival
  vivo (avanço do dia), **um** candidato sorteado pela urgência da necessidade (linha do alvo, nota ±0,5, verba ≥
  0,9 × valor, folha, elenco < 30, janela aberta) entra com `RIVAL.BASE (0,25) × urgência × (0,5 + 0,5 × nota
  relativa)`; no máximo 2 por alvo. Taxa = valor × (0,95 + rng × 0,2) (verba e teto do tier), salário = pedido ×
  (1 + rng × 0,1), prazo 3 dias (nunca depois do fecho da janela do rival). `market.rivalBids`.
- O vendedor avalia a rival (`respondToOffer`): se aceitaria, o piso do humano é a taxa rival × 1,05 (aceite abaixo
  vira contraproposta no piso) e a inbox avisa (`rival_bid`).
- Com o vendedor aceitando as duas, o **jogador escolhe** (`preferenceScore` = 0,45 × min(1,5, salário/pedido) +
  0,35 × prestígio + 0,20 × chance de titular): perde o humano → resposta `prefers_rival` (pode subir o salário).
- No prazo, o rival que o vendedor aceita compra (IA × IA, mesmo caminho do mercado): conversa com `lost`,
  `market.lostTargets`, inbox `lost_to_rival`; a rota de compra devolve `{ response: { kind: "lost" } }`.
- `FM_NO_RIVALS=1` desliga o sorteio de rivais (testes de rota que conferem contrapropostas exatas, seção Negociação do smoke).

## Rotas

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/transfer-windows` | `{ player: { country, iso2, open, until?, opensOn? }, countries: [{ country, iso2, current?, next? }] }` |
| `POST /api/saves/:id/transfers` | + 409 `windowClosed`; `rival[]`, `preference`; `response.kind` `prefers_rival` / `lost` |
| `POST /loans`, `POST /bids/:bidId` (aceitar/contrapropor) | + 409 `windowClosed` (janela do comprador) |
| `POST /api/saves/:id/pre-contracts { playerId, fromSquadId, wage, years }` | `{ accepted, preference }`; 400 `notEligible`/recusas de contrato; 409 `squadFull`/`noClub` |
| `GET /api/saves/:id/negotiation` | + `window`, `preContracts`, `rivals`, `lostTargets`; `/negotiation/:playerId` + `window`, `rivals`, `lost` |

## Telas

- **Transferências:** faixa "Janela aberta até…/fechada — abre em…" com o país; aba **Janelas** (`TABLE_STYLE`, o
  país do jogador e das ligas seguidas primeiro); na aba de Empréstimos/negociações, blocos "Concorrência" e
  "Pré-contratos".
- **Negociação** (`PlayerOfferModal`): janela fechada → aviso e botões desligados; aba **Pré-contrato** quando o
  contrato do alvo acaba em ≤ 183 dias (abre direto nela com a janela fechada); bloco "Concorrência" com os rivais e
  a preferência do jogador. **Olheiro** e **ficha**: botão de oferta desligado com "Janela fechada (abre em …)",
  salvo para pré-contrato.
- **Painel:** cartão Atenção com "Janela fecha em N dias" (≤ 7) / "Janela aberta até…".
- **Inbox `transfer`:** `window_open`, `window_closing` (3 dias antes), `window_closed` (só o país do clube do
  jogador), `rival_bid`, `lost_to_rival`, `pre_contract`, `pre_contract_joined`, `pre_contract_failed`.

## Day log

`StoredDayLog.transfers: { playerId, from, to, fee, kind: transfer|loan|free|pre_contract, date }[]` — transferências IA ×
IA do mercado, vendas a rivais, compras/vendas/empréstimos pelas rotas e chegadas de pré-contrato. O smoke confere
que nenhuma compra/início de empréstimo saiu fora da janela do comprador.

## Medição (`bun scripts/market-sim.ts 3 [--no-windows] [--no-market]`, mundo inteiro, sem clube humano)

Tabelas sintéticas (resultados pela força no calendário real de cada liga) para os técnicos; mercado real.

| Métrica | Alvo | Medido (3 temporadas) |
|---|---|---|
| Transferências IA × IA com taxa | ±15% da 3.9.1 (`--no-windows`: 950 / 1295 / 1091) | 850 / 1333 / 990 (−5% no total) |
| Fora da janela do comprador | 0 | 0 |
| Fatia pré-temporada / meio | ~70% / ~30% | 64–74% / 26–36% (média ~71/29) |
| Estados de contratação da IA | ≥ 90% open por tier | LOW 93,5%, MEDIUM 96,0%, HIGH 97,4%, ELITE 98,6% |
| Elenco médio | 26–24 | 27,0 / 25,2 / 24,4 |
| Clubes que trocam de técnico por temporada (nível 1 / 2+) | 20–35% / 10–25% | 21–23% / 18–21% |
| Mediana de permanência do técnico da IA | 1,5–3 temporadas | 1,61 |
| Pool de livres (não aposentados) | < 0,1 × clubes, estável | 0,090 / 0,079 / 0,082 × clubes |
| Salário do técnico / receita | 1,5–4% | 2,5% na reputação 40 (1,5% em 0, 4% em 100) |
| Rival nas conversas de compra | 20–40% | 24% (sonda: 10 alvos aleatórios por segunda, 3 dias de conversa); piso acima de 1,1 × valor em 5% |

## Testes e smoke

```
bun test src/Domain/market src/Domain/managers src/Domain/negotiation src/Domain/transfer src/Domain/jobs \
  src/backend/windows.routes.test.ts src/backend/managers.market.test.ts src/backend/jobs.test.ts
```

`scripts/season-rollover-smoke.ts`, seção **"Mercado vivo"** (ver também Negociação, que agora avança até a janela
abrir, e Convites).

## Limitações

- Sem janela de emergência; o livre cobre lesões de goleiro etc.
- Ligas europeias de ano civil têm janelas próprias pelo calendário delas, não as da UEFA.
- Rival só nas compras com taxa do humano; IA × IA não disputa (o primeiro que tenta compra).
- Um jogador com pré-contrato ainda pode ser vendido pela IA antes da virada: o pré-contrato cai (inbox).
