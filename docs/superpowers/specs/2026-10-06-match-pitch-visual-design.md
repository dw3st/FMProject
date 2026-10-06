# Visual do campo na partida ao vivo (4.4)

Aprovado em 2026-10-06 com mockups (`.superpowers/brainstorm/82553-1791312430/content/`: `pitch-style.html`
opção A, `markers.html` opção 3, `effects.html` todos). Escopo: só o desenho do campo, dos jogadores, da bola e
de efeitos curtos no gramado. Layout da tela, controles, narração e câmera ficam como estão. Clima/horário no
gramado fica para depois.

## Decisões

| Tema | Decisão |
|---|---|
| Estilo | "Clássico polido": o de hoje com acabamento (faixas de corte, sombras, bola de verdade) |
| Informação no jogador | Completa: brilho de quem tem a bola, cartão, barrinha de fôlego em **todos** os 22 |
| Efeitos | Os cinco: rastro, chute/defesa, rede/confete no gol, falta/cartão, linha de impedimento |
| Câmera | Campo inteiro fixo (sem zoom) |
| Técnica | Tudo desenhado em Pixi (`Graphics`/`Text`), sem imagens novas |

## 1. Gramado

- Faixas verticais de largura igual alternando `PITCH_STRIPE_A` / `PITCH_STRIPE_B` (dois verdes próximos do
  `PITCH_COLOR` atual), 15 faixas ao longo dos 115 jardas. Linhas e redes como hoje.
- Desenhado uma vez na montagem (camada estática abaixo do `world`); refeito só quando o canvas muda de tamanho
  (o `PixiPitch` já é remontado por `key` de tamanho).
- O teste de contraste do contorno do marcador (`needsLightOutline`) passa a considerar a faixa mais escura.

## 2. Jogadores

Cada marcador (container existente: disco, rosto, anel, nome) ganha:

- **Sombra:** elipse preta (alpha 0,3) deslocada para baixo/direita, abaixo do disco.
- **Brilho de posse:** elipse branca (alpha ~0,18) no chão, maior que o disco, visível só em quem tem a bola
  (`ballHolderId`).
- **Cartão:** retângulo amarelo no canto superior direito do disco quando o jogador tem amarelo
  (`GameState.cards`). Vermelho não precisa (o expulso sai de campo).
- **Barrinha de fôlego:** abaixo do nome, largura fixa (~2× o raio), trilho escuro e preenchimento proporcional à
  energia. Cor por faixa (`fatigueColor(energy)`): ≥ 60 verde, 40–59 amarelo, < 40 laranja. Em todos os 22.

## 3. Bola

- Desenho: círculo branco com gradiente leve, contorno fino e um pentágono escuro central (gomo). Raio igual ao
  de hoje.
- **Sombra no chão** sempre.
- **Altura (pura, `ballHeight`):** para uma bola alta (`pass.kind` `cross` / `long_ball` / `clearance`) e para um
  chute, `h = 4 · hMax · t · (1 − t)`, com `hMax` por tipo (cruzamento/lançamento maior que rebatida; chute baixo,
  cabeçada quase nada). A bola é desenhada deslocada para cima em `h` e um pouco maior; a sombra fica na posição
  real do chão e fica menor/mais clara com a altura. Passe rasteiro e condução: `h = 0`.

## 4. Efeitos no gramado (`pitchEffects`)

Fila pura de efeitos `{ kind, startedAt, duration, dados }`, avançada pelo relógio real do `PixiPitch`
(não pelo relógio do jogo, para continuarem visíveis em 4×), congelada com a partida pausada, cada um some com
alpha nos últimos 30% da duração. Alimentada por eventos do `gameBus` assinados no próprio `PixiPitch` (como já
faz com `throughBallScores`), mais leitura do estado para o rastro.

| Efeito | Gatilho | Desenho | Duração |
|---|---|---|---|
| Rastro | bola em voo (passe com distância ≥ 20 jardas, bola alta, chute) | linha das últimas posições da bola, alpha decrescente | contínuo enquanto voa + 0,4 s |
| Chute | `shotResolved` (com a posição de origem/alvo de `GameState.shot`) | linha tracejada do chute ao gol; anéis de impacto no alvo; texto **DEFESA** (`inPosts && !isGoal`) ou **PRA FORA** (`!inPosts`) | 1,5 s |
| Gol | `goalScored` | rede do gol estufa (curva) e ~12 pontos de confete nas cores do time que marcou | 1,5 s, antes do `GoalOverlay` existente |
| Falta | `foul` (`x`, `y`) | "X" branco no local | 1,5 s |
| Cartão | `card` | cartão amarelo/vermelho que sobe girando sobre o jogador, com o nome | 2 s |
| Impedimento | `offsideCalled` | linha vertical tracejada em `lineX` e anel no atacante (`receiverId`) | 2 s |

Não existe "TRAVE": o motor não registra bola na trave.

**Única mudança no motor:** o evento `offsideCalled` ganha `lineX` (a linha do penúltimo defensor no momento do
passe). Hoje o passe guarda só `receiverOffside`/`aerialOffsideIds` (booleanos/ids); passa a guardar também
`offsideLineX` (`PassState` e `LooseBallState`, opcional), gravado onde esses campos já são calculados (com
`computeOffsideLine`), e os três pontos que emitem `offsideCalled` o repassam. Só dado; nenhuma regra, estatística
ou resultado muda, então não entra em `/lab` nem em `Statistics.ts`. Sem `lineX` (não deveria acontecer), o
efeito mostra só o anel no atacante.

## 5. Onde vale

- Partida ao vivo (`/match`) e `/test`: os dois usam o `PixiPitch`. Sobreposições de debug continuam por cima.
- Todas as constantes visuais num só arquivo (`src/GraficsEngine/pitchStyle.ts`).

## 6. Arquivos

| Arquivo | Papel |
|---|---|
| `src/GraficsEngine/pitchStyle.ts` | Constantes: cores das faixas, sombra, brilho, barrinha, bola, durações e alturas |
| `src/GraficsEngine/ballHeight.ts` (+ teste) | Altura da bola a partir de `pass`/`shot` |
| `src/GraficsEngine/pitchEffects.ts` (+ teste) | Fila de efeitos: adicionar por evento, avançar, alpha, expirar, pausa |
| `src/GraficsEngine/fatigue.ts` (+ teste) | `fatigueColor(energy)` |
| `src/GraficsEngine/PixiPitch.tsx` | Gramado, marcadores, bola, assinaturas de eventos e desenho dos efeitos |
| `src/GameEngine/Infrastructure/EventBus.ts`, `types.ts`, `Domain/gameState.ts` | `offsideLineX` no passe/bola solta e `offsideCalled.lineX` |
| `src/GameInterface/changelog/changelog.ts`, `package.json` | Versão 4.4 |
| `.claude/rules/graphics-engine.md` | Documenta os módulos novos |

## 7. Testes e verificação

- `bun test src/GraficsEngine`: altura 0 em rasteiro e nas pontas (`t` 0 e 1), máxima em `t` 0,5, por tipo;
  cores da barrinha nas três faixas e nos limites; fila (adiciona, alpha decai, expira, pausa congela, real
  time independente da velocidade).
- Teste do motor: `offsideCalled` traz `lineX` igual à linha usada na marcação.
- No navegador (servidor de desenvolvimento, dev-login): uma partida em 1× e 4×, conferindo gramado, sombras,
  bola alta, barrinhas, cartão, os cinco efeitos e que nada fica preso na tela; `/test` com e sem debug.
- Desempenho: sem queda perceptível de quadros com 22 barrinhas e efeitos simultâneos.

## Limitações

- Altura da bola é ilustrativa (parábola por tipo), não física.
- Sem trave, sem zoom, sem clima/horário (fica para depois).
