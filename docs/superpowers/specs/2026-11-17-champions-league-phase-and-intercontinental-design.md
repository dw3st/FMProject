# Champions e Liga Europa no formato novo, e Copa Intercontinental

Pedido do usuário (2026-11-17). Decisões já tomadas: Champions **e** Liga Europa mudam; Libertadores e Sul-Americana
continuam com grupos; o Mundial é a **Copa Intercontinental anual** (não o de 32 clubes). Duas etapas, nesta ordem.

## Etapa 1: fase de liga (Champions e Liga Europa)

### Regra

- **36 clubes** em cada uma (hoje 32). As vagas por país (`allocateSlots`) passam a fechar em 36; o resto da regra
  (zonas fixas das 5 grandes, coeficiente, um clube nunca nas duas) não muda.
- **Sorteio da fase de liga:** 4 potes de 9 pela força (`level`), como hoje. Cada clube pega **2 adversários de cada pote**
  (um em casa, um fora), 8 jogos no total, 4 em casa e 4 fora. Nunca um adversário do mesmo país, e no máximo 2 do mesmo
  país estrangeiro (a regra real). Determinístico pela semente da temporada.
  - Entre dois potes diferentes, cada clube joga uma vez em casa e uma fora contra o outro pote: duas permutações sem
    choque de país. Dentro do mesmo pote, um ciclo que passa por todos os 9 (cada um recebe um e visita outro).
  - Busca com retrocesso orçada, como o sorteio dos grupos de hoje; sem solução perfeita, aceita a de menos choques.
- **Calendário da fase:** os 144 jogos divididos em 8 rodadas, cada clube uma vez por rodada, sem 3 jogos seguidos em
  casa ou fora. É uma coloração de arestas de um grafo 8-regular (sorteio guloso com trocas de cadeia até fechar).
- **Tabela única** de 36: pontos, saldo, gols pró, gols fora, vitórias, vitórias fora, id.
  - **1º a 8º:** direto para as oitavas.
  - **9º a 24º:** playoff de ida e volta. 9º/10º contra 23º/24º, 11º/12º contra 21º/22º, e assim por diante; o mais bem
    colocado faz a volta em casa.
  - **25º a 36º:** eliminados (não descem para a Liga Europa, como na vida real).
- **Mata-mata em chave fixa** (a regra real desde 2024): o 1º e o 2º caem do lado oposto ao 3º e 4º, etc. As oitavas,
  quartas e semis não são sorteadas: saem da chave pela posição. Final em campo neutro, jogo único, como hoje.
- **Datas:** 17 (8 da fase de liga, 2 do playoff, 2 das oitavas, 2 das quartas, 2 da semi, final). Fase de liga de
  15/09 a 31/01, mata-mata de 10/02 ao fim de maio. Champions na terça, Liga Europa na quinta. Mesmo otimizador de datas
  de hoje.

### O que muda em volta (todos os pontos que leem "grupos")

| Onde | Mudança |
|---|---|
| Tipos (`calendarTypes.ts`) | `ContinentalStageName` ganha `league` e `playoff`; `ContinentalMetaData.format: "league" \| "groups"`; na fase de liga, `pots` no lugar de `groups` |
| `continentalProgress.ts` | fim da fase de liga → tabela → playoff; volta do playoff → oitavas pela chave |
| Prêmios | participação e vitória/empate por jogo como hoje; o playoff paga a fase "oitavas" a quem passa, como hoje paga sair dos grupos |
| Inscrição | o prazo "antes do 1º jogo de grupo / entre os grupos e as oitavas" vira "antes da fase de liga / entre a fase de liga e o playoff" |
| Diretoria, imprensa, classificação dos amigos | "caiu na fase de grupos" vira "caiu na fase de liga"; "passou dos grupos" vira "passou da fase de liga" (top 24) |
| Tela (aba Continental) | tabela única de 36 com as faixas (verde até 8, azul até 24), jogos por rodada, chave do mata-mata; prévia "Fase de liga · rodada N"; caixa de entrada com a posição final |
| `/test`, `/lab` | sem efeito de partida (só formato de competição): nada novo |
| Smoke | 36 clubes, 8 jogos cada, 4 em casa, nenhum par do mesmo país, tabela batendo com os jogos, chave coerente |

### Mundos em andamento

A temporada continental que já está rolando (inclusive a do mundo dos amigos) termina no formato de grupos; o formato
novo entra na próxima regeneração continental da Europa (fim de maio). O código lê `format` ausente como `groups`. Os
start kits são regenerados para as carreiras novas já nascerem no formato novo.

## Etapa 2: Copa Intercontinental (anual)

O torneio real da FIFA desde 2024, com os campeões das confederações.

- **6 clubes:** campeão da Champions, da Libertadores e, nas confederações sem competição continental no jogo
  (Ásia, África, América do Norte e Central, Oceania), o campeão da liga de nível 1 mais forte da confederação na última
  temporada fechada (força pelo coeficiente, o mesmo das vagas continentais).
- **Chave real (jogo único, campo neutro, prorrogação e pênaltis):**
  1. Oceania contra Ásia.
  2. O vencedor contra a África (Copa África–Ásia–Pacífico).
  3. América do Norte e Central contra o campeão da Libertadores (Dérbi das Américas).
  4. Os vencedores de 2 e 3 (Copa Challenger).
  5. Final contra o campeão da Champions.
- **Datas:** dezembro, quartas e sábados (por exemplo 9, 12, 16 e 19/12; ajustadas ao calendário do ano), sempre depois
  da final da Libertadores. O jogo de liga de um participante que cair colado é remarcado pela regra de sempre.
- **Pasta própria** `leagues/icc` (mesmo formato de uma copa), gerada no começo de dezembro com os campeões que já
  existirem; sem campeão de alguma confederação, a vaga vai para o vice ou fica com bye.
- **Efeitos:** título no histórico do clube e dos jogadores, pontos de técnico (como um título continental), prêmio em
  dinheiro modesto, notícia, caixa de entrada para quem joga. Motor completo se um clube humano joga; senão quickSim.
- **Tela:** aba "Intercontinental" em Ligas, com a chave e o campeão de cada ano.

## Testes

Puros: sorteio da fase de liga (8 jogos, 2 por pote, 4 em casa, restrições de país, determinismo, sempre fecha),
calendário (uma partida por rodada, sem 3 seguidas), tabela, playoff e chave fixa, datas (17, sem choque no mesmo dia).
Rotas e avanço do dia como os testes continentais de hoje. Smoke de temporada com as checagens acima e uma Intercontinental
jogada.

## Limitações conhecidas

- A força dos campeões de Ásia, África, América do Norte e Oceania vem só do campeão da liga mais forte de cada uma: não
  existe Liga dos Campeões da Ásia nem da África no jogo.
- Sem coeficiente histórico: os potes continuam pela força do elenco do ano.
