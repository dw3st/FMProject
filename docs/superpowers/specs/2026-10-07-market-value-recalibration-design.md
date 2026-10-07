# Recalibração das notas e posições pelo valor de mercado (parte 2 da #83)

Aprovado em 2026-10-07. Motivo: as notas da base nativa (Brasil A/B/C e as 5 grandes) saem distorcidas — a
recalibração atual (`scripts/openfootball/recalibrate.ts`) ordena por posição no mundo inteiro e deixa os nativos sem
par no seed com a nota antiga (ex.: Flamengo, Arrascaeta 84 no seed e 12º do clube no jogo; Johnny Góes, 19, sem
par, o melhor). E a posição natural é derivada dos atributos, então clubes sem posição detalhada ficam cheios de
zagueiros (Guarani: 12 zagueiros, nenhum lateral). Escopo: o **mundo inteiro** (83 ligas, 1273 clubes).

## Decisões

| Tema | Decisão |
|---|---|
| Fonte | Transfermarkt via `github.com/felipeall/transfermarkt-api`, rodada localmente (Python, já instalado) |
| Abrangência | Mundo inteiro |
| Nota | Ordem dentro de cada liga pelo valor de mercado ajustado por idade e linha; a liga mantém o seu conjunto de notas (força da liga inalterada) |
| Posição | A posição principal do Transfermarkt vira `naturalPosition` |
| Mercado do jogo | Constantes da fórmula de valor (`Player.valueMillions`) ajustadas para ficar parecido com o real |
| Repositório | Só dados derivados (nota-alvo, posição); nunca o valor de mercado nem a resposta bruta |

## 1. Busca e casamento

- `scripts/fetchTransfermarkt.ts`: sobe a API local (porta fixa), e para cada liga do mundo (mapa nosso slug ↔
  competição do Transfermarkt em `data_process/transfermarkt/leagueMap.json`, revisado à mão) busca os clubes e o
  elenco de cada clube: nome, id do Transfermarkt, valor de mercado, posição principal, idade/nascimento, altura,
  pé. Cache das respostas em `data_process/transfermarkt/cache/` (no `.gitignore`); uma requisição a cada ~2 s,
  rodadas seguintes só buscam o que falta. Falha alta se a forma da resposta mudar.
- **Clubes:** por nome normalizado dentro do país (mesma ideia de `scripts/espn/matchClubs.ts`: exato → solto →
  prefixo), com `data_process/transfermarkt/clubOverrides.json` (`squadId → id do clube no Transfermarkt`).
- **Jogadores:** dentro do clube, por chave de nome (`scripts/espn/normalize.ts`) e idade (diferença ≤ 1), par
  único dos dois lados; `playerOverrides.json` para exceções. Sem par ou ambíguo = sem dado.
- **Saída commitada:** `data_process/transfermarkt/derived.json` — `{ playerId: { targetOverall, naturalPosition } }`
  mais um resumo por liga (casados, cobertura). Nada de valor de mercado.

## 2. Nota

1. **Valor de nível.** Sobre todos os jogadores casados do mundo: `log(valor)` com efeito de idade (faixas de 1 ano,
   mediana relativa aos 27) e de linha principal (GK/DEF/MID/FWD, relativa ao meio-campo), estimados por medianas
   dentro de cada liga e agregados. `nível = log(valor) − efeitoIdade − efeitoLinha`.
2. **Reordenação por liga.** Em cada liga, os casados são ordenados pelo nível (desempate pelo id) e recebem o
   multiconjunto das notas atuais (`Player.computeOverallAvg`) desses mesmos jogadores, da maior para a menor.
   Média e espalhamento da liga não mudam.
3. **Atributos.** `shiftToOverall` (o mesmo da recalibração e das correções manuais) com os pesos da posição natural
   nova.
4. **Sem par.** Fica como está, salvo jovem (≤ 21) acima da mediana dos casados do próprio clube: desce a essa
   mediana.
5. **Cobertura.** Liga com menos de 40% dos jogadores casados com valor, ou com menos de 100 deles, não é reordenada (as posições do Transfermarkt ainda
   valem para os casados).
6. **Ordem na cadeia.** Novo passo `bun scripts/applyMarketRecalibration.ts` depois do `importEspn` e antes do
   `applyPlayerCorrections` (as correções manuais vencem). Lógica pura em `scripts/transfermarkt/` com testes.

## 3. Posição

Mapa fixo de posição do Transfermarkt → posição detalhada do jogo (Goalkeeper → GK, Centre-Back → CB, Left-Back →
LB, Right-Back → RB, Defensive Midfield → CDM, Central Midfield → CM, Attacking Midfield → CAM, Left/Right Midfield →
LM/RM, Left/Right Winger → LW/RW, Centre-Forward/Second Striker → ST). Grava `naturalPosition` e, quando a linha
principal (`positions[0]`) diverge, a do Transfermarkt vence (atualiza `positions[0]`). Ala (LWB/RWB) não existe no
Transfermarkt: um lateral continua podendo ser apto a ala pela regra de vizinhança.

## 4. Valor de mercado no jogo

Ajuste das constantes da fórmula de `Player.valueMillions` (peso da nota e curva de idade) por regressão sobre os
casados (nota nova × valor real), só as constantes. Mede-se o mercado da IA antes/depois (`scripts/market-sim.ts`).

## 5. Atributos de 0 a 100

Pedido do usuário (2026-10-07), na mesma etapa (o mundo é regenerado uma vez só).

- **Por dentro:** os 13 atributos passam a ser decimais com uma casa, 0,0–10,0 (`Math.round(v * 10) / 10`). Motor,
  quickSim e toda fórmula que lê atributo continuam na escala 0–10, sem mudança. Mudam os pontos que arredondam para
  inteiro: `scripts/openfootball/derive.ts`, `scripts/espn/estimate.ts` e `aging.ts`,
  `scripts/openfootball/recalibrate.ts` (`shiftToOverall` sem arredondamento estocástico; `repairRounding` em passos
  de 0,1 ou removido), `scripts/curated/corrections.ts`, base (`src/Domain/youth/youth.ts`), renascido
  (`src/Domain/retirement/retirement.ts`) e olheiro (`src/Domain/scouting/seen.ts`, faixas com uma casa;
  `scoutQuery`/`scoutSearch` com filtros em décimos).
- **Evolução** (`src/GameEngine/PlayerDevelopment.ts`): passo de 0,1 (um ponto na tela); custo do passo = 1/10 do
  custo atual (`BASE_COST/10 × (1 + v² × SCALE)`, no valor contínuo); valor arredondado a 0,1 a cada passo; a semente
  do progresso mantém a mesma folga em DP de hoje contra o declínio (não 1/10 dela); `StatLevelChange.delta` vira
  número. Meta: ritmo médio igual ao de hoje, medido em carreiras típicas (jovem, auge, veterano) antes/depois.
  `DevelopmentScreen` usa a mesma conta (sem cópia local).
- **Resumo do dia e inbox:** mudanças de atributo agrupadas por jogador e atributo no dia ("Velocidade 61 → 63").
- **Tela:** todo atributo aparece ×10, inteiro de 0 a 100 (ficha, cartão do jogador, Evolução, Olheiro com filtros
  0–100 de 1 em 1, faixas do olheiro, resumo do dia), com cor por faixa — função única em `scoreColors.ts`:

  | Faixa | Cor |
  |---|---|
  | ≤ 39 | vermelho forte |
  | 40–54 | vermelho claro |
  | 55–69 | amarelo |
  | 70–84 | verde claro |
  | ≥ 85 | verde forte |

  A nota geral (overall) mantém as cores atuais.

## 6. Verificação

- Relatório do passo: casamento por liga, ligas de fora por cobertura, top 10 antes/depois das ligas grandes
  (Flamengo: Arrascaeta, Pedro, Jorginho no topo), trocas de posição natural e contagem por posição por clube
  (Guarani). O usuário confere antes da aplicação final.
- Motor: gols e chutes em 2–3 ligas antes/depois (`scripts/ai-formation-goals.ts`), meta ±5%; se sair, ajuste
  documentado.
- quickSim × motor (`scripts/quicksim-spread.ts`), mercado da IA (`scripts/market-sim.ts`).
- `checkWorldIntegrity`, testes, start kits regenerados.

## Fora do escopo

Pé, peso, contratos reais e o resto dos dados do Transfermarkt. Data de nascimento e altura entram (issue #94):
`derived.json` guarda `birthDate`/`heightCm` e a ficha do jogador mostra os dois quando existem.
