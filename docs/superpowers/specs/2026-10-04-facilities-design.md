# Etapa 24 — Instalações do clube: estádio, CT e base — Design

Data: 2026-10-04. Status: aprovado. Versão **3.9** (depois das etapas 20–23).

## Regra geral

Só o **clube do jogador** tem instalações simuladas; a IA usa um nível implícito pelo tier (LOW 1, MEDIUM 2,
HIGH 3, ELITE 4), como no staff. Dado no clube: `Squad.facilities`. Sem migração. **Nada novo na barra superior:**
a tela fica como aba **Instalações** dentro de **Finanças**, e o Painel ganha um cartão de obras.

## 1. Estádio (arquibancadas)

- O estádio tem 4 setores (Norte, Sul, Leste, Oeste), com a capacidade atual do clube repartida entre eles
  (laterais maiores). A soma é a `capacity` que a bilheteria já usa.
- **Ampliar um setor:** +1.000 a +10.000 lugares por obra, um setor por vez. Custo por lugar pelo país e pela
  liga (≈ €1,5k–6k por lugar), duração de 8 a 30 semanas; durante a obra o setor fica com metade da capacidade.
- **Conforto (níveis 1–5):** cadeiras, cobertura, camarotes. Cada nível sobe o preço médio do ingresso em 6%.
- **Demanda limita a bilheteria:** público = min(capacidade, demanda); demanda = seguidores × tier da liga ×
  ocupação da torcida (o medidor de torcida da Etapa 17) × fase da temporada. Ampliar acima da demanda não dá
  dinheiro — o gráfico mostra a ocupação média para o jogador decidir.

## 2. Centro de treinamento (CT, níveis 1–5)

- Recuperação diária × 0,97 … 1,08, risco de lesão em treino × 1,05 … 0,85, pontos de desenvolvimento no treino
  × 0,95 … 1,10 (nível 3 = neutro). Somam-se aos efeitos do staff.
- Só fora da partida (treino, recuperação, evolução); o motor da partida não muda.
- Subir um nível: obra de 12–40 semanas, custo pela receita do clube; manutenção semanal no extrato.

## 3. Base (níveis 1–5)

- Qualidade da safra +0,15 por nível acima de 3 (−0,15 abaixo), tamanho da safra 3–5 → 3–6 no nível 5, e
  chance de promessa ("Wonderkid") 5% → 9%.
- Obra e manutenção como o CT.

## 4. Dinheiro e diretoria

- O jogador **pede** a obra; a **diretoria decide** pelo seu medidor e pelo saldo:
  - diretoria ≥ 70 e saldo cobre: aprova; ≥ 85: paga 25–50% com verba própria (lançamento `board_funding`);
  - 50–69: aprova só obras pequenas (até 10% da receita anual);
  - < 50 ou saldo negativo: recusa ("melhore os resultados primeiro").
- Custo lançado no extrato (`kind: "facilities"`) em parcelas mensais durante a obra; manutenção semanal
  (`facilities_upkeep`). Uma obra por instalação ao mesmo tempo.
- Mensagens na inbox: obra aprovada/recusada, concluída, recorde de público.

## 5. Telas

- **Finanças → Instalações:**
  - **estádio desenhado em SVG** (vista de cima, os 4 setores coloridos pela ocupação média, número de lugares em
    cada um); clicar num setor abre o painel de ampliação com o controle de lugares (+1k … +10k), custo, prazo e a
    nova capacidade, e o botão "Pedir à diretoria";
  - gráfico do **público por jogo em casa** (barras) contra a **capacidade** (linha) e a **demanda estimada**, na
    temporada;
  - cartões do **CT** e da **Base** com o nível (5 marcas), o efeito atual e o do próximo nível, custo e prazo;
  - obras em andamento com barra de progresso e data de entrega.
- **Painel:** cartão "Obras" (só com obra em andamento ou concluída nos últimos 7 dias).
- **Prévia da partida:** público esperado e capacidade.

## 6. `/test`, `/lab`

Sem efeito dentro da partida (o CT age no treino e na recuperação entre jogos): nada a exibir. A bilheteria nova
entra nos testes de finanças.

## 7. Verificação

Testes puros (demanda e público, custo/duração por país, efeitos por nível, decisão da diretoria, parcelas),
rotas (pedido, aprovação, dono do save), smoke: uma obra aprovada e concluída na temporada, capacidade nova usada
na bilheteria, extrato somando o saldo, nenhum clube da IA grava instalações. Changelog 3.9, ROADMAP etapa 24.
