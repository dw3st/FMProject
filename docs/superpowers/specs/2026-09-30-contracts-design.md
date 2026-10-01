# Contratos e salários (+ #6, #23) — Design

Data: 2026-09-30. Status: aprovado. Etapa 7 do `docs/ROADMAP.md` (3.1). Versão **1.7**. Escopo
"essencial": fim de contrato, salário fixo, renovação simples, jogadores livres. Sem contraproposta,
bônus ou cláusula.

## 1. Dado

`RosterPlayer.contract?: { until: string; wage: number }` — `until` = data de fim (sempre o último
dia da temporada da liga do clube), `wage` = salário semanal em EUR, fixo.

- **Criação da carreira** (`createSave`, e aplicado também sobre squads de start kit): todo jogador
  ganha contrato determinístico (hash do id): duração por idade — ≤23: 3–5 anos; 24–29: 2–4;
  ≥30: 1–2 — e `wage = playerWeeklyWage(jogador, wageFactorOf(squad))` (curva atual).
- **Folha:** `squadWeeklyWages`, o teto da IA (`aiClubFinance`) e o extrato passam a somar
  `contract.wage` (fallback para a curva só se faltar contrato — não deveria acontecer).
- Contratar (taxa ou livre) sempre cria um contrato novo.

## 2. Fim de contrato e renovação (virada do país, `advanceDay`)

Na virada da liga do clube, todo contrato com `until <= dataDaVirada`:

- **IA:** renova se `nota ≥ média do time − 0,3`, idade < 33 e o salário novo cabe no teto
  (`passesWageGate`); renovação de 1–3 anos (por idade), salário = curva atual. Senão, o jogador
  vai para a lista de livres.
- **Jogador humano:** só renova o que ele renovou antes; o resto vai para os livres. Inbox (categoria
  `contract`) 90 dias antes do fim: lista dos contratos que vencem.

### Oferta de renovação / contratação (pura)

`contractDemand(player, squad, date)` = `playerWeeklyWage(...)` × fator de importância
(`1 + clamp(nota − média do time, 0, 1.5) × 0.3`) × bônus de jovem em alta (`× 1.15` se ≤ 23 e nota ≥
média). `evaluateContractOffer({ wage, years }, player, squad, date)` → `{ accepted, reason, demand }`:
recusa se `wage < demand` ("salário baixo") ou se `idade + years > 36` ("anos demais"); `years` 1–5.
Aceite grava `contract` e um lançamento no extrato não é necessário (salário entra semanal).

## 3. Jogadores livres

- `saves/{id}/freeAgents.json`: `{ player, since }[]`. Saem do mundo depois de 1 temporada sem clube.
- IA: o mercado (`dailyMarketTick`) considera livres como candidatos com taxa 0 (mesmo filtro de
  necessidades e o portão de salário); contrato 1–3 anos pela curva.
- Humano: aba "Livres" no `ScoutScreen` (mesma busca paginada do servidor), oferta igual à
  renovação. Comprar com taxa (rota de transferência humana) passa a exigir `{ wage, years }`
  avaliado por `evaluateContractOffer`.

## 4. #23 — folha da IA

A cada virada, depois de `carryForwardWageFactor`: `fator = fator + 0,3 × (fatorAlvo − fator)`,
onde `fatorAlvo = clubWageFactor(receita nova, folha da curva)`. As renovações e saídas também liberam
folha. Validar com uma simulação de 3 temporadas (script) contando contratações e estado
`open/tight/frozen` por tier; meta: ELITE não fica `tight` permanente.

## 5. #6 — declínio dos craques

`scripts/espn/aging.ts`: o declínio por idade é atenuado para quem está no topo do próprio papel
(`fator = clamp(1 − (pctl − 0,9) × 5, 0,5, 1)` sobre o percentil de overall do papel, aplicado só ao
declínio). Regenerar a cadeia (`.claude/rules/data/espn-import.md`) e os kits; relatório antes/depois
do ranking de Kane, Bellingham, Van Dijk (meta: top 100) e da média por idade (±0,5).

## 6. Telas

Elenco: colunas "Contrato até" e "Salário". Ficha do jogador: botão **Renovar** → modal com anos e
salário, mostra o pedido e o motivo da recusa. Olheiros: aba **Livres**. Inbox `contract`: aviso de
vencimento, renovado, saiu livre. i18n en/pt-BR.

## Verificação

Testes da regra de oferta, da renovação da IA e da expiração; smoke de temporada (nenhum contrato
vencido em elenco depois da virada, alguma renovação e alguma saída livre, extrato = soma dos
contratos); script de 3 temporadas para o #23; ranking do #6. Changelog 1.7; docs
`.claude/rules/game/contracts.md`; ROADMAP.

## Planos

1. Contratos, salário fixo, renovação/expiração (IA e humano), #23.
2. Livres, telas, #6 + regenerar mundo e kits, changelog, docs.
