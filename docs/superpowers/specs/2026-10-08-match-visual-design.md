# Visual da partida e estádio (Etapa 38)

Etapa 38 do `docs/ROADMAP.md`, issues #107 (árbitros, técnicos à beira do campo, animações) e #99 (estádio com
torcida). Desenho aprovado em 2026-10-08. Versão **4.12** (a 4.10 e a 4.11 saem antes, em paralelo).
Regras que esta etapa muda: `.claude/rules/graphics-engine.md`, `match-flow.md`, `game/facilities.md`.

## Decisões

| Tema | Decisão |
|---|---|
| Onde mora | Tudo de árbitro, técnico, animação e estádio é **só desenho** (`src/GraficsEngine`). Nada entra no `GameState`, no motor, no quickSim nem no `/lab` |
| Árbitro | Um árbitro que segue o lance em diagonal, a ≥ 6 jardas da bola, com posição suavizada; mostra o cartão no evento `card` |
| Bandeirinhas | Dois, um em cada lateral, cada um numa metade (diagonal), acompanhando a linha de impedimento da metade; levantam a bandeira no `offsideCalled` |
| Técnicos | Um de cada time na área técnica (lateral de baixo, desenhada), com o rosto do servidor (`managerFaceUrl`) rasterizado como as caras dos jogadores; gesto curto quando a mentalidade do jogador muda e quando o próprio time marca. A IA não muda mentalidade (só comemora) |
| Animações | Chute de longe (≥ 20 jardas do gol), cabeçada, defesa do goleiro; a partir de `shot`, `header`, `shotResolved` (já existem). Mesmo relógio e mesma regra de aba oculta dos efeitos |
| Estádio | Faixa fina nos quatro lados com arquibancada e torcida (pontos), o campo encolhe 10% (`PITCH_SHRINK = 0,9`) |
| Torcida | Cheia na proporção público / capacidade da partida; cores dos dois clubes, a casa com a maior parte; setor visitante no fundo da direita (o mandante é desenhado à esquerda, #98); campo neutro dividido meio a meio; sem público conhecido, ocupação padrão 0,65 (`GATE.FILL_RATE`) |
| Custo de desenho | A torcida é desenhada **uma vez** num `Graphics` e assada numa textura (`renderer.generateTexture`): um único `Sprite`. Redesenhada só quando muda tamanho, ocupação ou cores |
| Jogos importantes | Clássico (definição de `board-fans.md`: mesma cidade, ou o líder da liga sem rival da cidade) ×1,20; mata-mata de copa ×1,15; mata-mata continental ×1,25; combinados por produto, teto ×1,30. Multiplica a **demanda** do clube do jogador (bilheteria, prévia, gráfico de público). A IA não muda |
| Público na tela | `POST /api/match-setup` devolve `crowd` (público, capacidade, campo neutro, importância) e os dois técnicos (`managers`); a prévia e a partida ao vivo usam o mesmo número |
| `/test` | Toggles "Estádio" e "Árbitros" (árbitros + técnicos), público ajustável (0–100%), medidor de desenho (FPS e ms por quadro) |
| `/lab` | Nada (sem efeito de partida; a demanda de jogo importante não é efeito de partida) |
| Saves antigos | Sem migração (protótipo): nada novo é gravado |

## 1. Geometria: campo menor e faixa do estádio

Hoje `buildMetrics(canvasW, canvasH)` (`PixiPitch.tsx`) põe o campo (115 × 74 + 2 jardas de rede em cada fundo) no
maior tamanho que cabe. Sai para um módulo puro, `src/GraficsEngine/pitchMetrics.ts`, com um parâmetro:

```ts
buildMetrics(canvasW, canvasH, { stadium: boolean }): PitchMetrics
// stadium: scale = scaleCheio × STADIUM.PITCH_SHRINK (0,9); campo centralizado como hoje
// PitchMetrics ganha: stand: { inner: Rect; outer: Rect; thickness: { top, bottom, left, right } } | null
```

- `inner` = retângulo do campo + recuo (`STADIUM.RUNOFF_YDS` = 1,5 jarda nas laterais; nos fundos a rede + 1 jarda);
  é onde ficam bandeirinhas e técnicos. `outer` = borda do canvas. A arquibancada é `outer − inner`.
- Sem estádio, o resultado é **idêntico** ao de hoje (teste).
- O `toPixel` e o clique continuam saindo de `marginX/marginY/scale`, então efeitos, overlays de debug e clique
  acompanham sozinhos. O raio do marcador segue a escala (fica ~10% menor, ainda dentro do piso de 13 px).
- O canvas mantém o tamanho e a proporção de hoje (`fitPitch` da `MatchScreen`/`TestScreen` não muda).

## 2. Torcida (`src/GraficsEngine/crowd.ts`, puro)

```ts
interface CrowdInput {
  stand: StandGeometry;          // de PitchMetrics.stand
  fill: number;                  // 0..1, público / capacidade
  homeColor: number; awayColor: number; // 0xRRGGBB das camisas
  homeSide: "left" | "right";    // lado DESENHADO do mandante ("left" na partida ao vivo, #98)
  neutral: boolean;
  seed: string;                  // fixtureId (ou "test"): o mesmo jogo enche os mesmos lugares
}
interface CrowdSeat { x: number; y: number; color: number }   // px, centro do ponto
crowdSeats(input): CrowdSeat[]
```

- **Grade de lugares:** cada lado da arquibancada é uma grade de células de `STADIUM.SEAT_PX` (5 px; cresce se o
  total passar de `STADIUM.MAX_SEATS` = 6000, para nunca virar dezenas de milhares de pontos). Os degraus são
  fileiras paralelas ao campo, com uma faixa de concreto (`STADIUM.CONCRETE`) a cada 4 fileiras.
- **Ocupação:** um lugar está ocupado quando `hash(seed:lado:fileira:coluna) < fill`, ajustado pela fileira
  (as fileiras de baixo enchem primeiro: `limiar = fill × (1,25 − 0,5 × fileira/fileiras)`, normalizado para a
  fração total bater `fill` ±2%, teste). `fill` é limitado a 0..1.
- **Cores:** o setor visitante é um bloco contíguo do fundo **direito** (o lado do mandante desenhado é o
  esquerdo; se `homeSide === "right"`, o bloco vai para o fundo esquerdo) com `STADIUM.AWAY_SHARE` = 0,12 dos lugares
  ocupados; o resto é da casa. Cada torcedor é a cor do clube com variação de brilho determinística (±12%) e 1 em
  6 em branco/cinza (público misturado), para não virar um bloco chapado. Campo neutro: metade de cada lado do campo
  desenhado (esquerda casa, direita visitante, separados no meio das laterais).
- Cor que some no fundo escuro da arquibancada (`STADIUM.STAND_COLOR`, cinza-azulado escuro): clareada pelo mesmo
  `needsLightOutline`/contraste usado nos marcadores.
- **Desenho** (`PixiPitch`): arquibancada (retângulos dos 4 lados + faixas de concreto) e todos os pontos num
  único `Graphics`, assado em textura (`app.renderer.generateTexture({ target, resolution })`), mostrado como um
  `Sprite` abaixo das listras do campo; o `Graphics` é destruído depois de assado. Recalculado só quando
  `stadium.fill`, as cores ou o tamanho mudam (o tamanho remonta o `PixiPitch`). Nenhum custo por quadro.
- Sem animação contínua (fora do escopo). Gol: o sprite inteiro pisca levemente (alpha 1 → 0,85 → 1 em 0,6 s) só
  no gol do mandante; custo de um `alpha`.

## 3. Árbitro e bandeirinhas (`src/GraficsEngine/officials.ts`, puro)

Posições em **jardas do motor** (o espelho é aplicado no `toPixel`); passo por quadro com o `dt` do relógio dos
efeitos (tempo real, congelado na pausa) × `gameSpeed`.

**Árbitro:**
```
alvo = bola + (−sentido do ataque de quem tem a bola × 8, ±10 em y para o lado oposto à bola em relação ao centro)
       limitado ao campo (2 jardas da linha)
se o alvo ficou a < 6 jardas da bola: empurra para 6 na mesma direção
se há jogador a < 1,5 jarda do alvo: desloca o alvo 2 jardas na direção bola → alvo
passo = aproxima do alvo com velocidade máxima REF_SPEED (8 jd/s de jogo) e suavização exponencial (τ 0,6 s)
distância > 30 jardas (volta da aba oculta, troca de lado, bola parada reposicionada): pula para o alvo
```
Sem dono da bola (bola solta, no ar, chute): o sentido é o do time do `ballHolderId` (durante a bola solta ele
aponta o último a tocar, `types.ts`). Bola parada: o alvo é o ponto da bola + 10 jardas na diagonal (fora da barreira).

**Bandeirinhas:** `AR1` na lateral de cima (y = −1 jarda do motor), cobre a metade x ≥ 57,5; `AR2` na lateral de
baixo (y = 75), cobre x ≤ 57,5. O alvo em x é a linha de impedimento da metade, `computeOffsideLine` (`Offside.ts`)
com o time que ataca para aquela metade, limitado à metade; velocidade máxima 9 jd/s, sem suavização extra.
Ficam fora do campo, na faixa de recuo (não sobre a arquibancada).

**Sinais (efeitos curtos, mesma fila e regra de aba oculta dos efeitos de campo):**
- `offsideCalled` → o bandeirinha da metade de `lineX` (ou da posição do receptor) levanta a bandeira 2 s
  (`EFFECT_DURATION.offside`).
- `card` → o árbitro corre para o local da falta (alvo travado por 1,5 s no último `foul`) e mostra o cartão
  (amarelo/vermelho) acima da cabeça por 2 s, junto do efeito de cartão que já existe no jogador.

**Desenho:** árbitro = marcador menor (0,75 × raio do jogador), preto com borda clara; bandeirinhas 0,6 ×, com a
bandeira (retângulo vermelho/amarelo) abaixada ao lado e erguida no sinal. O árbitro fica na camada dos jogadores
com `zIndex` logo abaixo deles (um jogador nunca é coberto pelo árbitro); os bandeirinhas ficam fora do campo.

## 4. Técnicos (`src/GraficsEngine/coaches.ts`, puro + desenho)

- Posição em **px desenhados** (não trocam na virada de lado, como os bancos de verdade): lateral de baixo, na
  faixa de recuo, em x = 40% e 60% da largura do campo desenhado; o técnico do lado desenhado à esquerda fica em 40%.
  Na partida ao vivo o mandante é o da esquerda (#98); no `/test`, o time A.
- Rosto: `managerFaceUrl` (`src/Domain/faces/faceUrl.ts`) do técnico do jogador e do técnico da IA, rasterizado
  por `loadFaceCanvas` (`playerFaces.ts`, o mesmo cache por URL dos jogadores) — o `facesjs` continua só no
  servidor. Sem URL (`/test`) ou falha: silhueta (círculo na cor do clube + tronco). Corpo: retângulo arredondado
  escuro (terno) com gola na cor do clube.
- **Gestos** (`coachGesture(kind, t)` puro → deslocamento e ângulo dos braços, duração 1,2 s):
  - `attack` (mentalidade ofensiva): braços para a frente, mão apontando para o ataque;
  - `defend` (defensiva): braços abaixando duas vezes (calma, recua);
  - `balanced`: braços abertos uma vez;
  - `celebrate` (gol do próprio time): pulo curto e braços para cima.
  O pedido de gesto da mentalidade entra por prop (`coachCue: { team, kind, seq }`, `seq` cresce a cada mudança);
  o de gol vem do `goalScored`. Mesma fila de efeitos (sem fila com a aba oculta).

## 5. Animações curtas de jogadores (`src/GraficsEngine/playerAnims.ts`, puro)

Lista de animações por id de jogador `{ kind, startedAt, duration, dir }` no relógio dos efeitos; o desenho soma
um deslocamento ao marcador já interpolado (`renderInterp`), sem mexer na posição do motor.

| Animação | Gatilho | Duração | Desenho |
|---|---|---|---|
| `longShot` | `shot` com o chutador a ≥ 20 jardas do centro do gol | 0,45 s | marcador recua 0,4 jarda e avança 0,6 jarda na direção do chute (balanço), escala 1 → 1,15 → 1, três "linhas de força" atrás |
| `header` | `header` | 0,5 s | sobe (lift em px como a bola, pico 1,5 jarda × `BALL.LIFT_PX_PER_YD`), sombra encolhe |
| `save` | `shotResolved` com `inPosts && !isGoal` (o goleiro do time que defende) | 0,6 s | mergulho: deslocamento até 1,5 jarda na direção do `toY` do chute e rotação até 70° para o lado do mergulho, volta no fim |

`animOffset(anim, now)` → `{ dx, dy, liftPx, scale, rotation }`, curvas `sin(π·p)`. Uma animação nova do mesmo
jogador substitui a anterior. O pênalti em jogo (`penaltyResolved` com `!scored` e `keeperId`) também dispara a defesa (para o lado sorteado pela
semente do lance).

## 6. Público em jogos importantes

### Regra (`src/Domain/facilities/matchImportance.ts`, puro, arquivo novo)

```ts
export const MATCH_IMPORTANCE = { DERBY: 1.2, CUP_KNOCKOUT: 1.15, CONTINENTAL_KNOCKOUT: 1.25, MAX: 1.3 } as const;
export function matchImportanceMult(m: { derby: boolean; competition: "league" | "cup" | "continental"; knockout: boolean }): number
// produto dos fatores que valem, limitado a MAX; liga comum = 1
```
"Mata-mata" = `fixture.knockout` (toda copa nacional; continental a partir das oitavas). Fase de grupos não conta.

### Encaixe na demanda (mudança mínima em `facilities.ts`)

- `DemandInput` ganha **um** campo opcional `importance?: number` (ausente = 1) e `demandOf` multiplica por ele
  (um fator a mais no produto, nada reescrito). `HomeGameToday` ganha `importance?: number`, repassado por
  `facilitiesMatchday` para o `attendanceOf` daquele jogo.
- Público = min(capacidade, demanda): onde a demanda já passa da capacidade, nada muda; a calibração "instalações
  padrão = bilheteria antiga" continua valendo para jogos comuns (teste existente intocado + teste novo com 1,2).

### Onde é calculada (`src/backend/matchImportance.ts`, E/S, arquivo novo)

`homeMatchImportance(service, saveId, fixture, clubId, opts?)` lê o clube e o adversário (`venue.city`), a tabela
da liga quando é jogo de liga (líder com jogos e diferente do próprio clube, como em `boardWorld.ts`) e devolve
`{ derby, mult }`. Usada em:
- `advanceDay.ts`: ao empilhar `playerHomeFixturesToday` (antes dos jogos do dia, mesma tabela que a diretoria vê);
- `POST /api/match-setup`: para o `crowd` da partida;
- `GET /api/saves/:id/facilities`: `importanceByFixture: Record<fixtureId, number>` dos próximos jogos em casa da
  temporada (o gráfico); o "líder" usado para jogos futuros é o líder de hoje (aproximação, só previsão).

### Medição (obrigatória)

`bun scripts/match-importance-measure.ts` (Tarefa 12): para cada clube da `premier_league`, `brazil_serie_a` e
`of_championship`, uma temporada de jogos em casa (19 da liga por par único de adversários, clássicos por cidade
dos dados, mais 1 jogo contra o líder, 1,5 de copa em mata-mata, torcida 60) com e sem a importância; imprime a
variação da bilheteria da temporada (mediana, p90, máximo). Esperado pequeno (+1% a +4% na mediana; clubes de
cidade com rival e estádio sobrando, mais). Registrado em `facilities.md` e no fim desta spec.

## 7. Público na partida ao vivo

`POST /api/match-setup` (com `saveId`) ganha:

```ts
crowd: {
  attendance: number;     // arredondado
  capacity: number;
  neutral: boolean;
  importance: number;     // multiplicador aplicado (1 sem jogo importante)
  known: boolean;         // false: sem dado (a tela usa a ocupação padrão)
}
managers: {
  mine: { id: string; face?: ManagerFace | null; nationality: string | null };
  opponent: { id: string; nationality: string | null } | null;
}
```

- Jogo em casa do jogador com instalações: `attendanceOf` com a fração da temporada, a data e a importância — o
  mesmo número que a bilheteria do dia vai cobrar.
- Fora de casa: o mandante é da IA → `venue.capacity × GATE.FILL_RATE` (a regra da IA, sem importância).
- Campo neutro: `known: false` (a tela usa 0,65 e divide a torcida).
- Técnicos: o do jogador = `meta.manager` (face e nacionalidade, como em `managerRoutes.ts`); o da IA = o registro
  de `managers.json` do clube adversário (`id`, nacionalidade do país do primeiro clube, como na rota de técnicos).
- A prévia (`MatchPreviewScreen`) passa a mostrar `crowd.attendance / crowd.capacity` quando a resposta tem
  `crowd.known` e é jogo em casa (hoje ela recalcula pelo `useFacilities`; o cálculo do lado do cliente sai daqui).
- `MatchScreen` passa a `PixiPitch` a prop `stadium = { fill, homeColor, awayColor, neutral, seed }` e
  `coaches = { left, right }` (URL do rosto e cor, já no lado desenhado), e `coachCue` a cada mudança de mentalidade.

## 8. `PixiPitch`: props novas e camadas

```ts
stadium?: { fill: number; homeTeam: TeamId; neutral: boolean; seed: string } | null;  // null/ausente: sem faixa
officials?: boolean;                  // árbitro + bandeirinhas + técnicos
coaches?: Partial<Record<TeamId, { faceUrl?: string; color: string }>>;
coachCue?: { team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null;
perfRef?: MutableRefObject<{ fps: number; drawMs: number } | null>;  // medidor do /test
```

Camadas (de baixo para cima): torcida (sprite) → listras → linhas → overlays de debug do chão → técnicos →
sombra/brilho → jogadores + árbitro + bandeirinhas (mesmo `world`, `zIndex` dos marcadores) → efeitos → bola →
mapa de calor de debug. Com a aba oculta nada é desenhado nem enfileirado (regra atual); ao voltar, árbitro e
bandeirinhas pulam para o alvo.

## 9. `/test` e medição de desenho

- Toggles "Estádio" e "Árbitros" (desligados por padrão para não mexer na escala dos cenários de ajuste) e, com o
  estádio ligado, um seletor de público (0, 25, 50, 75, 100%) e "Campo neutro".
- Medidor: `perfRef` preenchido a cada 30 quadros com `app.ticker.FPS` e a média do tempo do callback do ticker
  (`performance.now()` em volta dele); o `/test` mostra "FPS · ms/quadro" ao lado dos toggles.
- **Medição antes/depois** (Tarefa 1 e Tarefa 13): cenário `11v11-classic`, velocidade 1, 60 s de jogo em tempo
  real, máquina de desenvolvimento, Chrome; antes = `main`; depois = estádio + árbitros ligados. Aceite: ms por
  quadro não sobe mais que 1 ms em média e o FPS fica em 60. Registrado em `graphics-engine.md`.

## 10. Testes

- Puros: `pitchMetrics.test.ts` (sem estádio = idêntico; com estádio escala 0,9, faixa nos 4 lados, dentro do
  canvas), `crowd.test.ts` (ocupação ±2% do `fill`, determinismo pela semente, setor visitante no fundo certo e
  ~12%, neutro meio a meio, teto de lugares), `officials.test.ts` (distância mínima à bola, dentro do campo,
  velocidade máxima por passo, pulo acima de 30 jardas, bandeirinha na linha de impedimento e na sua metade,
  troca de metade na virada pela `attackDir`), `playerAnims.test.ts` / `coaches.test.ts` (curvas começam e terminam
  em zero, duração, substituição), `matchImportance.test.ts` (fatores, produto, teto, liga comum = 1),
  `facilities.test.ts` (importância ausente = idêntico; 1,2 sobe a demanda e o público fica ≤ capacidade).
- Rotas: `facilities.routes.test.ts` (`importanceByFixture`), `matchSetup.crowd.test.ts` (casa com instalações,
  fora com a regra da IA, neutro `known: false`, clássico com importância 1,2, técnicos).
- `bun run ui:audit` limpo nas telas tocadas (prévia, `/test` fica fora da auditoria como tela de debug).
- Smoke (`scripts/season-rollover-smoke.ts`, seção "Instalações"): público ≤ capacidade continua; um jogo em casa
  de mata-mata ou clássico registrado tem demanda ≥ a de um jogo comum próximo na tabela (`attendance` log).

## 11. Fora do escopo

Torcida animada (ola, cantos), som, câmera, VAR (Etapa 39), reclamação do técnico (Etapa 39), árbitro com
personalidade, quarto árbitro, placas de publicidade, efeito da torcida no resultado.

## Pontos abertos — decididos (2026-10-08)

Aceitos pelo usuário com a recomendação desta spec:

1. **Decidido — espaço para a faixa:** campo encolhido 10% (`PITCH_SHRINK = 0,9`). Se na Tarefa 8 a
   arquibancada lateral ficar fina demais para ler a ocupação (menos de ~3 fileiras), sobe para 12%
   (`PITCH_SHRINK = 0,88`), decisão registrada aqui olhando a tela.
2. **Decidido — clássico pelo líder em previsões:** o gráfico de público usa o líder de hoje para jogos futuros
   (aproximação); a bilheteria do dia e a prévia usam o líder do dia do jogo.
3. **Decidido — técnico da IA sem registro** (save sem `managers.json`): silhueta na cor do clube.
4. **Decidido — fatores de importância:** clássico ×1,20, mata-mata de copa ×1,15, mata-mata continental ×1,25,
   produto com teto ×1,30; fase de grupos continental sem aumento.
5. **Decidido — `/test`:** os toggles "Estádio" e "Árbitros" começam desligados.
