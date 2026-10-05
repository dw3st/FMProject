# Etapa 23 — Moral e conversas com jogadores — Design

Data: 2026-10-04. Status: aprovado. Versão **3.8**.

## Regra geral

Só o **clube do jogador** simula moral e conversas (a IA segue regras, como nas finanças e no staff).
`RosterPlayer.morale` 0..100 (início 65) e `RosterPlayer.squadStatus` (papel no elenco). Sem migração.

## 1. Papel no elenco (`squadStatus`)

`key` (craque), `starter` (titular), `rotation` (rodízio), `backup` (reserva), `youth` (jovem/promessa).
Sugerido automaticamente pela nota no elenco por linha e idade; o jogador pode mudar na ficha. Define a
**expectativa de minutos** por janela de 5 jogos oficiais: key 4–5, starter 3–4, rotation 2–3, backup 1, youth 0–1.

## 2. Moral (semanal + eventos)

| Evento | Moral |
|---|---|
| Segunda-feira: minutos das últimas 5 partidas vs. expectativa do papel | −6 … +3 |
| Resultado do time (vitória / derrota, peso da torcida) | +1 / −1 |
| Gol, nota ≥ 7,5 | +1 a +2 |
| Promessa cumprida / quebrada | +8 / −15 |
| Renovação aceita / recusada pelo clube | +6 / −10 |
| Ser listado para venda sem pedir | −8 |
| Deriva semanal para 65 | 5% da distância |

Faixas: ≥ 80 **muito feliz**, 60–79 **contente**, 40–59 **neutro**, 25–39 **insatisfeito**, < 25 **revoltado**.

## 3. Efeitos

- **Partida (motor e quickSim):** atributos × (1 + 0,02 × fator), fator −1 (moral 0) … 0 (65) … +1 (100; era +0,5, sem efeito mensurável; medido 100 × 65 V−D +7,8 em 1600 jogos, 25 × 65 −5,6 em 800) —
  o mesmo mecanismo de execução da familiaridade (Etapa 15), em 65 nada muda.
- **Desenvolvimento:** DP × 0,9 (revoltado) … 1,05 (muito feliz).
- **Contrato:** insatisfeito pede +15% no salário; revoltado recusa renovar (a não ser com promessa).
- **Transferências:** jogador revoltado entra sozinho na lista de venda (pedido de transferência), com a
  `financialPressure` como se fosse da IA; propostas por ele chegam mais.

## 4. Conversas (inbox `player`, com respostas)

O jogador pede uma conversa quando:
- moral < 40 por falta de minutos (reserva insatisfeito);
- está nos últimos 6 meses de contrato e é `key`/`starter`;
- outro clube fez proposta e ele quer sair (com a Etapa 21);
- jovem `youth` com moral alta e nota subindo pedindo chance.

Respostas possíveis (variam por motivo):
- **Prometer minutos:** "vai jogar X das próximas 5" (o jogo acompanha e cobra; cumprir = +8, quebrar = −15 e
  pedido de transferência).
- **Prometer venda/empréstimo** até a próxima janela/data.
- **Prometer renovação** (abre a renovação com o pedido ajustado).
- **Elogiar / pedir paciência** (+2, só funciona uma vez por mês).
- **Recusar** (−5).

Promessas abertas aparecem na ficha e num bloco "Promessas" do Elenco, com o prazo.

## 5. Telas

- Elenco: coluna **Moral** (ícone de rosto + texto da faixa) e filtro "insatisfeitos".
- Ficha do jogador: moral com a tendência (7 dias), papel no elenco (editável), promessas, botão "Conversar"
  (abre as opções do motivo atual, ou só "elogiar"/"cobrar" sem motivo).
- Painel: cartão "Atenção" passa a listar pedidos de conversa e promessas vencendo.
- Renovação (`ContractOfferModal`): mostra a exigência ligada à moral.

## 6. `/test`, `/lab` (o efeito é de partida)

- `/lab`: `Variant.morale` (slider, ausente = 65) → execução no motor e força no quickSim; linha no `PairDetail`.
- `/test`: seletor de moral por time e o multiplicador no `EnergyPanel`.
- Medição: 100 × 65 e 25 × 65 (Premier, 800 jogos): ganho/perda na faixa ±2–4 p.p., gols/chutes de 65 × 65
  idênticos (fator 0 em 65 por construção).

## 7. Verificação

Testes puros (papel sugerido, expectativa, variação semanal, promessas, efeitos), rotas (conversa/resposta,
mudança de papel, dono do save), smoke: moral presente e em 0..100 no clube do jogador, nenhum clube da IA grava
moral, pelo menos um pedido de conversa e uma promessa resolvida na temporada. Changelog 3.8, ROADMAP etapa 23.
