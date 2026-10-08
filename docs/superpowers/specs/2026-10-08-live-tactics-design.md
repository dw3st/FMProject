# Partida ao vivo: mapa de calor e táticas completas (Etapa 35, #108)

Versão **4.10**. Desenho aprovado pelo usuário (2026-10-08).

## 1. Mapa de calor da posse

- Cartão pequeno na partida ao vivo, abaixo do painel "Resumo" (coluna da direita): onde a bola esteve com
  cada time. Chips "Meu time" / "Adversário" e "Últimos 10 min" / "Jogo todo".
- **Amostragem:** a cada emissão de `stateChanged` (a mesma em que a posse já é acumulada, e que continua
  com a aba oculta, pela pulsação do Worker), só em fase viva: posição da bola (`getBallPos`) e o time
  com a posse (o portador; num passe no ar, o time de quem passou; bola solta, chute e bola parada sem
  portador não contam), pesada pelos segundos de jogo desde a emissão anterior.
- **Grade grossa** 12 × 8 em arrays fixos (`Float64Array`): o total do jogo e um anel de 10 baldes de
  1 minuto de jogo jogado (relógio próprio, contínuo entre os tempos: o minuto exibido repete na volta do
  intervalo). "Últimos 10 min" = os 10 baldes mais recentes (o atual, parcial, incluído).
- **Referencial:** as amostras são guardadas com o time A (o jogador) atacando para +x, desfazendo a troca
  de lado do intervalo (`attackDir`). Na tela segue a convenção do campo (#98): espelhado em x quando o
  jogador é visitante (`mirrorX`), então o mandante aparece à esquerda atacando para a direita, como no
  início do jogo. Uma seta indica para onde o time mostrado ataca.
- **Custo:** a acumulação é O(1) por emissão, num ref (sem estado React). O cartão relê o acumulador a cada
  1 s (intervalo próprio, desligado com a aba oculta), nunca por tick. SVG de 96 retângulos, cor
  `primary` (meu time) ou `destructive` (adversário) com opacidade pela fração do máximo.
- Vai junto no snapshot de retomada (#64), como a posse.
- Nada muda na simulação nem no `GameState`.

## 2. Painel tático ao vivo

- Nova aba **Tática** no painel de substituições (junto de Substituições, Formação e Instruções): estilo
  tático (5 estilos) e os quatro eixos (pressão, linha, largura, construção) em `OptionChips`, mais
  "Voltar à tática salva".
- Escolher um estilo zera os ajustes de eixo (como na tela de Formação); um eixo igual ao do estilo sai do
  ajuste. A mentalidade (cabeçalho) continua por cima.
- Aplicado só ao time A: `applyTeamTacticsConfig` / `applyTeamAttackConfig` com a mentalidade atual e a
  familiaridade do clube (o registro de familiaridade já traz todas as chaves; os pesos leem a do estilo
  escolhido). Vale só para a partida: nunca chama `PUT /tactics` nem grava `tactics.json`. O snapshot de
  retomada guarda o estilo/eixos vigentes.
- **Limitação:** a execução da familiaridade (atributos × 1 ± 0,02) é aplicada aos jogadores na montagem
  da partida; trocar de estilo ao vivo muda os pesos táticos, não os atributos já montados.
- A IA (time B) não reage.

## 3. `/test` e `/lab`

- `/test` já tem estilo, eixos e mentalidade por time; ganha o mapa de calor (opcional, botão "Heatmap").
- `/lab`: nada (já compara estilos e eixos). Partida simulada: nada muda. `Statistics.ts`: nada novo (é só
  desenho).
