# Craft nas instalações do clube (fase 1)

Pedido do usuário (2026-11-18), desenho aprovado em três partes na conversa. Versão alvo: próxima minor. Regras atuais
das instalações: `.claude/rules/game/facilities.md`. Diretoria: `board-fans.md`. Comissão: `staff.md`.

## Objetivo

As obras da aba Clube deixam de ser pagas em dinheiro e aprovadas pela diretoria: o clube compra materiais, fabrica
componentes na oficina e monta a obra com eles. O dinheiro passa a servir para comprar materiais. O custo médio de uma
obra continua o de hoje; muda o jeito de jogar, e quem planeja bem tira um pouco mais (qualidade, preço da semana).

Só o clube humano (cada assento). A IA não tem craft: as instalações dela continuam regra, não simulação.

## Fora da fase 1 (fase 2)

Troca de materiais entre amigos, receitas descobertas (eventos, conquistas, fornecedor raro), nível 6 da oficina.

## 1. Materiais e componentes

**Materiais (6),** comprados na loja: `concrete` concreto, `steel` aço, `wood` madeira, `grass` grama (rolos de tapete),
`fabric` tecido, `electronics` eletrônicos.

**Componentes (8),** fabricados na oficina:

| Componente | Receita | Dias na bancada (nível 1) | Oficina mínima |
|---|---|---|---|
| `beam` viga | 3 aço + 1 concreto | 2 | 1 |
| `slab` laje | 4 concreto | 2 | 1 |
| `turfPanel` placa de grama | 3 grama | 1 | 1 |
| `seat` assento | 2 madeira + 1 tecido | 1 | 1 |
| `floodlight` refletor | 2 aço + 2 eletrônicos | 3 | 2 |
| `gymKit` aparelho de academia | 2 aço + 1 eletrônicos | 2 | 3 |
| `medKit` kit médico | 1 tecido + 2 eletrônicos | 2 | 3 |
| `furniture` móvel | 3 madeira | 1 | 1 |

O estoque não tem limite nem validade. Cada componente guarda a qualidade (abaixo).

## 2. Receitas das obras

Toda obra de hoje (`FacilityRequest`: setor da arquibancada, conforto, CT, base, reforma, reconstrução, melhoria, troca
de grama) vira uma receita: uma mistura de componentes por tipo de obra e item, e a quantidade sai do preço de hoje.

```
custo da obra   = o mesmo das cotações de hoje (EUR)
valor da mistura = Σ (quantidade relativa × valor de referência do componente)
unidades        = max(1, round(custo / valor da mistura))
receita         = mistura × unidades, arredondada por componente (pelo menos 1 de cada que a mistura pede)
valor de referência do componente = Σ (materiais da receita × preço base do material)
```

Misturas (proporções; o item manda):

| Obra | Mistura |
|---|---|
| Setor da arquibancada (lugares) | laje 3 · viga 2 · assento 4 |
| Conforto / assentos | assento 3 · móvel 1 |
| Estrutura e iluminação | viga 2 · refletor 2 |
| Gramados (estádio, treino, base), troca de grama | placa de grama 1 |
| Academia | aparelho 2 · viga 1 |
| Piscina | laje 2 · viga 1 |
| Fisioterapia | kit médico 2 · móvel 1 |
| Refeitório, alojamento da base | móvel 2 · laje 1 |
| Obras de grupo (CT, base) | a soma das misturas dos itens do grupo |

Montar: com os componentes no estoque, a obra começa e leva o mesmo prazo de hoje; uma obra por área (estádio, CT,
base) continua. O que a obra consome sai do estoque na hora de montar. Cancelar uma obra em andamento devolve 50%.

Reciclar: uma reconstrução devolve 25% dos componentes da receita do nível antigo (sempre com qualidade Comum);
"desmontar um nível" de um item devolve 40% e baixa o item um nível (nunca abaixo de 1). O item fica com a condição.

## 3. Loja

- Preço base de cada material fixado para que o valor de referência de uma obra média seja o custo de hoje (medição M1).
- Preço da semana: `base × (1 + 0,10 × ruído)`, ruído ∈ [−1, 1] sorteado por save, material e segunda-feira
  (`seedFrom(craft:<save>:<material>:<segunda>)`); a tela mostra a seta contra a semana anterior.
- Dois fornecedores: padrão e bom (+15% no preço; o material bom melhora a qualidade, abaixo). O estoque guarda o
  material separado por fornecedor.
- Desconto de 10% com a diretoria em 70 ou mais.
- A compra sai do caixa pelo extrato (`recordMoney`, linha `facilities`, `ref.facility = "materials"`); saldo negativo
  continua só um aviso.

## 4. Oficina

- Instalação nova `workshop` no grupo do CT, nível 1 a 5, criada no nível 1 (carreira nova, troca de clube e, na
  primeira leitura de um save de antes, junto com o estoque inicial).
- Bancadas: `1 + nível` (2 a 6). Cada bancada fabrica um componente por vez; fila de até 10.
- Tempo na bancada: dias da tabela × (1 − 0,10 × (nível − 1)) × efeito do mestre de obras, arredondado para cima,
  no mínimo 1. A fabricação avança no avanço do dia (todo dia, jogo ou não).
- Receitas travadas mostram o nível que pedem.
- Melhorar a oficina é uma obra com receita (mistura viga 2 · laje 1 · móvel 1), no grupo do CT.

## 5. Mestre de obras

Função nova `foreman` da comissão (`staff.md`), uma vaga, contratado da lista de livres; curva de sempre (3★ neutro):
tempo na bancada ×1,15 / ×1 / ×0,85 em 1★ / 3★ / 5★ e o deslocamento de qualidade abaixo. Vaga = 2★.

## 6. Qualidade

- Cada componente sai Comum, Bom ou Excelente. Sorteio por componente (`seedFrom(craft:<save>:<item da fila>)`):
  `nota = 0,1 × (estrelas do mestre − 3) + 0,05 × (nível da oficina − 1) + 0,15 × (fração dos materiais do fornecedor bom)`;
  chance de Excelente `0,10 + nota`, de Bom `0,35`, o resto Comum (limitado a [0, 1]).
- A qualidade da obra é a média dos componentes (Comum 0, Bom 1, Excelente 2): ≥ 1,5 Excelente, ≥ 0,75 Boa.
- Efeito, gravado no item ao montar (`FacilityItem.quality`): Boa = desgaste × 0,85; Excelente = desgaste × 0,70 e +2%
  no efeito do item (o multiplicador do item, sempre a favor do clube). Um setor da arquibancada ou uma obra de grupo
  grava a qualidade em cada item tocado. A próxima obra do item troca a qualidade.
- Selo da qualidade no cartão do item.

## 7. Diretoria

- As aprovações por obra, a parte paga pela diretoria e as parcelas mensais saem.
- Verba mensal: no dia 1, um lote de materiais (mistura igual dos 6, fornecedor padrão) no valor de
  `receita anual × f(diretoria)`, `f` = 0 abaixo de 35, linear de 1% em 50 a 3% em 85, 3% acima. Mensagem na caixa.
- Desconto de 10% na loja com a diretoria em 70 ou mais.

## 8. Dados

- `ClubFacilities.craft?: { stock, queue, benches, nextId }`:
  - `stock.materials: Record<MaterialId, { standard: number; good: number }>`;
  - `stock.components: Record<ComponentId, { common: number; good: number; excellent: number }>`;
  - `queue: { id, component, goodShare, startedOn?, doneOn? }[]` (as primeiras `bancadas` com `startedOn` trabalham).
- `ClubFacilities.items.workshop` (nível, desgaste como os outros itens; vida 5 temporadas, desgaste só por tempo).
- `FacilityItem.quality?: "good" | "excellent"`.
- Sem `craft` (save de antes): criado na primeira leitura com a oficina no nível 1 e um estoque de materiais no valor de
  2% da receita anual. As obras em andamento terminam pela regra antiga (parcelas incluídas).

## 9. Rotas (`requireSeat`, escrita com `withSaveLock`, guarda de lobby)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/craft` | Estoque, oficina (nível, bancadas, fila com dias restantes), loja (preço da semana e da anterior por material e fornecedor, desconto), verba do mês, receitas de componentes (travadas inclusive) |
| `POST …/craft/buy { items: [{ material, supplier, qty }] }` | 409 `noClub`; 400 `invalidOrder` |
| `POST …/craft/queue { component, qty, goodShare? }` | 400 `locked` / `invalidQty`; 409 `queueFull` / `missingMaterials` |
| `POST …/craft/queue/:queueId { action: "up" \| "down" \| "cancel" }` | Cancelar devolve os materiais de quem ainda não começou e 50% de quem começou |
| `POST …/craft/recycle { item }` | Desmonta um nível; 400 `minLevel` |
| `GET …/facilities` | Cada cotação ganha `recipe` (componentes, quantos tem) e `canBuild` |
| `POST …/facilities/request` | Monta com o estoque; 409 `missingComponents { missing }` / `busy`. Sem diretoria |

## 10. Telas

- Aba Clube: `SegmentedTabs` Instalações · Oficina · Estoque · Loja.
- Instalações: a receita de cada obra (componentes que tem / que faltam), **Montar** (só com tudo), **Fabricar o que
  falta** (põe na fila) e **Comprar os materiais que faltam** (abre a Loja com o carrinho pronto). Selo de qualidade.
- Oficina: nível, bancadas (componente, barra de dias, qualidade prevista), fila (subir, descer, cancelar), receitas
  destravadas e travadas.
- Estoque: tabela de materiais e componentes (quantidade por fornecedor / qualidade, valor) e Reciclar.
- Loja: 6 materiais com o preço da semana e a seta, fornecedor padrão e bom, quantidade com − e +, total, verba do mês.
- Ícones pintados (vetor → FLUX) dos 6 materiais e 8 componentes. Mock das telas antes de publicar.
- Painel: o cartão Obras mostra a fabricação em andamento e o que ficou pronto.
- Caixa de entrada: categoria `facilities`, `kind` `craft_allowance` (verba), `craft_done` (componentes prontos no dia,
  agrupados), `built` (obra montada; a de entrega continua `completed`). Tópico `facilities`, ligado.
- i18n `craft.*` (en, pt-BR).

## 11. Avanço do dia

Por assento com clube: no bloco financeiro, antes das obras do dia: (1) dia 1 → verba; (2) a fila trabalha (bancadas
com item pronto liberam, o próximo da fila começa se os materiais estão no estoque, reservados quando entra na fila);
(3) as obras seguem como hoje (entrega no fim do prazo). Mensagens adiadas para depois do `clearInbox`.

## 12. `/test`, `/lab`

Sem efeito de partida direto; a qualidade só muda desgaste e o multiplicador dos itens, que o motor já lê. Nada novo.

## 13. Testes e medições

- Puro, com teste: receitas (custo → componentes, mínimo 1), qualidade (sorteio, média, efeito), fila (bancadas, ordem,
  cancelar), loja (preço da semana, desconto, fornecedor), reciclar, verba.
- Rotas: comprar, fila, montar sem componentes (409), montar com, reciclar, lobby.
- Avanço do dia: a fila termina no dia certo, a verba no dia 1, a obra montada entrega no prazo.
- M1: custo médio de uma obra em materiais (preço base, fornecedor padrão) a ±5% do custo em dinheiro de hoje, por tipo
  de obra, sobre as cotações dos clubes da Premier e do Brasileirão.
- Smoke de temporada: a seção "Instalações" passa a comprar, fabricar e montar uma reforma pelo caminho novo.

## 14. Limitações

- A IA não fabrica nada: a qualidade é só do clube humano.
- O preço da semana não reage às compras.
- Componentes comprados prontos não existem (só materiais).
