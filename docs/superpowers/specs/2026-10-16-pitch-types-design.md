# Tipos de grama, padrão de corte e gramado desgastado — design

Aprovado em 2026-10-16. Depende das instalações vivas (Etapa 34, `.claude/rules/game/facilities.md`: item
`stadiumPitch`, `matchPitchCondition`, jardineiro) e do desenho do estádio (`.claude/rules/graphics-engine.md`).

## Objetivo

1. **Tipo de grama** com efeito fora da partida: natural, híbrida, sintética.
2. **Padrão de corte** só visual: listras, xadrez, diagonal, círculos.
3. **Gramado desgastado visível**: o campo da partida mostra a condição do gramado do dia (de nítido a "podre").

Fora de escopo: nenhuma mudança no motor nem no quickSim além do multiplicador de lesão (a sintética não deixa a
bola mais rápida). Clima/chuva no gramado, gramado da base e do CT.

## 1. Tipo de grama

| Tipo | Desgaste do gramado | Lesão (os dois times, jogo em casa) | Troca |
|---|---|---|---|
| `natural` (todos começam assim) | ×1 | ×1 | — |
| `hybrid` | ×0,6 | ×1 | obra: valor de reconstrução × 1,5 |
| `synthetic` | ×0,25 | ×1,10 sempre (multiplica o `pitchInjuryMult`) | obra: valor de reconstrução × 1,0; torcida −4 na entrega |

Constantes em `FACILITIES.TURF` (`facilityConfig.ts`): `WEAR_MULT`, `INJURY_MULT`, `COST_MULT`, `SYNTHETIC_FANS`,
`AI_SHARE`.

### Clube do jogador

- `FacilityItem.turf?: TurfType` só no `stadiumPitch` (ausente = `natural`; sem migração).
- O desgaste diário do `stadiumPitch` (`Δwear`) × `WEAR_MULT[turf]`, junto do fator do jardineiro.
- Obra nova **"Trocar grama"**: `POST .../facilities/request { kind: "turf", turf }`. Prazo = o da reconstrução
  (`REBUILD_WEEKS × tamanho(nível)`); custo = `valor(nível) × COST_MULT[turf]`; passa pelo `boardDecision` com
  parcelas mensais; ocupa a vaga de obra do estádio e o item (`itemBusy`). Na entrega: tipo novo, condição 100%,
  `condemned`/`alert` saem, inbox `facilities` / `turf_changed`; sintética: torcida −4 (`moveMeters`). 400
  `invalidRequest` para o tipo atual ou desconhecido.
- `GET .../facilities` devolve `turf`, `mowing` e a cotação de cada tipo (custo, prazo, `forecast`).

### IA

- Tipo fixo derivado do id, nada gravado: `aiTurfOf(squadId, tier)` com `seedFrom("turf:<id>")`.
  HIGH/ELITE: 50% híbrida, resto natural; LOW: 10% sintética, resto natural; MEDIUM: 15% híbrida, resto natural.
- O gramado da IA (`matchPitchCondition`, `START − DROP × fração`) usa `DROP × WEAR_MULT[tipo]`.
- Lesão: o mesmo `INJURY_MULT[tipo]` do mandante, em motor e quickSim (`pitchInjuryMult`).

### Partida

`matchPitchCondition` passa a devolver `{ condition, turf, mowing }` (campo neutro: 90, `natural`, `stripes`).
`MatchEvent.pitchCondition` continua o número; `match-setup` ganha `pitch: { condition, turf, mowing }`.

## 2. Padrão de corte (só visual)

- `MowingPattern = "stripes" | "checker" | "diagonal" | "circles"`.
- Clube do jogador: `ClubFacilities.mowing?` (ausente = `stripes`), escolhido na tela Clube (`PUT
  .../facilities/mowing { mowing }`, sem custo, sem obra, livre a qualquer hora; 400 para valor desconhecido).
- IA: `aiMowingOf(squadId)` pelo id. Campo neutro: `stripes`.

## 3. Gramado desgastado (desenho)

Faixas pela condição do dia (`pitchVisualBand`, puro):

| Condição | Desenho |
|---|---|
| 100–70 | padrão de corte nítido |
| 70–40 | padrão apagando (alfa cai linear até 0 em 40); áreas e meio amarelados |
| 40–15 | sem padrão; terra recortada nas pequenas áreas, círculo central e corredor do meio; tufos soltos |
| < 15 | fundo mais pardo; lama nas áreas e no corredor, poças, linhas tracejadas/falhando |

- Manchas irregulares alongadas de gol a gol (o desenho aprovado `desgaste-v2`): polígonos com bordas recortadas
  gerados por função pura (`pitchWear.ts`, `wearPatches(condition, seed)`), semente = id do jogo (mesmo jogo, mesmo
  campo). Intensidade contínua dentro da faixa.
- Desenho no `GraficsEngine`: fundo + corte + desgaste + linhas desenhados uma vez num `Graphics` e assados numa
  textura (`renderer.generateTexture`), como a torcida; refeito só quando muda tamanho, espelho ou o gramado. Nenhum
  custo por quadro. Espelho (#98): o padrão é simétrico e as manchas usam o `toPixel` com o espelho.
- Cores só de `pitchStyle.ts` (`PITCH_WEAR`: amarelado, terra, lama, poça). A borda clara dos jogadores
  (`needsLightOutline`) segue lendo `PITCH_COLOR`.
- Prop nova do `PixiPitch`: `pitch?: { condition, turf, mowing, seed }` (ausente = listras nítidas, como hoje).
  Sintética: verde um pouco mais claro e uniforme, sem desgaste visual abaixo de 70 (só o padrão apagando).

## 4. Telas

- **Clube:** cartão "Gramado" na área do estádio: tipo (selo), condição, padrão de corte (`OptionChips`), prévia
  pequena do campo e "Trocar grama" (cotações dos dois outros tipos com custo, prazo, previsão da diretoria).
- **Prévia da partida:** mini campo com o gramado do dia ao lado de "Gramado: N%" e o tipo.
- **Partida ao vivo:** o campo desenhado com o gramado do dia, e o texto "Grama híbrida · 62%" na linha abaixo do
  placar (junto do estádio e do público; condição em vermelho abaixo de 40).
- i18n `facilities.turf.*`, `facilities.mowing.*`, `inbox.facilities.turf_changed` (en, pt-BR).

## 5. `/test`, `/lab`, `Statistics.ts`

- `/test`: chips Turf (natural/hybrid/synthetic), Mowing (4) e o seletor Pitch existente define a condição do
  desenho; `EnergyPanel` mostra `turf · injury ×`.
- `/lab`: `Variant.turf` (o da variante A vale para o jogo), rótulo `· turf`, `TeamRawStats.turf`, linha "Turf" no
  `PairDetail` (as lesões já existem).
- `Statistics.ts`: nada novo.

## 6. Medições

- Volume de lesões do mundo (`injury-calibrate.ts --quicksim`, 26 ligas, pareado): com a distribuição da IA
  ≤ +3% sobre o mundo de hoje.
- Linha do tempo do desgaste (`facilities-wear.ts --turf`): natural / híbrida / sintética até 40%.
- Custo do desenho: bake do gramado medido no `/test` (uma vez por partida).

## 7. Testes

Puros: `WEAR_MULT`/`INJURY_MULT` aplicados, `aiTurfOf`/`aiMowingOf` determinísticos e com as parcelas,
`pitchVisualBand`, `wearPatches` determinístico e dentro do campo. Rota: obra de troca (custo, diretoria, ocupada,
entrega com 100% e torcida), `PUT mowing`. Smoke (seção "Instalações"): troca para híbrida pela rota, entrega na
corrida, desgaste menor depois.

## Limitações

- A sintética não muda a bola (decisão do usuário, por enquanto).
- O desgaste visual é ilustrativo: não marca onde o jogo realmente pisou.
- Gramado da base e do CT continuam sem tipo.
