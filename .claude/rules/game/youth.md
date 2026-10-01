# Base (categorias de base) e notas do quickSim

Spec: `docs/superpowers/specs/2026-10-01-youth-design.md`. Etapa 11 do `docs/ROADMAP.md`, versão **2.3**.
Visual: `.claude/rules/ui-standard.md`.

## Regra

- Na virada de temporada de cada país (`advanceDay`, passo 9, depois das expirações de contrato e da
  reposição do passo 8), **todo clube** recebe uma safra de 3-5 jovens de 16-17 anos, determinística por
  `save + clube + ano` (`generateIntake`).
- **Clube do jogador:** a safra vai para `Squad.youth` (fora do elenco). Na virada a base já existente
  envelhece 1 ano e treina uma temporada (`developYouthSeason`: `SESSIONS_PER_SEASON` sessões "normal" do
  mesmo modelo de DP, sem minutos de jogo, multiplicado pela nota do auxiliar); quem chega aos 19 sem
  promoção sai para os livres (inbox `youth`, `kind: "released"`).
- **Clubes da IA:** sem lista de base. `processYouthRollover` promove direto ao elenco os 1-2 melhores
  da safra (1 se o elenco já tem >= 26; 0 se está em 30; só se a folha cabe — `passesWageGate`) e descarta o
  resto (não vira livre, para não inflar o pool).
- Sem migração de save (protótipo): `Squad.youth` ausente = base vazia.

## Geração (`src/Domain/youth/`)

| Arquivo | Papel |
|---|---|
| `youthConfig.ts` | Todas as constantes (`YOUTH`) |
| `youth.ts` (+ teste) | `generateIntake`, `lineAverage`, `potentialBand`, `developYouthSeason`, `processYouthRollover` — puro, sem E/S |

- **Nível:** média da linha do próprio clube (nota média dos jogadores do mesmo papel principal) -
  1,8 + bônus de tier (LOW -0,3, MEDIUM 0, HIGH +0,2, ELITE +0,4) + bônus do auxiliar (so no clube do
  jogador, linear +-0,3 em torno da nota 5,5) + ruído gaussiano (sigma 0,5); promessa rara (5%) soma +1,0
  (arquétipo "Wonderkid"). Limitado a 1,5..8.
- **Atributos:** `statsFor` — o desvio de cada atributo vem dos `attrWeights` da posição específica em
  `roles.json`, um deslocamento único achado por bisseção até o `weightedScore` bater o nível-alvo, depois
  arredondamento determinístico sem viés (`floor(v + hash)`); atributo que a posição não usa fica <= 2.
- **Posição:** sorteada entre as posições específicas do papel principal; o papel é o mais carente em
  relação aos mínimos por linha (`MIN_BY_ROLE`) contando elenco + base, senão sorteio ponderado
  (GK 1, DEF 4, MID 4, FWD 3).
- **Nome:** inicial e sobrenome tirados do próprio elenco do clube (mesma ideia de `makeYouthPlayer`);
  nacionalidade = país do clube. Contrato de 3 anos (`renewalContract`), salário da curva pela nota.
- **Potencial (só exibição):** `potentialBand` = nota atual + crescimento esperado por idade até os 23
  (`GROWTH_BY_AGE`) x [0,6; 1,2]. Não existe atributo escondido novo.
- Crescimento medido: um jovem de nota 4,6 chega a ~5,8 em três temporadas de base (+0,4 a +0,5 por ano).

## Rotas (`src/backend/youthRoutes.ts`)

Todas com `requireSaveOwner` + `withSaveLock`:

- `GET /api/saves/:id/youth` -> `{ youth: [{ player, overall, potential: { low, high } }], squadSize, squadLimit }`.
- `POST .../youth/:playerId/promote` -> move para `players` (400 `squadFull` em 30; salário recalculado pela
  curva com o fator do clube, `until` do contrato original).
- `POST .../youth/:playerId/release` -> sai da base e entra em `freeAgents.json` (`toFreeAgent`).

## Inbox `youth`

`YouthInboxMessage`: `kind: "intake"` (`year`, `count`, `best`: destaque da safra) e `kind: "released"`
(`players`). Enfileirada em `deferredYouthMessages` e gravada depois do `clearInbox` da virada, como as
mensagens de contrato.

## Tela

Aba **Base** (`Components/YouthTable.tsx`) em `SquadScreen`, só no clube do jogador, ao lado de "Elenco":
posição (cor de `getDetailedPositionColor`), idade, nível, faixa de potencial, **Promover** (desabilitado com
o elenco cheio) e **Dispensar** (com confirmação). Vazia antes da primeira virada.

## #9 — cauda de notas do quickSim

O titular do quickSim carrega os gols e assistências da vaga inteira (não há reservas), então a cauda de
notas altas de FWD ficava maior que a do motor. Correção: a nota bruta é encolhida em direção ao centro da
linha antes do clamp (`ratingFromStats(s, tf, group)`), que estreita as duas caudas e mantém a média:

```
nota = centro + (bruta − centro) × RATING_SHRINK[linha]      // QuickSimConfig.ts
RATING_SHRINK        = GK 1, DEF 0,90, MID 0,94, FWD 0,92
RATING_SHRINK_CENTER = GK 6,04, DEF 6,14, MID 6,22, FWD 6,70
```

Medido com `bun scripts/quicksim-spread.ts collect <liga> 200 2 <dir>/<liga>.json` (premier_league,
bundesliga, of_championship, 400 jogos cada, motor atual) e `events <dir> --quick 20` (a seção 2 agora
imprime o ≥ 8,5 % por linha):

| Linha | ≥ 8,5 % motor | quick antes | razão antes | quick depois | razão depois |
|---|---|---|---|---|---|
| DEF | 0,03 | 0,07 | 2,23 | 0,02 | 0,68 |
| MID | 0,25 | 0,29 | 1,14 | 0,21 | 0,82 |
| FWD | 6,09 | 7,68 | 1,26 | 6,62 | 1,09 |

Nota média dos titulares por linha (motor | quick antes → depois): GK 6,047 | 6,038 → 6,038; DEF
6,131 | 6,145 → 6,155; MID 6,221 | 6,220 → 6,227; FWD 6,638 | 6,699 → 6,715. Nenhuma média andou mais de
0,016 (meta: ±0,03). FWD segue ~0,07 acima do motor, como já estava.

## `/test`, `/lab`

Sem efeito de partida: nada a exibir em `/test` nem em `/lab`.

## Testes e smoke

```
bun test src/Domain/youth src/backend/youth.routes.test.ts src/Domain/advanceDay/quickSim.test.ts
```

`bun scripts/season-rollover-smoke.ts`, seção "Base": o clube do jogador termina com 3-5 jovens de 16-17 com
contrato e nenhum deles entrou sozinho no elenco; >= 85% dos clubes da IA das ligas viradas promoveram um
jovem; nenhum clube da IA guarda `youth` ou passa de 30; ids de jogador únicos no mundo; a inbox tem a
mensagem de safra.

Ultima rodada (2026-10-01): todas as checagens passaram; 77 de 83 clubes da IA das ligas viradas (93%) promoveram um jovem, o clube do jogador terminou com 5 na base.

## Decisões registradas (revisão 2.3)

- **Base não custa salário:** o contrato de base (3 anos) existe só para dar a data e o valor de
  referência; os jovens em `squad.youth` não entram na folha, no extrato nem no `wageBill`. Ao promover,
  o salário é recalculado pela curva do clube e passa a ser pago; a data de fim do contrato de base é
  mantida.
- **Carreira nova começa com a base vazia;** a primeira safra chega na primeira virada do país.
- Promover um jovem sem contrato (não deveria existir) devolve 409 `noContract` em vez de quebrar.
