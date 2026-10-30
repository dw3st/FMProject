---
description: Rules for the GraficsEngine module — Pixi.js rendering layer.
globs: "src/GraficsEngine/**"
alwaysApply: false
---

## Responsibilities
- Renders `GameState` to the canvas — reads game state, never owns it
- Converts game-space yards → canvas pixels with `toPixel(x, y)` (built from `buildMetrics`)
- Idle/visual motion is pixel-space only and does not affect `GameState`
- Pitch effects listen to gameBus events (shotResolved, goalScored, foul, card, offsideCalled) inside PixiPitch and are skipped while the tab is hidden; spec docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md

## Pixi conventions
- Use Pixi v8 (`Application`, `Graphics`, `Container` from `pixi.js`)
- Init is async: `await app.init({...})`
- Always destroy the app and remove canvas on React cleanup
- Add player graphics to a `Container` (`world`), not directly to `app.stage`

## Coordinate conversion
- `buildMetrics(canvasW, canvasH)` (`PixiPitch.tsx`) sizes the pitch to the canvas the component gets
- `scale = Math.min(canvasW / (115 + 2 × net depth), canvasH / 74)` — uniform pixels-per-yard; `toPixel` adds the margins

## Files
- `PixiPitch.tsx` — React component wrapping the Pixi canvas
- `simClock.ts` + `pump.ts` — keep the match ticking while the tab is hidden (Worker pulse, shared real-time pump)
- `matchStateSync.ts` — stops a React state echo from rewinding the pitch's simulation
- `playerFaces.ts` — face SVGs rasterised once into circular sprites
- `pitchStyle.ts` — every visual constant of the live pitch (stripes, shadows, stamina bar, ball, effects)
- `markerInfo.ts` — stamina bar colour/fill, booked players (card badge)
- `ballHeight.ts` — illustrative ball height for high balls and shots (raised ball + ground shadow)
- `pitchEffects.ts` — pure effect queue (shot, goal, foul, card, offside) and ball trail, on a real-time clock frozen while paused
- `effectsRender.ts` — Pixi drawing of the effects and the trail
- `renderInterp.ts` — drawing between sim steps: players and ball are drawn at `lerp(prev, cur, carry / step)`; the engine never sees these positions. The step is `SIM_STEP` = 0.2 real s (4.36, the same step as `simulateMatch`), so the drawing at 60 FPS always runs one step behind the engine. A jump bigger than `TELEPORT_YDS` (4, players; they move at most ~1.5 yd per step) or `BALL_TELEPORT_YDS` (30, ball; passes ~9 yd, shots up to ~27 yd per step) is drawn at once
- `ballSpin.ts` — pure seam-spin angle of the ball (distance rolled / radius; none paused or on a jump)
- `GameInterface/uiStateThrottle.ts` — throttles React state echoes of the match so a fast simulation does not re-render every step
- `pitchMirror.ts` — `mirrorX` / `mirrorY`: the live match draws the pitch turned 180° (x and y; a reflection on x alone would draw every left winger on his team's right, #142) when the user (engine team A) plays away (#98, `PixiPitch` `mirror` prop), so the home side attacks the way it is listed. Drawing only: `toPixel` and the click inverse go through it; nothing derived from yards may assume "x = 0 is drawn on the left" (the goal-net bulge reads the drawn side). The `GameState` never changes
- `setPieceTransition.ts` — a restart that repositions the teams (corner, free kick, throw-in, goal kick, offside free kick, penalty; never a kickoff) is drawn as an eased walk from the last drawn positions to the layout instead of a jump (`TELEPORT_YDS`): `min(0.8 s, 80% of the real time left on the countdown)` (skipped under 0.12 s), so it always ends before the kick; clock frozen while paused, none with the tab hidden, cut by a /test state swap. Drawing only (debug overlays still read the engine positions); the engine, `CORNER_COUNTDOWN` and the layouts are unchanged
- `pitchMetrics.ts` — pitch geometry in px (`buildMetrics(w, h, { stadium })`); with the stadium the pitch is drawn ×0.85 (`STADIUM.PITCH_SHRINK`, 0.9 until 4.38.17, 0.78 in 4.38.18) and `stand` describes the band (`outer` = canvas, `inner` = pitch + run-off)
- `crowd.ts` / `stadiumRender.ts` — stand seat grid and the filled seats (pure; fill = attendance / capacity, home fans on the drawn home side, away block ~12% in the opposite end, neutral venue split at the halfway line); the stand and every fan are drawn ONCE into a `Graphics`, baked with `renderer.generateTexture` into a single `Sprite` under the stripes, re-baked only when fill / home team / venue / mirror change. A home goal pulses its alpha (1 → 0.85 → 1, 0.6 s). A stand under works (#137, `PitchStadium.works`, club `StandId`s from `match-setup` → `crowd.works`) has no fans and is drawn as a building site (`worksPieces`: bare base, scaffolding, hazard tape on the pitch side); club stands map to drawn sides by `standSideOf` (north = the engine x = 0 end, south the other, west = bottom touchline, east = top; the mirror swaps the ends). The fill is spread over the open stands; an away end under works sends the away block to the top stand. `/test`: chip Works (north)
- `officials.ts` / `coaches.ts` / `touchlineRender.ts` — referee (diagonal behind the play, ≥ 6 yd from the ball, smoothed, snaps past 30 yd; after a card its target is locked on the last foul spot for 1.5 s and the card shows over his head), assistants (level with the offside line of their half, flag raised on `offsideCalled`) and both managers (technical areas at 40% / 60% of the drawn pitch, below the bottom touchline; face from the server via `loadFaceCanvas`; drawn as a head only since 4.35.1, so the `coachCue` and goal gestures show nothing). Engine yards in, drawn through `toPixel` (mirror included). Props `officials`, `coaches`, `coachCue`, `stadium` of `PixiPitch` (read at mount: switching the stadium / officials on or off remounts — put it in the `key`)
- `playerAnims.ts` — long shot (≥ 20 yd), header and save animations: an offset / lift / scale / rotation on top of the interpolated marker, on the effects clock; nothing queued with the tab hidden
- Draw meter (`/test`, `perfRef`): FPS and average frame-callback ms every 30 frames. Measured for the stadium + officials (Etapa 38): their per-frame logic costs ~6 µs (headless bench, 3600 frames of `11v11-classic`) and the crowd data for a bake ~8 ms once (4–5k fans); the crowd is one sprite, so no per-frame draw cost. The in-browser FPS before/after could not be read on the dev machine (the automated Chrome tab reports `document.hidden`, so the ticker never runs) — pending a manual read in `/test` (Stadium + Officials, crowd 100%)

## Officials' faces (Etapa 38b, 4.17)

`officials` also takes `{ refereeFace?, assistantFaces? }` (server URLs, `refereeFaceUrl`): `makeOfficial` has a "head"
container where the face sprite (rasterised once by `loadFaceCanvas`, like the managers) goes over the kit disc; `true`
keeps the plain disc. Read at mount (the match screen puts the appointment in the pitch `key`). See
`.claude/rules/game/referees.md`.

## Visual 2 (#129, 4.19)

Prop `extras` of `PixiPitch` (read every frame; the live match passes it on, `/test` has the chip **Extras**), drawing
only, nothing in the `GameState`. Pure logic in `matchExtras.ts` (+ test):

- **Stretcher:** on `injury`, a stretcher with two medics comes from the nearest touchline to where the player was
  drawn, waits, and leaves carrying a disc in the team colour (`STRETCHER` 1.4 / 0.9 / 1.6 s, effects clock).
- **Managers** pace their technical area (`coachWalkOffset`, ±`COACH_WALK_FRAC` of the pitch length); **benches**
  (`benchRect`, outer side of each area) with one disc per substitute, redrawn only when a bench changes size (with
  Officials on).
- **Net:** the goal effect draws a mesh pushed out of the goal, wobbling and settling (`netShake`, `EffectCtx.netShake`);
  without extras, the single bulging line as before.
- **Crowd:** the stand is now a plain `Graphics` (`drawStandBase` + `drawStandEdges`) and each side's fans one baked
  sprite of their own box (`drawFans`, `fansBounds`): the home fans pulse on a home goal, the scoring side's fans jump
  (`crowdJumpPx`, three hops over `CROWD_JUMP_S`). Texture area about the same as the single crowd texture before.
- **Celebration:** scorer and assister get the `celebrate` player animation (two hops and a full turn, 1.4 s).
- Cost: the per-frame logic is ~2 µs (headless micro-bench, 3600 frames); the in-browser FPS was not read (no browser
  available on the dev machine at the time).

## Enfeites do estádio (Etapa 40, 4.20)

`PitchStadium.decor` (faixa, bandeirão, mosaico; `stadiumDecor.ts` → `drawDecor`): desenhados na arquibancada de trás do gol
da casa, na cor do clube, dentro da torcida assada (nenhum custo por quadro); nunca em campo neutro nem numa arquibancada em
obra. Vêm do `match-setup` (`crowd.decor`) só nos jogos em casa do clube do jogador. Ver `.claude/rules/game/achievements.md`.

## Superfície do gramado (4.28)

`pitchSurface.ts`: faixas por condição (≥ 70 nítido, 70–40 desbotado, 40–15 gasto, < 15 terra e lama), formas em jardas, sintética nunca remenda; linhas tracejadas num gramado podre. Prop `pitch` do `PixiPitch` (tipo, corte, condição): desenhada uma vez em Graphics estático e refeita só quando o gramado muda. `PitchSurfaceSvg` desenha o mesmo na prévia e no Clube. Ver `.claude/rules/game/facilities.md`.

## Luz e sombra (4.29)

Desde a 4.32 o clima também afeta a partida, ver `.claude/rules/game/weather.md`.

Spec `docs/superpowers/specs/2026-10-16-match-lighting-design.md`. Só desenho: nada entra no `GameState`, no motor, no quickSim nem no `/lab`.

- `src/Domain/matchday/matchConditions.ts`: `MatchConditions.sunset` ("HH:MM", o `SUNSET` da estação e do clima; nenhum sorteio novo). `src/Domain/matchday/stadiumSun.ts`: `stadiumSunSide(id)` → `{ side: "top"|"bottom", lean −1..1 }` pelo id do clube (campo neutro: id do jogo).
- `matchLighting.ts`: `matchClockMinutes(state, kickoff)` = saída de bola + tempo jogado + 15 min de intervalo + acréscimos (prorrogação com intervalo de 5 min); `matchLighting({ clock, sunset, weather, sun })` devolve véus quente / cinza / escuro, refletores 0..1, vinheta, sombra da arquibancada (profundidade de 8% a 50% da largura do campo nos 90 min antes do pôr do sol) e sombras dos jogadores (uma sombra de sol para longe do sol, 3,4 raios do marcador na hora dourada; 4 sombras fracas de refletor em X à noite). Faixas relativas ao pôr do sol: dourada a partir de −90 min, crepúsculo −30..+30 (o sol some, os refletores acendem), noite depois de +30. Clima: nublado / chuva / neve tiram as sombras de sol (parcialmente nublado / frio mantêm metade) e somam um véu cinza. Constantes `LIGHTING` em `pitchStyle.ts`.
- `weatherParticles.ts`: chuva 150 gotas, neve 100 flocos, em frações do canvas, no relógio de efeitos (parado na pausa; nada desenhado com a aba escondida); `wind_rain` (mais inclinada) só pelo `/test`.
- Prop `lighting` (`PitchLighting`) do `PixiPitch`: camada de luz acima do gramado, linhas e arquibancada e abaixo dos jogadores, refeita só quando o relógio da partida anda um minuto ou as entradas / o espelho mudam; sombra de luz por marcador (`lightShadow`) refeita só quando a especificação da sombra muda, espelhada com o campo; partículas num traço / preenchimento só, acima dos jogadores. Sem a prop nada muda.
- `POST /api/match-setup` devolve `conditions: { kickoff, weather, sunset } | null` e `sunSide`; o jogo de seleção não tem luz. O `MatchScreen` passa `lighting` (semente = id do jogo).
- `/test`: Hora (Off · 13:30 · 17:30 · 20:45 · Por jogo = saída 17:30, pôr do sol 18:30) e Clima (sunny · cloudy · rain · wind_rain · snow).
- FPS: não medido. A aba automatizada do Chrome limita os quadros (~1,3/s), então o medidor do `/test` não vale lá; a leitura manual numa janela normal está pendente (meta: queda ≤ 5 FPS com Hora 20:45 + chuva contra Hora Off).
- Limitações: a orientação do estádio é desenhada, não real; a luz não afeta a simulação; sem sombra de jogador nas arquibancadas, sem reflexo em poças.

## Sombras dos jogadores (4.29.2)

`playerShadow.ts` (`shadowPolygons`, puro, com teste): com a luz ligada, cada jogador tem uma sombra de contato suave
(elipse deslocada para baixo e para o lado) e a sombra projetada do sol (afinando dos pés até a ponta, clareando ao
longo do comprimento; desde a 4.29.3 colada ao corpo: 1,35 raio de dia, 1,65 no fim da tarde, sempre um pouco de lado) ou, à noite, 4 sombras curtas
dos refletores. "Suave" = a mesma forma desenhada 4 vezes, cada uma maior e mais fraca (sem filtro), em verde-escuro
(`LIGHTING.SHADOW_COLOR`). A sombra dura antiga (`MARKER_SHADOW`) só aparece sem luz. Constantes em `LIGHTING`.

## Sombra do estádio (4.30)

Como no FM (reports de tester com imagens): cada estádio tem um id único (`stadiumIdOf`, `src/Domain/matchday/stadiumSun.ts`:
`std_<nome>_<cidade>` do `venue`; clubes que dividem o estádio dividem a sombra; sem estádio `std_club_<id>`; campo
neutro `std_neutral_<jogo>`) e um perfil sorteado desse id (`stadiumSun`; não é a orientação real): lado do sol,
inclinação, altura da arquibancada (0,75–1,25), contorno da cobertura em degraus (`sideSteps`), recorte nos cantos
(`cut`: no lado da inclinação, nos dois ou nenhum), sombra da arquibancada do fundo em L (`endShadow`, `endDepth`,
`endSteps`) e **coberto** (6%: sem sol, sem chuva/neve, luzes sempre acesas, metade da escuridão da noite).

`stadiumShadow.ts` (`stadiumShadeGrid`, puro, com teste): uma grade de 1 jarda (0 = sol, 1 = sombra) com bordas em
`smoothstep` de `SOFT` jardas; a lateral cobre 30% → 70% da largura até o pôr do sol (× altura, até 85%), a do fundo
`END_DAY` → 100% do alcance. `PixiPitch` escreve a grade num canvas (sombra azul-esverdeada translúcida; o lado ao sol
amarelado, `LIT`), estica como sprite sobre o campo (filtro linear suaviza mais; espelho incluído) e redesenha a cada
10 segundos de jogo com a camada de luz (a sombra cresce sem saltos). `/test`: chips Stadium (cut lean · both · none ·
covered).

## Estádios reais (4.31)

Nas 10 ligas principais (`LEAGUES` de `scripts/faces/wikidata.ts`) o estádio é real: `bun scripts/fetchStadiums.ts
[--leagues a,b] [--refresh]` busca no **Wikidata** (CC0) o estádio de cada clube (P115 sem fim; rank preferido, depois
o início mais recente; coordenadas, capacidade, teto retrátil/fechado pelos rótulos de P31/P527) e no
**OpenStreetMap** (Overpass, servidor principal e espelhos; ODbL, crédito "© colaboradores do OpenStreetMap" no rodapé
da landing) o campo (`leisure=pitch`: orientação pelo retângulo de menor área) e o contorno do estádio
(`leisure=stadium`): a altura de cada arquibancada = 0,5 × a distância do lado do campo até o contorno (nenhuma abaixo
de 8 m), limitada a 1,35 × a altura pela capacidade (8 m + 1 m por 2 500 lugares, até 40; um contorno que pega
esplanada ou estacionamento); lado que o raio não alcança (contorno incompleto), contorno colado ao campo ou estádio
sem contorno: a altura pela capacidade (`standHeight`, `heightFromCapacity`). Campo de futebol a partir de 4 800 m²;
sem campo no mapa (campo de futebol americano), um de 105 × 68 m no centro do contorno, na direção dele. Geometria pura em `scripts/stadiums/geometry.ts` (+ teste).
Respostas em `data_process/stadiums/cache/` (gitignored); só os números derivados vão para
`src/example_data/stadiums.json` (`squadId → RealStadium`: id `std_<item>`, coordenadas, eixo, alturas, teto, fuso).
Correções à mão em `data_process/curated/stadiumCorrections.json` (`venue`: o item certo quando o Wikidata não tem a
mudança de estádio ou o clube não tem item; `lat`/`lon`: o ponto do Wikidata longe do estádio; `roof`; `skip`). 4.31.1:
os 212 clubes das 10 ligas com estádio real (Brentford, Alverca, Casa Pia e Barracas Central pelo `venue`, Arouca pelas
coordenadas) e 5 tetos retráteis à mão (Bernabéu, Johan Cruijff ArenA, Veltins-Arena, Mercedes-Benz Stadium, BC Place). Copiar para `src/Data` como o resto do mundo.

- `src/backend/stadiumData.ts` (`matchSun`): o `match-setup` usa o estádio real do mandante (nunca em campo neutro),
  com o pôr do sol real da data (`conditions.sunset`) e a data (`conditions.date`); teto retrátil fecha com chuva, neve
  ou frio. Clube sem dado: o perfil sorteado de antes.
- `src/Domain/matchday/solar.ts` (+ teste): posição do sol (NOAA), pôr do sol, fuso pelo país (padrão + horário de
  verão UE/EUA; EUA/Canadá pela longitude).
- `realSunGeometry` (`matchLighting.ts`): a cada redesenho, azimute e elevação do sol → direção da sombra no campo do
  jogo (+x = eixo do campo, +y = eixo + 90°), lado e inclinação, profundidade de cada arquibancada = altura ÷
  tg(elevação) − `REAL.SETBACK` (6 m), até `MAX_REACH` × a altura; o sol some abaixo de `FADE_ELEVATION` (3°). A sombra
  dos jogadores aponta na direção real. Contorno da cobertura e cantos continuam ilustrativos (do id).
- `/test`: chips Stadium "Old Trafford, Dec 15 / Jun 21" (sol calculado, pôr do sol real) com a Hora.

### Horários e sombra dos jogadores (4.31.2)

- `matchConditions` sorteia o horário pelos horários típicos do país do mandante (`kickoffSlots`: sábado, domingo e
  meio de semana para Inglaterra, Espanha, Itália, Alemanha, França, Portugal, Holanda, Brasil, Argentina e EUA, com
  peso pela frequência; sexta e segunda usam os de meio de semana), noites continentais pela competição (UCL/UEL
  18:45 / 21:00, uma hora antes na Inglaterra e em Portugal; Libertadores/Sul-Americana 19:00 / 21:30); os demais
  países com os horários genéricos de antes. Um sorteio só, então o clima de cada jogo não mudou.
- Estádio real: a sombra de sol dos jogadores cresce de `SUN_SHADOW.LEN` (sol a `REAL.LOW_FROM` = 35° ou mais) até
  `LEN_LOW` (1,9 raio, sol a `REAL.LOW_TO` = 8° ou menos).

### Sombra redonda dos jogadores (4.31.3)

A pedido do usuário a sombra de sol (e a dos refletores) deixou de ser uma faixa afinando: é um oval suave logo
embaixo do jogador (`castPolygons`, `playerShadow.ts`), com o centro a `SUN_SHADOW.LEN` raio do centro do marcador na
direção oposta à luz, raios `WIDTH` ao longo e `TIP` através; com o sol baixo vai até `LEN_LOW` / `WIDTH_LOW` (0,55 /
1,25). À noite, 4 ovais fracos dos refletores. A sombra de contato some aos poucos quando há sol ou refletor
(já fica tudo embaixo).

### Vinheta e brilho dos refletores (4.31.4)

Report de tester (todas as partidas noturnas com "arcos" claros nos cantos): o brilho era 5 círculos sobrepostos e a
vinheta 6 faixas, que viravam degraus visíveis numa tela grande. Agora são degradês radiais assados uma vez em texturas
de canvas 256 × 256 (`LIGHTING.GRADIENTS`), esticados: a vinheta sobre o canvas inteiro, o brilho como um sprite em cada
canto (raio `GLOW_RADIUS` × o lado maior). `updateLight` só muda a opacidade (`drawGradients`); texturas liberadas na
desmontagem.


## Remote mode (multiplayer part 7, 4.36)

`PixiPitch` prop `remote` (`RemoteFeed`, read at mount): the pitch never calls `advanceSim`; it draws the latest
`GameState` from the server and the positions of the last two `h2h_frame`s blended by the real time since the newest
one (`remoteInterp.ts`: `remotePositions`, `remoteDrawnBall`, `withFramePositions`; step = `H2H.FRAME_MS`, 200 ms, one frame per sim step),
limited to 1, so a late frame freezes on the last one instead of extrapolating. One frame of delay buys a smooth
drawing whatever the network jitter. Drawing only; absent = the pitch runs the match itself, as always.

## Atmosfera do estádio (4.38.1)

`stadiumAtmosphere.ts` (puro, com teste): torres de iluminação nos quatro cantos da arquibancada (`towerSpots`, painel
virado para o centro; acesas quando `flood ≥ LIGHTS_ON`; o brilho dos cantos sai dos painéis; sem torres com teto
fechado), celulares na torcida à noite (`phoneLights`: 3% dos lugares ocupados, o dobro por `GOAL_BOOST_S` num gol do
mandante; redesenhados a cada `REDRAW_S`) e, num jogo grande (`PitchStadium.bigMatch`), sinalizadores com fumaça na
torcida da casa e fogos à noite (`flareSmoke`, `fireworks`, calculados do tempo) na entrada em campo (`matchStart`) e
nos gols do mandante. Jogo grande (`isBigMatch`, `src/Domain/matchday/bigMatch.ts`): continental, copa a partir das
quartas, clássico da mesma cidade; o `match-setup` devolve `crowd.bigMatch` (`matchIsBig`, `matchImportance.ts`).
Torres e celulares numa camada com máscara da arquibancada; a fumaça sob os jogadores; os fogos por cima. Só desenho,
no relógio de efeitos (nada com a aba escondida ou pausado). `/test`: chips Big game e Celebrate (com Stadium).

### Fogos no estilo 16 bits (4.38.9)

`fireworks` (`stadiumAtmosphere.ts`): cada fogo sobe como um bloco com rastro (`RISE_S`), estoura com um clarão
(`FLASH_S`) e abre em dois anéis de faíscas quadradas (`OUTER` 16, `INNER` 8) de cores da `PALETTE` (às vezes a do
clube), que caem (`GRAVITY`) e piscam alternadas a partir de `BLINK_FROM` da vida. `Spark.square` desenha um bloco
(`rect`) no `PixiPitch`.

## Visual da partida refinado (4.38.10)

Mock aprovado em 2026-10-28. Constantes em `MATCH_LOOK` (`pitchStyle.ts`):
- **Linhas:** `drawPitch` com um passe largo e fraco (brilho de cal, `LINE_GLOW_*`) sob a linha fina (`LINE_W`); marca do
  centro; gols com malha, fundo da rede, sombra da trave de trás e postes com ponta redonda (`GOAL`); bandeirinhas (`FLAG`).
- **Gramado:** textura de grãos (`TilingSprite` de um ruído 128 px, `GRAIN`) e um degradê radial (centro claro, bordas
  escuras), assados uma vez, sob as linhas.
- **Jogadores:** brilho em meia-lua e borda escura embaixo sobre o rosto (`GLOSS`, `RIM`); cartão inclinado; nome numa
  pílula escura com faixa da cor do time (`PILL`, redesenhada só quando o nome muda); fôlego num arco em volta
  (`STAMINA_ARC`, no lugar da barra); seta de direção pela velocidade desenhada suavizada (`CHEVRON`, some parado ou num
  salto); anel dourado pulsando sob o portador (`HOLDER`).
- **Rastro da bola:** afinando da cauda para a bola (`drawTrail`).
- **Torcida de pessoas** (4.38.12, mock aprovado): cada torcedor é uma pessoa (`crowdFigures.ts`: um atlas em canvas com
  o corpo branco tingido na cor da camisa, braços para baixo e para cima, cachecol nas cores da casa e as cabeças —
  6 tons de pele × 7 cabelos, careca e boné), desenhada numa `ParticleContainer` por lado (2 ou 3 partículas por
  torcedor, posição e textura dinâmicas). `crowdMotion.ts` (com teste): `fanLooks` (aparência, fase por setor de
  `SECTION_CELLS`, velocidade própria, cachecol e bandeirinha só na casa), `fanPose` (balanço suave contínuo, ola a cada
  `WAVE_EVERY_S` com os braços para cima, gol do lado com pulos e braços para cima por `GOAL_S`), bandeirinhas na mão
  balançando (`handFlagAngle`) e bandeirões segurados por um grupo, com o pano subindo junto e ondulando
  (`standBanners`, `bannerOffset`; nunca no fundo visitante, em obra ou em campo neutro). Tudo com `extras`; só desenho, no
  relógio de efeitos.
- **Fôlego só do seu time:** prop `staminaTeams` (ausente = os dois, como no `/test`); a partida ao vivo passa
  `[mySide]`.

## Banco de reservas e bandeiras do clube (4.38.14)

- `benchView.ts` (puro, com teste; desde a 4.38.15 no estilo da torcida: as mesmas figuras do atlas `buildCrowdAtlas`, sprites tingidos no uniforme, num banco sempre abaixo da linha lateral, `benchLayout`): o banco mostra até 9 reservas (`benchShown`: até dois goleiros, depois os outros na
  ordem do elenco) em duas fileiras (`benchRows`) dentro de um banco visto de cima (piso, encosto, paredes, cobertura).
  Cada reserva é uma pessoa (ombros na cor do uniforme, cabeça com cabelo, `benchLook` pelo id) que olha a bola, se
  mexe e às vezes levanta (`benchPose`), e levanta com os braços para cima num gol do time. Goleiros com cores próprias
  (`benchKits`, uma cor por goleiro, nunca perto do uniforme). Redesenhado todo quadro com `extras` e Officials.
- Bandeiras: `PitchStadium.homeColors` (as duas cores do mandante) e `homeCrest` (URL do escudo, `squadLogoUrl`). As
  bandeirinhas e os bandeirões ficam na cor principal com o escudo no meio (`loadCrestCanvas`, sprites na `crestLayer`
  que seguem o pano), uma cor só; cachecóis e bonés nas duas cores.
- Pênalti 2D (4.38.15): a mira corre sozinha pelo gol (`aimAt`, períodos de 2,3 s e 1,7 s, fora de passo com a barra de força de 1,4 s); um clique (ou espaço) chuta com a mira e a força daquele instante.
- Banco (4.38.16, opção A do mock): visto de cima, cabeça e ombros pequenos (unidade ≤ 0,4 do raio do jogador) numa
  fileira, sempre abaixo da faixa do bandeirinha. Com o estádio a faixa de baixo é mais funda
  (`STADIUM.BENCH_RUNOFF_YDS` 4,7: `AR_LANE_YDS` 1,8 para o bandeirinha, o resto para os bancos) e o campo é medido com
  ela (`buildMetrics`: a escala vem de `largura / comprimento` ou `altura / (74 + extra)`), então as arquibancadas
  mantêm a profundidade.
- 4.38.19: campo a 0,85 (opção A do mock), sem os dois anéis da 4.38.18; os bandeirões da torcida saíram (`standBanners`
  removido); ficam as bandeirinhas na mão com o escudo.
- 4.38.20 (reports): túnel dos jogadores no meio da arquibancada de baixo (`standTunnel`, `STADIUM.TUNNEL_FRAC`, sem torcida,
  piso escuro entre paredes claras) e o caminho até a linha lateral (`benchGfx`); fotógrafos atrás dos dois gols
  (`PHOTOGRAPHERS`, mesma unidade do banco, câmera para o campo), flash de vez em quando e uma rajada depois de um chute
  para aquele gol. Padrão dos desenhos novos: vistos de cima, unidade = 0,4 do raio do jogador.

## Campo ao vivo refinado (4.38.21, mock escolhido: Jogadores B, Bola B, Estádio A, faixa de lance sem placar de TV)

- Jogadores: borda nas duas cores do uniforme (`drawMarkerRing`; segunda cor `teamAColor2`/`teamBColor2`, a primeira cor do
  clube diferente do uniforme usado, lida a cada quadro porque chega depois), número da posição (vaga + 1) numa etiqueta
  embaixo; nome só do portador e de quem recebe o passe (todos no debug).
- Lances (`playGfx`): linha tracejada do passe até quem recebe com um anel nele, arco do chute em voo, anel de impacto
  onde o chute termina.
- Placas de LED (`LED`, `LED_ADS`, `ledAdFor`): no topo e atrás dos gols, painéis com propagandas fictícias sorteadas
  por jogo, ciclo e painel, que viram juntos a cada `SWITCH_S` numa onda; depois de um gol todos piscam o gol
  (`PitchStadium.led.goal`). Só com `extras`.
- Faixa de lance (`MatchEventBanner`, `MatchScreen`): gol (nome, minuto, assistência), cartão e substituição, 4 s,
  embaixo do campo; os cartões saíram do aviso de cima.
- Fotógrafos sorteados por jogo (`photographerSpots`): 8 a 13, atrás dos gols (fora das traves) e junto da linha de cima.
- Bandeirinha de escanteio aponta para dentro; textura e vinheta do gramado mais leves (`GRAIN` 0,045, `EDGE_DARK` 0,1).

## Patrocinadores, bola e fotógrafos (4.38.22)

- `ledAds.ts`: 109 patrocinadores inventados (camisas, lojas, comida, empresas, mídia, futebol), nunca marca real; cor de cada um por índice nos 15 pares. `pitchStyle.ts` reexporta `LED_ADS`.
- A bola com dono é desenhada nos pés do portador (borda do marcador, na direção em que ele anda ou ataca), nunca no centro do rosto (report).
- Fotógrafos só atrás dos dois gols (`photographerSpots`: lados esquerdo e direito), nunca entre o bandeirinha e a torcida (report).

## Caminhos no Pixi (4.38.23)

Depois de `fill()`/`stroke()` o Pixi v8 continua o caminho do último ponto (`_initNextPathLocation`): um `arc()` sem `moveTo` antes começa com uma linha desde esse ponto. O brilho do marcador (elipse e depois o arco da borda) desenhava um risco cinza no rosto de todo jogador (report). Sempre `moveTo` até o início do arco depois de um preenchimento. O rastro da bola só começa fora do marcador de quem chutou.

## Marcador sem brilho (4.38.24)

O brilho branco em meia-lua sobre o rosto saiu (report: "círculo branco dentro da cabeça"); fica só a borda escura embaixo (`MATCH_LOOK.RIM`).

## Gramado pintado (arte nova, fase 1, 4.41.4)

`paintedTurf.ts` (puro, com teste): a partida usa um fundo pintado de `art/backdrops/match/` (o mesmo volume e rota da arte
nova, `src/backend/artAssets.ts`), escolhido pela grama e pelo corte (`paintedTurfId`: sintético; xadrez, diagonal e
anéis; listras em três tons, o tom pelo clube mandante, `pitch.ground`). Só as versões noturnas (as de dia trazem uma
sombra de arquibancada fixa: a luz e a sombra real do jogo continuam por cima) e só a grama (`PAINTED_TURF.FRAME`; a
arquibancada pintada fica de fora): o retângulo do campo pintado (`PITCH`) cai sobre o campo do jogo
(`paintedPlacement`, girado 180° no espelho). As imagens de gasto/lamacento não são usadas: sobre a grama limpa vão um véu
da cor da faixa (`paintedWash`) e as falhas sorteadas do jogo (`paintedOverlay`, só a camada `wear`), as linhas e o
tracejado de sempre. Sem a imagem (servidor sem arte, `ART_VISUAL=0`, chave "Visual novo" desligada em Configurações,
`fm.visual.new`) ou enquanto ela carrega (`Assets.load`, ~350 KB), o gramado desenhado de antes. O `/test` carrega a
arte (`createPage(..., { art: true })`) e mostra pelos chips de grama, corte e condição. Neve e neblina ficam para depois.

## Bola com dono no modo remoto (4.41.4)

`heldBallId` (`remoteInterp.ts`): no modo remoto (transmissão, jogo entre técnicos) o estado chega a cada segundo e as
posições a cada passo; o dono do estado só conta (bola nos pés, brilho, nome) enquanto a bola desenhada está a até
`REMOTE_HOLD_YDS` (2) dele. Antes, depois de um passe a bola voltava aos pés do dono antigo até o estado seguinte (report).

## Jogadores em sprite (arte nova, fase 2, 4.41.6)

`playerSprite.ts` (puro, com teste), no modelo da prévia de arte (`fmproject-art-handoff/reference/preview-template.html`):
cada jogador é um boneco visto de cima em seis camadas tingidas (meias e camisa no uniforme, gola na segunda cor, pele e
cabelo por jogador `spriteLook`, detalhe sem tinta), do tamanho do marcador (`spriteScale`), sobre o anel do time; o disco,
o brilho e o rosto do marcador somem e o rosto vai para a pílula de nome (quem tem a bola ou vai receber). Andar e correr
pela velocidade desenhada com folga (`RUN_UP` / `RUN_DOWN`), passada que cresce com a velocidade, virada pelo tempo; ações
como sequências de quadros com tempos fixos (`actionChain`) disparadas pelos eventos: chute, passe, lançamento do goleiro,
domínio, cabeceio, carrinho, falta (cai / reclama), lesão, comemoração, mergulho e encaixe do goleiro (lado pelo desenho).
Goleiro com uniforme próprio (`benchKits`) e gola escura. Atlas `src/example_data/assets/player` e `/keeper` (só esses
quatro arquivos versionados), servidos em `/assets/game/v1/` (`GAME_ART_FILES`, `staticAssets.ts`). Só com o visual novo
(`newVisualOn`: `ART_VISUAL` do servidor e a chave do jogador); sem ele, o disco com o rosto de antes. Os eventos de passe,
carrinho e encaixe também seguem na transmissão e no jogo entre técnicos (`WATCH_EVENTS`, `H2H_FORWARDED_EVENTS`).

## Arbitragem e equipe em sprite (arte nova, fase 3, 4.41.7)

`officialSprite.ts` (puro, com teste): árbitro, bandeirinhas, técnicos, médicos e quarto árbitro como bonecos do atlas
`src/example_data/assets/officials` (seis camadas tingidas, mesmo andar e virada dos jogadores, `stepMotion`). Árbitro com
o uniforme escuro de gola amarela, levanta o cartão (`referee-card`); bandeirinha anda de lado de frente para o campo e
corre pela linha acima de `AR_RUN_UP` (`assistantSideStep`), bandeira levantada no impedimento; técnico na cor do clube,
aponta no gesto e no gol; médicos da maca correm, ajoelham e carregam; quarto árbitro entre as áreas técnicas, placa
levantada por `BOARD_S` a cada `playerSubstituted`. `attachFigure` (PixiPitch) esconde o disco, o rosto e a bandeira
desenhados; sem o atlas ou com o visual novo desligado, o desenho antigo. Os rostos reais dos árbitros não aparecem nos
bonecos.

## Torcida e fotógrafos da arte nova (fase 4, 4.41.8)

`buildArtCrowdAtlas` (`crowdFigures.ts`): com o visual novo, o atlas da torcida é montado das peças de
`src/example_data/assets/crowd` (24 px, `ART_FIGURE_FRAME`), no mesmo esquema de uma textura por lado (ParticleContainer):
camisas brancas tingidas por torcedor, cachecóis na cor da casa, cabeças = pele com os braços da pose + cabelo (estilo e
cor pelo índice) ou boné. Três poses (`FanArms`): braços baixos, levantados e mãos na cabeça (o lado que levou o gol,
enquanto o outro comemora). Sem a arte, `buildCrowdAtlas` de antes (duas poses). Fotógrafos: bonecos `photographer` do
atlas de oficiais (`officialSprite.ts`), câmera levantada com o jogo perto do gol deles ou depois de um chute.

## Lances, câmera e replay (arte nova, fase 5, 4.41.9)

- **Letreiro de gol** (`MatchEventBanner` → `GoalTvCard`): com o visual novo, o gol entra pela esquerda com a foto de quem
  marcou, `GOL · 23'`, o nome, escudo e time (e a assistência) e o placar na ordem da tela; 5,2 s. Sem o visual novo, a
  faixa de antes.
- **Câmera** (`matchCamera.ts`, `stepCamera`): prop `camera` do `PixiPitch` (`fixed` = o campo inteiro, como sempre;
  `follow` = zoom `FOLLOW_ZOOM` 1,6 seguindo a bola, sem mostrar fora do canvas). A transformação é do `app.stage`; só a
  partida ao vivo (preferência `fm.match.camera`, Configurações) e o chip Follow cam do `/test` a ligam.
- **Replay do gol** (prop `replay`, preferência `fm.match.replay`, ligado por padrão): o campo guarda as posições
  desenhadas dos últimos segundos (`recordFrame`); `DELAY_S` (1,6) depois do gol toca `WINDOW_S` (4,2 s) antes dele a
  `SPEED` 0,55 com zoom `REPLAY_ZOOM` 1,9, segurando a simulação (o `pump` conta como pausado), e avisa a tela
  (`onReplay`, selo "Replay"). Só desenho: o resultado não muda. Nunca no modo remoto (jogo entre técnicos, transmissão)
  nem com a aba escondida.
- **Bolas paradas e goleiro** (`playerSprite.ts`): no lateral o cobrador segura a bola sobre a cabeça (`THROW_IN_HOLD`)
  e arremessa (`throwGo`); o goleiro soca quando não agarra (`punch`) e anda de lado quando se move devagar
  (`keeper-side`); `KNEE_SLIDE_SHARE` (35%) dos gols com o joelho no chão.

## Telas fora da partida (arte nova, fase 7, 4.41.11)

Com o visual novo: fundos pintados nas telas de entrada (`PitchBackdrop` `scene`, `backgrounds/bg-landing|new-game.webp`),
medalhas (`medals/medal-<tier>.svg`) e molduras do rosto do técnico (`ManagerFaceImage` `frame`, `frames/frame-<f>.svg`),
servidos do repositório (`GAME_ART_FILES`); desenhos das instalações (`paintedFacility(item, nível)`,
`facilities/facility-<id>-<1..5>.webp`) e ilustrações da caixa de entrada por categoria (`paintedNews`) do volume de arte,
anunciados por `/api/art/faces` (`facilities`, `news`). Sem a arte, o desenho de antes. Ficaram para depois: ícones das
abas e da caixa (seguem no lucide), og-image/favicon, fundo de neblina do pênalti.

## Qualidade e movimento reduzido (arte nova, fase 8, 4.41.11)

`motionPrefs.ts` (+ teste): `prefersReducedMotion()` e `nextAutoQuality`. Prop `quality` do `PixiPitch` (`high` | `light`);
com `light` ou movimento reduzido (`calm`) o campo não desenha celulares, sinalizadores, fogos, flashes dos fotógrafos,
movimento da torcida nem chuva/neve, a câmera fica no campo inteiro e não há replay. Configurações → "Qualidade gráfica"
(`fm.visual.quality`: automática, alta, leve); a automática lê o FPS do campo (`perfRef`) a cada 2 s e passa para leve
depois de 3 leituras abaixo de 40 (`AUTO_QUALITY`), sem voltar na mesma partida. O pênalti pintado com movimento reduzido
não balança nem treme a tela. Só desenho.

## O resto do pacote (arte nova, fase 9, 4.41.12)

Tudo com o visual novo e só quando o arquivo carrega; sem ele, o desenho de antes. Só desenho.
- **Bola** (`ball/ball-atlas`, `ballSpin.ts`: `nextBallRoll`, `ballSpriteFrame`): 8 quadros = 72° de rolagem, virada na
  direção do movimento; laranja na neve (`BALL_SPRITE.SNOW_TINT`).
- **Traves e rede** (`goal/goal-net.png` sob os jogadores, `goal/goal-frame.png` por cima, `GOAL_SPRITE`): com elas o
  `drawPitch` não desenha o gol.
- **Estádio** (`stadiumArt.ts`): textura da arquibancada vazia sob a torcida (escurecida 0,38, `STAND_TILE_ROTATION` por
  lado) e a "em obra" no setor em obra (`drawStandDetails(..., textured)` mantém corredores, túnel e fita); túnel tingido
  na cor do mandante; torres (`floodlight-tower`, cinza com os refletores apagados); banco e cobertura translúcida por cima
  dos reservas; moldura do LED em cada painel.
- **Efeitos** (`fxArt.ts`, `spritePool.ts`): fogos com o atlas (4 estilos × 12 quadros, dois quadros em fusão, aditivo;
  `fireworks(b, now, shellSprites)`), fumaça em sprites tingidos (`SmokePuff.n`), ponta do sinalizador e flash dos
  fotógrafos (4 quadros).
- **Neve e neblina:** neve sem teto usa o fundo pintado `match-backdrop-snow`; neblina (`matchFog.ts`: 30% dos jogos
  `cloudy`/`cold`, pelo id do jogo, nunca coberto; `PitchLighting.fog` força no `/test`) = duas camadas de `fog.webp`
  (`fogArt.ts`) derivando; o pênalti desses jogos usa `penalty-bg-fog`.
- **Pênalti** (`penaltyRig.ts` → `RigPlan.kind`): cavadinha (gol pelo meio com o goleiro caído, 1 em 3) e chapa (gol baixo no
  canto do goleiro, mergulho atrasado). O resultado não muda.
- **Corte "Sem padrão"** (`MowingPattern` `none`): sem fundo pintado (todos são cortados), o gramado desenhado sem listras;
  a IA nunca escolhe.
- **Proporção realista** (`player/player-real-atlas`, prop `realPlayers`, Configurações → Jogadores, `fm.visual.players`).
- **Ícones** (`ArtIcon` em `Icons.tsx`, máscara CSS em `currentColor`): `tab-*` na barra superior, `inbox-*` na caixa.
- **Marca:** `Wordmark` usa `brand/wordmark.svg`; favicon = `brand/icon.svg`; a landing tem `og:image`
  (`brand/og-image.png`) e `apple-touch-icon`.
