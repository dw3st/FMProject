# Instalações do clube: estádio, CT e base

Spec: `docs/superpowers/specs/2026-10-04-facilities-design.md`. Etapa 24 do `docs/ROADMAP.md`, versão **3.9**.
Visual: `.claude/rules/ui-standard.md`. Diretoria: `board-fans.md`. Extrato: `finances.md`. Staff: `staff.md`.

## Regra

- Só o **clube do jogador** grava instalações (`Squad.facilities`, `ClubFacilities` em `src/types/facilityTypes.ts`).
  A IA usa o **nível implícito do tier** (LOW 1, MEDIUM 2, HIGH 3, ELITE 4) para o CT e a base, como o staff, e
  continua com a bilheteria antiga (capacidade × 0,65). Sem migração (protótipo).
- As instalações são **do clube**: criadas no `createSave` e no `takeOverClub` (`initialFacilities`: setores pela
  capacidade, conforto 1, CT e base no nível implícito do tier), apagadas no `releaseHumanClub` (o estádio construído
  fica em `venue.capacity`, obras em andamento são abandonadas). O start kit não as carrega (`stripHumanOnly`) e
  `applyRandomStartKit` as restaura.
- Nada novo na barra superior: aba **Instalações** dentro de **Finanças**; cartão **Obras** no Painel.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/facilities/facilityConfig.ts` | Constantes (`FACILITIES`) |
| `src/Domain/facilities/facilities.ts` (+ teste) | Puro: setores, capacidade efetiva, demanda, público, conforto, custos/prazos, manutenção, decisão da diretoria, obras e parcelas (`advanceFacilities`), dia de jogo (`facilitiesMatchday`), efeitos do CT e da base |
| `src/Domain/facilities/facilityMessages.ts` | Inbox `facilities` (`approved`, `refused`, `completed`, `attendance_record`) |
| `src/backend/facilityWorld.ts` | E/S: tier da liga, custo por lugar (peso do país do ranking de técnicos × tier), `withInitialFacilities` |
| `src/backend/facilityRoutes.ts` | `GET /api/saves/:id/facilities`, `POST /api/saves/:id/facilities/request` |
| `src/backend/advanceDay.ts` | Bloco financeiro: obras do dia, público dos jogos em casa, bilheteria pelo público, parcelas, mensagens adiadas |
| `src/Domain/advanceDay/financial.ts` | `PlayerHomeFixtureToday.attendance/priceMult`; manutenção na segunda (`facilities_upkeep`) |
| `src/Domain/advanceDay/dailyTraining.ts`, `dailyRest.ts`, `matches.ts` | Efeitos do CT na recuperação, lesão de treino e DP do treino |
| `src/Domain/youth/youth.ts` | Efeitos da base na safra |
| `src/GameInterface/Facilities/FacilitiesView.tsx`, `facilitiesApi.ts` | Aba Instalações |
| `src/GameInterface/Dashboard/HomeCards.tsx` (`WorksCard`) | Cartão Obras |
| `src/GameInterface/MatchPreviewScreen.tsx` | Público esperado / capacidade (jogo em casa) |

## Estádio

- 4 setores (Norte, Sul 18% cada; Leste, Oeste 32% — laterais maiores); a soma é `venue.capacity`.
- **Ampliar:** +1.000 a +10.000 lugares (múltiplos de 1.000), um setor por vez. Custo por lugar =
  `clamp(1.500 + 4.500 × peso do país × fator do tier, 1.500, 6.000)` (peso do país = `countryWeight` do ranking de
  técnicos, cache `meta.managerWeights` ou calculado e guardado em memória; fator do tier 1 / 0,75 / 0,55 / 0,4).
  Prazo 8 + 22 × (lugares − 1.000)/9.000 semanas (8..30). Durante a obra o setor conta metade. Na conclusão,
  `venue.capacity` = soma dos setores (a receita estimada da virada, `clubAnnualRevenue`, passa a usar o estádio
  maior: o custo operacional sobe um pouco).
- **Conforto 1–5:** ingresso × (1 + 0,06 × (nível − 1)). Obra: €100/160/240/350 por lugar para os níveis 2..5, 8..20 semanas.

## Demanda e público

```
demanda = capacidade âncora × ocupação da torcida (stadiumFillRate) × (seguidores / seguidores âncora)^0,7
        × tier da liga (1 / 0,6 / 0,4 / 0,3, relativo ao tier âncora) × fase da temporada
público = min(capacidade efetiva, demanda)
bilheteria = round(público × preço × conforto)        (público sem arredondar; 0 em campo neutro)
fase = 1,04 (primeiros 10% da janela da liga) · 0,98 (meio) · 1,06 (últimos 20%)   — média ≈ 1,002
```

**Calibração preservada por construção:** a âncora é o estádio, os seguidores e o tier no momento em que as
instalações são criadas. Com as instalações padrão (capacidade âncora, conforto 1) e fase neutra, o público é
`capacidade × ocupação` e a bilheteria é exatamente `gateRevenue(capacidade, tipo, neutro, ocupação)` (teste
`default facilities sell exactly the old gate`). A única diferença num jogo é a fase (−2% a +6%, média +0,2% na
temporada). A IA não muda. Ampliar acima da demanda não rende: o gráfico mostra a ocupação para o jogador decidir;
a demanda cresce com os seguidores (sucesso), cai com o rebaixamento.

Cada jogo em casa grava uma linha em `facilities.attendance` (data, competição, adversário, público, capacidade,
demanda; últimas 80) e o recorde (`facilities.record`). Recorde batido (havendo um anterior) → inbox.

## CT e base (níveis 1–5, nível 3 neutro)

| Nível | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| CT: recuperação diária | ×0,97 | ×0,985 | ×1 | ×1,04 | ×1,08 |
| CT: lesão no treino | ×1,05 | ×1,025 | ×1 | ×0,925 | ×0,85 |
| CT: DP do treino | ×0,95 | ×0,975 | ×1 | ×1,05 | ×1,10 |
| Base: nível da safra | −0,30 | −0,15 | 0 | +0,15 | +0,30 |
| Base: tamanho da safra | 3–5 | 3–5 | 3–5 | 3–5 | 3–6 |
| Base: chance de promessa | 3% | 4% | 5% | 7% | 9% |

- O CT multiplica os efeitos do staff (`staffEffectsOf`) na recuperação (descanso, dia de treino e quem não jogou no
  dia de jogo), na lesão de treino pesado e na DP do treino. **Nunca dentro da partida:** o motor, o quickSim, a DP
  de partida, o fôlego de quem jogou e a familiaridade de estilo não mudam.
- A base entra em `generateIntake` para todo clube (IA pelo nível implícito). Consequência aceita: a IA LOW tem safras
  um pouco piores e menos promessas; a ELITE melhores.
- Obras: custo = receita anual × 3/6/12/20% (CT, níveis 2..5) ou × 2/4,5/9/15% (base); 12..40 semanas.
- **Manutenção semanal** (`facilities_upkeep`, segunda): receita anual × (0,4% por nível do CT + 0,3% por nível da
  base **acima do nível implícito do tier**) / 52. Com os níveis iniciais é 0: o custo operacional (25% da receita)
  já cobre as instalações da classe do clube.

## Diretoria e dinheiro

- O jogador pede (`POST .../facilities/request` com `{ kind: "stand", stand, seats }` ou
  `{ kind: "comfort" | "training" | "academy" }`, sempre o próximo nível). Uma obra por tipo ao mesmo tempo
  (409 `busy`); nível 5 → 400 `maxLevel`; corpo inválido → 400; desempregado → 409 `noClub`; dono do save; trava do save.
- `boardDecision`: saldo negativo → `negative_balance`; diretoria < 50 → `board_low`; 50–69 e custo > 10% da receita
  anual → `too_big`; ≥ 85 a diretoria paga 25% (85) a 50% (100); a parte do clube tem de caber no saldo → `no_money`.
  A tela mostra a previsão com a mesma função.
- **Parcelas mensais:** n = ⌈dias da obra / 30⌉; a parcela k vence em início + 30k dias (a primeira no próprio dia da
  aprovação, cobrada pelo avanço desse dia), todas pagas até o fim. Cada parcela: `facilities` (−custo/n) e
  `board_funding` (+parte da diretoria/n). As partes somam exatamente o custo e a parte da diretoria. A invariante do
  extrato (soma = saldo) continua, pois tudo passa por `recordMoney`.
- Inbox: `approved`/`refused` na hora (rota), `completed` e `attendance_record` adiados para depois do `clearInbox`.

## Telas

- **Finanças → Instalações** (`SegmentedTabs`; `?tab=facilities` abre direto): KPIs (capacidade, público médio da
  temporada, recorde, ingresso); estádio em SVG visto de cima, setores coloridos pela ocupação média (só exibição:
  a média da temporada repartida com leve preferência pelo setor Oeste) com rótulos em HTML (lugares, %); clicar num
  setor abre o painel de ampliação (+1K … +10K, custo, prazo, nova capacidade, previsão da diretoria, "Pedir à
  diretoria"); conforto; gráfico do público por jogo em casa (barras: jogados cheios, estimados tracejados) contra a
  capacidade (linha) e a demanda (tracejada), com tooltip; cartões do CT e da base (5 marcas, efeito atual e do
  próximo nível, custo, prazo); obras com barra de progresso e entrega; manutenção semanal.
- **Visão geral:** a projeção de bilheteria usa o mesmo público; filtros e linhas do extrato com os tipos novos.
- **Painel:** cartão Obras só com obra em andamento ou concluída nos últimos 7 dias.
- **Prévia da partida:** público esperado / capacidade nos jogos em casa (fora de campo neutro).

## `/test`, `/lab`

Sem efeito dentro da partida (o CT age só no treino e na recuperação entre jogos; a base, na virada): nada a exibir.
O `/lab` (congestão) não aplica o CT: os elencos sintéticos não têm clube.

## Testes e smoke

```
bun test src/Domain/facilities src/backend/facilities.routes.test.ts src/Domain/youth \
  src/Domain/advanceDay/dailyTraining.test.ts src/Domain/advanceDay/matches.test.ts src/Domain/finance
```

`facilities.routes.test.ts`: dono do save, validação, recusa sem dinheiro, aprovação com a diretoria pagando 50%,
`busy`, parcela e verba no extrato com a soma = saldo, conclusão (capacidade nova, parcelas = custo, inbox),
demissão → clube da IA sem instalações e 409 `noClub`.

`scripts/season-rollover-smoke.ts`, seção "Instalações": a diretoria (forçada a 90 no pedido) aprova +1.000 lugares
no setor Leste; a obra termina na corrida; `venue.capacity` +1.000; os jogos depois usam a capacidade nova; público
nunca acima da capacidade; parcelas = custo e verba = parte da diretoria; bilheteria da liga = público × preço;
nenhum clube da IA grava instalações. A checagem de bilheteria da seção "Diretoria" e a do saldo na virada passaram
a considerar o público e as parcelas do dia.

## Limitações

- A ocupação por setor no desenho é ilustrativa (o público não é simulado por setor).
- A demanda não distingue adversário nem competição (só a fase da temporada); um clássico lota como um jogo comum.
- O custo por lugar usa o peso do país do ranking de técnicos; sem cache na meta ele é calculado na primeira consulta
  (lê os elencos de nível 1 do país e das 5 grandes) e guardado em memória por processo.
- Ampliar o estádio aumenta a receita estimada da virada (`clubAnnualRevenue` usa a capacidade × 0,65), e com ela o
  custo operacional e o fator de salário, mesmo que a demanda não encha os lugares novos.
- A familiaridade de estilo e a evolução da base fora de jogo (`developYouthSeason`) usam só o auxiliar, não o CT.
