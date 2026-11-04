# Partida ao vivo em 3D (mock)

Exploração de uma opção 3D para ver a partida, ao lado do 2D de hoje. Ainda não está no jogo: nada em `src/` usa isto.

```
bun scripts/match3d/build.ts <saida.html>
```

Grava uma partida inteira do motor (Manchester United x Chelsea, os dois em 4-3-3) e escreve um HTML único, que abre
direto no navegador (three.js r128 vem de CDN, então precisa de internet). `template.html` é a cena.

## O que já tem

- Bonecos articulados e animações (passe, chute, domínio, cabeceio, carrinho, queda, defesa, lateral) ligados aos eventos
  do motor. Os clipes são sem estado (segundos em volta do evento), então valem no replay e ao voltar a partida.
- Sequência de gol: rede, torcida, comemoração, replay em câmera lenta. Modo Diretor, câmeras TV, Perto, Atrás do gol,
  Aérea e Livre. Luz noite, dia e fim de tarde. Som com os arquivos do jogo.

## O que falta

- Mock: visual do estádio e da grama com arte da FLUX (grama borrada em câmera baixa, torcida em blocos de perto, topo das
  arquibancadas e cantos vazios), rostos.
- Depois: plano para entrar no jogo como opção, sem substituir o 2D. O motor não muda; o desenho hoje em `PixiPitch` leva
  junto pênalti, replay, transmissão e bonecos da arte nova, a passar aos poucos.
- Medir em PC fraco (cerca de 720 mil triângulos, 60 fps só medido numa GPU forte).
