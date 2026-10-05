# Etapa 28 — Olheiros de verdade — Design

Data: 2026-10-05. Status: **em aprovação**. Versão **4.3**. Regra a criar na implementação:
`.claude/rules/game/scouting.md` (e atualizar `staff.md`, `youth.md`, `finances.md`, `openfootball-import.md` →
"Olheiros").

## Regra geral

- Hoje o olheiro-chefe dá a **mesma** incerteza (±0..1,5) a todo jogador de fora do elenco (`obscurePlayer`,
  `staff.md`). Passa a valer o **conhecimento por jogador** (0..100): quanto mais o clube observou um jogador,
  menor a incerteza; com 100 ele é visto exato. O olheiro-chefe deixa de zerar a incerteza do mundo inteiro e passa
  a multiplicar a incerteza e a velocidade com que o conhecimento cresce.
- O conhecimento cresce com **missões** (país, liga, região/continente, jogador específico, jovens de um país),
  com jogos contra o próprio clube e com passagens pelo próprio elenco; cai devagar sem observação.
- **Só o clube do jogador** simula olheiros. A IA não grava nada e continua lendo valores exatos (mercado,
  `findCandidates`, propostas): regras, não simulação (`.claude/rules/AI-clubs/finance.md`).
- O motor, o avanço do dia e toda decisão da IA **nunca** leem valores com incerteza (como hoje): ela só existe nas
  respostas de tela.
- Sem migração (protótipo): `scouting.json` ausente = nada observado, só o conhecimento implícito.
- `/test`, `/lab`: sem efeito de partida, nada a exibir.

## 1. Conhecimento e incerteza

### Conhecimento efetivo de um jogador (`knowledgeOf`)

```
k = max(implícito, guardado decaído)            // 0..100; próprio elenco e emprestados a ele = 100
implícito  = liga do clube do jogador 35 · outra liga do mesmo país 20 · resto 0
           + 25 se estrela dourada (top 25 do mundo, `computeStars`) ou top 100 por overall (fama pública)
           limitado a 60
guardado decaído = k_guardado − DECAY × max(0, dias desde a última observação − 90) / 30   // DECAY 5
```

O decaimento é **calculado na leitura** (puro, pela data), sem passada diária no mundo.

### Incerteza (`uncertaintyOf`)

```
ruído(k) = MAX_NOISE (2,0) × (1 − k/100)^1,2 × multChefe       // ±pontos de um atributo 0..10
multChefe = curva da nota do olheiro-chefe [nota 1, 5, 10] = [1,3 ; 1,0 ; 0,75]   (vaga = nota 3)
```

| k | ruído (chefe nota 5) | o que a tela mostra |
|---|---|---|
| 0 | ±2,0 | posição, idade, clube, nota como faixa larga; **atributos ocultos** ("?") |
| 20 | ±1,5 | atributos como faixa (baixo–alto) |
| 35 (própria liga) | ±1,2 | idem |
| 60 | ±0,7 | atributos como faixa estreita |
| 80 | ±0,3 | número único (abaixo de `RANGE_THRESHOLD` 0,5) |
| 100 | 0 | exato |

- O sorteio continua o de hoje (`signedNoise(save:jogador:atributo)`, determinístico), só a amplitude passa a ser
  por jogador. Assim a faixa estreita converge para o valor real sem "pular".
- Atributos ocultos: `k < HIDDEN_BELOW` (20). Filtros de atributo da busca usam o valor com ruído (não vaza o real).
- O potencial (`potentialBand`, `youth.ts`) e o valor de mercado também saem como faixa, alargados pelo mesmo ruído.
- `STAFF.SCOUT_NOISE` sai; entra `STAFF.SCOUT_UNCERTAINTY_MULT` e `STAFF.SCOUT_GAIN_MULT` (§2).

## 2. Olheiros e missões

### Quem observa

- O **olheiro-chefe** (staff atual) conduz uma missão e define os multiplicadores do clube:
  ganho de conhecimento [0,7 ; 1,0 ; 1,4] e incerteza [1,3 ; 1,0 ; 0,75] (notas 1/5/10).
- **Olheiros de campo** (novos, `Squad.staff.scouts?: StaffMember[]`, até `MAX_FIELD_SCOUTS` 4): contratados no
  mercado de staff (aba nova "Olheiros", 5 candidatos por semana, notas 2..9, mesmo salário do staff),
  demitíveis. Cada um conduz uma missão. O ganho de cada missão usa a nota de quem a conduz × o mult do chefe.
- Missões simultâneas = 1 (chefe) + olheiros de campo. Sem chefe (vaga), o chefe vale nota 3 e ainda conduz uma.

### Tipos de missão (`ScoutAssignment`)

| Alvo | Duração | Pool observado |
|---|---|---|
| `country` | 4 / 8 / 12 semanas | ligas do país (todos os níveis) |
| `league` | 4 / 8 / 12 semanas | uma liga |
| `continent` | 8 / 12 semanas | ligas de nível 1 do continente |
| `player` | até chegar a 100 ou 3 semanas | um jogador |
| `youth` | 4 / 8 semanas | jovens de um país (≤ 19 nos elencos + prospectos sem clube, §4) |

Foco opcional em missões de região: linha (GK/DEF/MID/FWD ou posição detalhada), idade máxima, nível mínimo
("só quem melhora o elenco": nota ≥ média da linha do clube − 0,3).

### Progresso (puro, `advanceScoutingWeek`, toda segunda-feira)

```
região:  observados = 6 + nota do olheiro (≤ 16), sorteados no pool pelo foco, peso maior a quem ainda tem k baixo
         cada observado: k += 30 × ganhoNota × ganhoChefe (teto 100), seen = hoje
jogador: k += 35 × ganhoNota × ganhoChefe por semana; acaba ao chegar a 100
ganhoNota = curva [0,6 ; 1,0 ; 1,4] pela nota de quem conduz
```

- Sorteio determinístico: `seedFrom(save:missão:segunda)`.
- **Jogos contra o próprio clube:** todo adversário que entrou em campo ganha +8 (dado já disponível no pós-jogo).
- **Passagem pelo elenco:** quem sai do clube do jogador (venda, empréstimo, livre) fica com k 100 guardado
  (decai normalmente).
- Mudar o alvo de uma missão = cancelar (o já gasto não volta) e criar outra.

### Relatórios (`ScoutReport`)

Ao fim de cada semana de missão, os até 5 melhores observados viram relatório (`grade` A–E):

```
nota relativa = (nota vista − média do titular da linha no clube) + 0,5 × (potencial alto visto − nota vista se ≤ 23)
A ≥ +0,8 · B ≥ +0,3 · C ≥ −0,2 · D ≥ −0,7 · E resto
```

Campos: jogador, clube, liga, idade, posição natural, k, faixas de nota/potencial/valor, salário pedido estimado,
contrato até, está à venda, grade, "joia" (§3), texto curto por chave i18n ("pronto para o time titular",
"para o futuro", "não melhora o elenco"). Guardados os últimos `MAX_REPORTS` (60), mais novos primeiro.

## 3. Joias e recomendações

- **Joia:** idade ≤ 20, de fora do país do clube (ou qualquer país em missão `youth`), potencial alto visto ≥
  média do titular da linha + 0,3. Marcada no relatório e mensagem na inbox (`gem`), no máximo 2 por semana.
- **Recomendação do chefe (passiva):** no dia 1 de cada mês, mesmo sem missão, o chefe indica até 3 jogadores
  (joias primeiro, depois grade A) entre os já conhecidos (k ≥ 20) ou do pool implícito; inbox
  `recommendation`. Sem nenhum conhecido, nada.

## 4. Jovens de outros países na base

- Uma missão `youth` num país gera, por semana, 0–2 **prospectos sem clube** (16–17 anos) no relatório, com
  `generateIntake` reaproveitado: nível ancorado na média de nível 1 do país − 1,8, determinístico por
  `save:país:semana`, nacionalidade do país, nomes do país. Ficam em `scouting.prospects` por 30 dias.
- **Contratar para a base** (`POST .../prospects/:id/sign`): entra em `squad.youth` (limite `YOUTH.MAX_SIZE` 18,
  400 `youthFull`), contrato de base de 3 anos (sem salário enquanto na base, como hoje), **compensação de formação**
  no extrato: `PROSPECT_FEE[tier da liga de nível 1 do país]` × fator de salário do próprio clube
  (≈ €50k LOW … €400k ELITE). Inbox `prospect_signed`.
- Jovens de 16–17 já em elencos da IA continuam pelo mercado normal (negociação da Etapa 21); o relatório só
  recomenda.

## 5. Lista de observação (shortlist)

- Até `MAX_SHORTLIST` (50) jogadores, com nota opcional. Botão "Observar" (estrela) na ficha, na busca e no
  relatório; aba própria na tela do Olheiro.
- Toda segunda, para cada observado (lendo só o elenco onde ele está, `squadId` guardado; se sumiu, procura nos
  livres e aposentados, e por fim no índice da busca): inbox `shortlist` quando entra na lista de venda ou de
  empréstimo, entra nos últimos 6 meses de contrato, fica livre, muda de clube ou se aposenta (sai da lista).
- Estar na lista dá +3 de conhecimento por semana (acompanhamento à distância), sem custo.

## 6. Dinheiro

- Salário dos olheiros de campo: linha `staff` do extrato (como o resto do staff).
- Viagens: linha nova `kind: "scouting"` toda segunda, por missão ativa:
  `custo = SCOUT_TRAVEL_SHARE[distância] × receita anual / 52` — mesmo país 0,04%, mesmo continente 0,08%,
  outro continente 0,15% (missão de jogador: metade). Exemplo: receita €200M, missão em outro continente ≈
  €5,8k/semana. `ledgerText`: `scoutingTravel` (com `ref.competition` = país/liga).
- Saldo negativo não bloqueia missão (só o aviso, como o resto); a diretoria não interfere nesta etapa.

## 7. Dados

`saves/{id}/scouting.json` (DAL `readScouting`/`writeScouting`, bufferizado como `freeAgents`; versão de
dados incrementada a cada gravação para o cache da busca):

```ts
interface ScoutingState {
  missions:   ScoutAssignment[];      // { id, scoutId, target, focus?, start, end }
  knowledge:  Record<string, { k: number; seen: string }>;   // só acima do implícito; podado
  shortlist:  { playerId; squadId; addedOn; note? }[];
  reports:    ScoutReport[];
  prospects:  { player: RosterPlayer; country; expires; reportId }[];
}
```

- `knowledge` é esparso: entradas que decaíram até o implícito saem; teto `MAX_KNOWLEDGE` 6000 (poda as mais
  antigas). Tamanho esperado < 300 KB.
- Troca de clube (`acceptJobOffer`): missões canceladas, olheiros de campo e prospectos ficam com o clube antigo
  (somem), conhecimento e lista **ficam com o técnico** (decisão aberta 2). Demissão: idem; desempregado não
  pode criar missões (409 `noClub`), mas vê relatórios e lista.
- Aposentado sai de `knowledge` e da lista.

## 8. Arquivos (novos e mexidos)

| Arquivo | Papel |
|---|---|
| `src/types/scoutingTypes.ts` | Tipos acima |
| `src/Domain/scouting/scoutingConfig.ts` | Todas as constantes (`SCOUTING`) |
| `src/Domain/scouting/knowledge.ts` (+ teste) | `implicitKnowledge`, `knowledgeOf`, `decayed`, `uncertaintyOf`, `pruneKnowledge` |
| `src/Domain/scouting/missions.ts` (+ teste) | `missionPool` (pura, recebe os elencos), `advanceScoutingWeek`, `missionCost`, `gradeReport`, `isGem`, `monthlyRecommendations`, `shortlistAlerts`, `generateProspects` |
| `src/Domain/staff/staff.ts` | `obscurePlayer(player, noise, saveId)` intacta; `scoutMultipliers` substitui `scoutNoise`; `obscureForViewer(player, k, mults, saveId)` com ocultação de atributos |
| `src/Domain/scout/displayPlayer.ts` | `DisplayPlayer.knowledge?`, `hiddenAttrs?`, `valueRange?`, `potentialRange?` |
| `src/backend/scoutingWorld.ts` | E/S: passo da segunda no `advanceDay` (missões, lista, custos, inbox), +8 pós-jogo, `viewerContext(saveId)` (k e mults para as rotas) |
| `src/backend/scoutingRoutes.ts` | Rotas (§9) |
| `src/backend/scoutSearch.ts` | Ruído por jogador; chave do cache ganha a versão do `scouting.json` |
| `src/backend/routes.ts` (`?scouted=1`), `PlayerScreen` | Ficha com conhecimento por jogador |
| `src/backend/staffRoutes.ts` | Mercado e contratação de olheiros de campo |
| `src/backend/advanceDay.ts` | Chama o passo de olheiros (segunda e dia 1), mensagens depois do `clearInbox` |
| `src/backend/jobWorld.ts` | Troca de clube (§7) |

**Desempenho (mundo de ~36 mil jogadores):** a busca já monta o índice inteiro uma vez por dia/versão; trocar
o ruído uniforme por um ruído por jogador custa uma consulta a um `Map` por jogador (o `knowledge` é esparso) e o
mesmo número de `signedNoise`. O implícito precisa só da liga (já no elenco) e de um conjunto de ids famosos
(calculado uma vez no build do índice, mesma ordenação de `computeStars`). Meta: build do índice ≤ 1,2× o atual
(medir no smoke). As missões só leem elencos na segunda-feira: as ligas do alvo pelo índice de squads (um país
grande ≈ 80–100 elencos; continente = só nível 1), uma vez por missão por semana, dentro do `BufferingSaveDAL` do
dia. A lista de observação lê só os elencos dos observados.

## 9. Rotas (`requireSaveOwner`; escrita com `withSaveLock`; sem clube → 409 `noClub`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/scouting` | Missões (com progresso, custo semanal), olheiros livres, relatórios, lista, prospectos |
| `POST /api/saves/:id/scouting/missions { scoutId, target, focus?, weeks }` | Cria; 400 `invalidTarget`/`invalidWeeks`, 409 `scoutBusy` |
| `DELETE /api/saves/:id/scouting/missions/:missionId` | Cancela |
| `POST /api/saves/:id/scouting/shortlist { playerId, note? }` / `DELETE .../shortlist/:playerId` | Lista; 409 `shortlistFull` |
| `POST /api/saves/:id/scouting/prospects/:prospectId/sign` | Base; 400 `youthFull`, 409 `offerClosed` (vencido) |
| `GET/POST /api/saves/:id/staff/scouts/market`, `.../scouts/hire`, `.../scouts/fire` | Olheiros de campo |
| `POST /api/saves/:id/scout-search` | Igual; linhas com `knowledge`, `hiddenAttrs`, faixas; filtros novos `onlyShortlist`, `minKnowledge` |

## 10. Telas (`ui-standard.md`; nada novo na barra superior)

- **Olheiro** (`ScoutScreen`, título "CENTRAL DE **OLHEIROS**" / "SCOUTING **CENTRE**"): `SegmentedTabs` **Busca |
  Missões | Relatórios | Observados | Joias**.
  - Busca: a de hoje + coluna "Conhecimento" (barra 64px com número), "?" nos atributos ocultos, faixa no valor;
    chips "Só observados", "Conhecidos (≥ 60)".
  - Missões: cartões por olheiro (nome, nota, missão atual com barra de semanas, custo/semana, Cancelar); "Nova
    missão" abre um modal (alvo: país pelo mapa/lista do novo jogo reaproveitado, liga, continente; duração em
    `OptionChips` 4/8/12; foco em chips).
  - Relatórios: tabela padrão (`TABLE_STYLE`) com grade como badge, joia com selo, filtro por missão.
  - Observados: tabela com status (à venda, contrato, lesão) e nota pessoal.
  - Joias: relatórios com joia + prospectos com "Contratar para a base" (custo e prazo de validade).
- **Ficha do jogador** (fora do próprio clube): bloco "Conhecimento" (barra, "observado em …", último relatório
  e grade), atributos como faixa/"?", botões "Observar" (missão de jogador) e estrela da lista.
- **Negociação** (`PlayerOfferModal`): nota, potencial e valor como faixa; aviso "Conhecimento baixo (k): os
  atributos podem estar errados" abaixo de 60. O pedido de salário (`/demand`) segue o valor real (limitação).
- **Equipe técnica:** aba "Olheiros" no mercado e cartões dos olheiros de campo.
- **Painel:** cartão Atenção ganha "Joia encontrada" e alertas da lista (7 dias).
- i18n `scouting.*`, `inbox.scouting.*`, `staff.scouts.*`, `financesScreen.ledgerText.scoutingTravel`,
  `screenTitles.scout.*` (en, pt-BR).

## 11. Inbox `scouting`

`ScoutingInboxMessage` (`kind`): `report` (resumo semanal de uma missão: n observados, melhores grades),
`mission_done`, `gem`, `recommendation`, `shortlist` (com `reason`: `for_sale` · `loan_listed` · `contract_ending`
· `free` · `transferred` · `retired`), `prospect`, `prospect_signed`. Enfileiradas e gravadas depois do
`clearInbox` da virada. Ícone `binoculars` (adicionar em `Icons.tsx`).

## 12. Testes e smoke

```
bun test src/Domain/scouting src/Domain/staff src/Domain/scout src/backend/scouting.routes.test.ts \
  src/backend/scoutSearch.test.ts
```

- Puros: implícito por liga/país/fama; decaimento (nada antes de 90 dias, piso no implícito); ruído monotônico em
  k, 0 em 100, ocultação abaixo de 20; determinismo do sorteio de missão; ganho pela nota; grade; joia;
  prospectos determinísticos; poda; custo por distância.
- Rotas: dono do save, alvo inválido, olheiro ocupado, lista cheia, base cheia, prospecto vencido, `noClub`.
- Garantia: o mercado da IA e o motor leem valores exatos (teste de que `findCandidates`/`simulateMatch` não
  recebem nada de `scouting`).
- `scripts/season-rollover-smoke.ts`, seção "Olheiros": cria no início uma missão de país estrangeiro, uma de
  jogador e uma `youth`; confere k crescendo e chegando a 100 na de jogador, relatórios e mensagens, linha
  `scouting` em toda segunda com missão ativa, lista com ao menos um alerta, um prospecto contratado (na base,
  contrato, compensação no extrato), nenhum clube da IA com dados de olheiro, a busca devolvendo faixas e
  "?" coerentes com k, e o tempo de build do índice da busca (informativo, falha só acima de 2×).

## 13. Limitações

- A IA não tem incerteza: ela "sabe" tudo; só o jogador pode errar na compra (é o desafio).
- O pedido de salário e o preço da contraproposta seguem o valor real e vazam um pouco da nota.
- Estatísticas públicas (gols, nota média, estrelas) não são escondidas — informação pública de verdade.
- A personalidade (Etapa 26, se aprovada) poderia ser revelada pelos relatórios a partir de k 60: deixado como
  gancho, não incluído.
- Sem rede de olheiros por região (bônus de idioma/país), sem empréstimo de olheiros, sem regras FIFA de menores
  além da idade mínima.

## 14. Decisões abertas (com recomendação)

1. **Incerteza sem missão maior que hoje?** Hoje um chefe nota 5 dá ±0,6 a todo mundo; no novo modelo um
   desconhecido de outro país fica em ±2,0 com atributos ocultos. *Recomendo sim* (é o que dá sentido às missões),
   com o piso implícito (própria liga 35, fama até 60) amortecendo.
2. **Conhecimento é do técnico ou do clube?** *Recomendo do técnico* (segue na troca de clube); olheiros de campo
   e prospectos ficam com o clube.
3. **Quantos olheiros:** contratados como staff (até 4, salário) ou vagas pelo tier/orçamento sem contratação?
   *Recomendo contratados* (mesmo mercado do staff, custo visível).
4. **Jovens estrangeiros:** prospectos gerados sem clube com compensação fixa (proposto) ou também tirar 16–17 de
   elencos da IA direto para a base com compensação? *Recomendo só prospectos gerados* (não esvazia a IA; os da
   IA seguem a negociação normal).
5. **Idade mínima e regra de menores:** 16 em qualquer país (proposto) ou 18 fora do continente (FIFA)?
   *Recomendo 16 sem regra FIFA* (simples; jogável).
6. **Custo de viagem** pela receita (proposto, escala com o clube) ou valor fixo por distância? *Recomendo pela
   receita.*
7. **Atributos na busca de desconhecidos:** filtro por atributo usa o valor com ruído (proposto) ou fica
   desabilitado abaixo de k 20? *Recomendo valor com ruído* (sem tela "quebrada").
