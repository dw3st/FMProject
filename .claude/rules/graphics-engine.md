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
- `renderInterp.ts` — drawing between sim steps: players and ball are drawn at `lerp(prev, cur, carry / step)`; the engine never sees these positions
- `ballSpin.ts` — pure seam-spin angle of the ball (distance rolled / radius; none paused or on a jump)
- `GameInterface/uiStateThrottle.ts` — throttles React state echoes of the match so a fast simulation does not re-render every step
- `pitchMirror.ts` — `mirrorX` / `mirrorY`: the live match draws the pitch turned 180° (x and y; a reflection on x alone would draw every left winger on his team's right, #142) when the user (engine team A) plays away (#98, `PixiPitch` `mirror` prop), so the home side attacks the way it is listed. Drawing only: `toPixel` and the click inverse go through it; nothing derived from yards may assume "x = 0 is drawn on the left" (the goal-net bulge reads the drawn side). The `GameState` never changes
- `setPieceTransition.ts` — a restart that repositions the teams (corner, free kick, throw-in, goal kick, offside free kick, penalty; never a kickoff) is drawn as an eased walk from the last drawn positions to the layout instead of a jump (`TELEPORT_YDS`): `min(0.8 s, 80% of the real time left on the countdown)` (skipped under 0.12 s), so it always ends before the kick; clock frozen while paused, none with the tab hidden, cut by a /test state swap. Drawing only (debug overlays still read the engine positions); the engine, `CORNER_COUNTDOWN` and the layouts are unchanged
- `pitchMetrics.ts` — pitch geometry in px (`buildMetrics(w, h, { stadium })`); with the stadium the pitch is drawn ×0.9 (`STADIUM.PITCH_SHRINK`) and `stand` describes the band (`outer` = canvas, `inner` = pitch + run-off)
- `crowd.ts` / `stadiumRender.ts` — stand seat grid and the filled seats (pure; fill = attendance / capacity, home fans on the drawn home side, away block ~12% in the opposite end, neutral venue split at the halfway line); the stand and every fan are drawn ONCE into a `Graphics`, baked with `renderer.generateTexture` into a single `Sprite` under the stripes, re-baked only when fill / home team / venue / mirror change. A home goal pulses its alpha (1 → 0.85 → 1, 0.6 s). A stand under works (#137, `PitchStadium.works`, club `StandId`s from `match-setup` → `crowd.works`) has no fans and is drawn as a building site (`worksPieces`: bare base, scaffolding, hazard tape on the pitch side); club stands map to drawn sides by `standSideOf` (north = the engine x = 0 end, south the other, west = bottom touchline, east = top; the mirror swaps the ends). The fill is spread over the open stands; an away end under works sends the away block to the top stand. `/test`: chip Works (north)
- `officials.ts` / `coaches.ts` / `touchlineRender.ts` — referee (diagonal behind the play, ≥ 6 yd from the ball, smoothed, snaps past 30 yd; after a card its target is locked on the last foul spot for 1.5 s and the card shows over his head), assistants (level with the offside line of their half, flag raised on `offsideCalled`) and both managers (technical areas at 40% / 60% of the drawn pitch, below the bottom touchline; face from the server via `loadFaceCanvas`; gestures on the human's mentality change — `coachCue` — and on a goal). Engine yards in, drawn through `toPixel` (mirror included). Props `officials`, `coaches`, `coachCue`, `stadium` of `PixiPitch` (read at mount: switching the stadium / officials on or off remounts — put it in the `key`)
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

