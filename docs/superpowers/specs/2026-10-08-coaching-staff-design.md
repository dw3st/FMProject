# Comissão técnica completa (Etapa 31a)

Etapa 31 do `docs/ROADMAP.md`, issue #102. Desenho aprovado em 2026-10-07/08. Esta é a parte **31a**: comissão,
efeitos, contratos e mercado. Rostos da comissão e avatar do técnico do jogador ficam para a **31b** (fora daqui).
Regras atuais que esta etapa muda: `.claude/rules/game/staff.md`, `development.md` ("Passo de 0,1"),
`scouting.md` (olheiros de campo), `injuries.md`, `style-training.md`, `responsibilities.md`.

## Decisões

| Tema | Decisão |
|---|---|
| Áreas de treino | 7 áreas = 7 categorias de DP: Goleiros, Defesa, Ataque, Técnica, Tática, Físico, Bola parada |
| Funções | Auxiliar técnico, preparador físico, preparador de goleiros, treinadores de área, médico/fisioterapeuta, analista de desempenho, olheiro-chefe, olheiros de campo, jardineiro |
| Área sem responsável | Evolui a ~40% do ritmo (×0,4), nunca trava |
| Estrelas | 1–5 por área; 3★ = exatamente o ritmo de hoje; 1★ ×0,7, 5★ ×1,25 |
| Atributos | Determinação, disciplina, adaptação, leitura de jogadores, conhecimento (por especialidade), escala 1–20; as estrelas são derivadas deles |
| Limite por função | Pelo tier natural do clube (tabela abaixo) |
| Contratos | 1–3 anos, salário fixo congelado na assinatura, multa de metade do restante ao demitir, renovação perto do fim (diretor ou aviso) |
| IA | Não contrata comissão: estrelas implícitas pelo tier em todas as áreas |
| Mercado | Lista de ~300 profissionais livres por save, aba **Comissão** em Transferências; substitui os mercados semanais (inclusive o de olheiros de campo) |
| Troca de clube | A comissão fica no clube; no clube novo, comissão inicial gerada pela divisão |
| Saves antigos | Sem migração (protótipo) |

## 1. Áreas de treino e categorias de DP

Hoje há 5 categorias (`PlayerDevelopment.ts` → `CATEGORY_STATS`): `shooting` (finishing, heading), `passing`
(passing, vision), `defending` (tackling, pressing), `technical` (dribbling), `physical` (speed, acceleration).
`strength`, `stamina`, `reflex` e `jump` nunca evoluem nem declinam; o goleiro evolui só pelas categorias de linha.

Passam a 7 categorias, cada uma uma **área de treino**:

| Área | Categoria (`DPCategory`) | Atributos | Quem cuida |
|---|---|---|---|
| Goleiros | `goalkeeping` (nova) | reflex, jump, pressing (posicionamento do GK) | Preparador de goleiros |
| Defesa | `defending` | tackling, pressing | Treinador de área |
| Ataque | `shooting` | finishing (heading sai) | Treinador de área |
| Técnica | `technical` | dribbling | Treinador de área |
| Tática | `passing` | passing, vision | Treinador de área |
| Físico | `physical` | speed, acceleration, **strength, stamina** | Preparador físico |
| Bola parada | `setPieces` (nova) | heading | Treinador de área |

Os nomes internos `shooting` e `passing` ficam (menos mudança em `roles.json` e telas); só os rótulos de tela são
"Ataque" e "Tática". `pressing` fica em duas categorias (Defesa e Goleiros): o laço já trata isso, cada categoria
soma a sua parte.

### `dpWeights` novos (somam 1, identidade preservada)

Regra: o peso antigo de `shooting` se divide entre `shooting` e `setPieces` pelo perfil (atacante fica com mais
finalização; zagueiro ganha cabeceio); `physical` mantém o peso (os 4 atributos dividem o mesmo DP: speed e
acceleration crescem à metade do ritmo por atributo de antes, strength e stamina passam a crescer); o goleiro ganha
`goalkeeping` dominante e perde `defending` (o pressing dele vem pela área de Goleiros). O goleiro ficou com os pesos
de antes trocando `defending` por `goalkeeping` (0,31); os 0,50 do desenho fizeram o overall dele crescer 1,7–1,8× o
de um jogador de linha (medição da Tarefa 6, abaixo).

| Papel | goalkeeping | shooting | setPieces | passing | defending | technical | physical |
|---|---|---|---|---|---|---|---|
| GK | 0,31 | 0 | 0 | 0,12 | 0 | 0,27 | 0,30 |
| CB | 0 | 0 | 0,10 | 0,10 | 0,45 | 0,20 | 0,15 |
| LB / RB | 0 | 0,03 | 0,02 | 0,20 | 0,30 | 0,20 | 0,25 |
| LWB / RWB | 0 | 0,03 | 0,02 | 0,25 | 0,20 | 0,20 | 0,30 |
| CDM | 0 | 0,03 | 0,02 | 0,25 | 0,40 | 0,20 | 0,10 |
| CM | 0 | 0,07 | 0,03 | 0,35 | 0,15 | 0,25 | 0,15 |
| CAM | 0 | 0,15 | 0,05 | 0,35 | 0,05 | 0,30 | 0,10 |
| LM / RM | 0 | 0,10 | 0,05 | 0,25 | 0,10 | 0,20 | 0,30 |
| LW / RW | 0 | 0,22 | 0,08 | 0,20 | 0,05 | 0,20 | 0,25 |
| ST | 0 | 0,30 | 0,15 | 0,10 | 0,05 | 0,25 | 0,15 |
| `DEFAULT_DP_WEIGHTS` | 0 | 0,07 | 0,03 | 0,30 | 0,20 | 0,25 | 0,15 |

### Qual papel dá os pesos (correção necessária)

Hoje `matches.ts`, `dailyTraining.ts` e `youth.ts` procuram `rolesData[player.positions[0]]`. No mundo,
`positions[0]` é a **linha** ("Defender", "Midfielder", "Forward", "GK": 12 435 / 11 514 / 8 224 / 4 264
jogadores), então todo jogador de linha cai em `DEFAULT_DP_WEIGHTS` e só o goleiro usa os pesos do papel. Sem
corrigir, as categorias novas nunca chegariam ao zagueiro (cabeceio) nem ao atacante. Passa a existir um único
`dpWeightsFor(player)` (`PlayerDevelopment.ts`): `roles[preferredRole(player)].dpWeights` (a posição natural,
`positions.md`; o goleiro continua GK), com `DEFAULT_DP_WEIGHTS` só se o papel não tiver pesos. Isso muda a
distribuição por atributo dos jogadores de linha (passam a seguir o próprio papel), não o total de DP — Decidido 1.

## 2. Funções, estrelas e efeitos

### Funções (`StaffRole`)

| Função | `StaffRole` | Especialidade (conhecimento) | Efeito |
|---|---|---|---|
| Auxiliar técnico | `assistant` | `general` | Multiplicador geral de DP (como hoje) |
| Preparador físico | `fitness` | `physical` | Área Físico + recuperação diária e risco de lesão (como hoje) |
| Preparador de goleiros | `goalkeeping` | `goalkeeping` | Área Goleiros |
| Treinador de área | `coach` | `defending`, `shooting`, `technical`, `passing`, `setPieces` (as cinco) | Até 2 áreas cada |
| Médico / fisioterapeuta | `medic` | `medical` | Duração das lesões |
| Analista de desempenho | `analyst` | `analysis` | Ganho de familiaridade de estilo |
| Olheiro-chefe | `scout` | `scouting` | Como hoje (`scouting.md`) |
| Olheiro de campo | `fieldScout` | `scouting` | Como hoje, uma missão cada |
| Jardineiro | `groundskeeper` | `pitch` | **Nenhum** até a etapa 34 (gramado); existe, contrata, recebe salário |

### Atributos (escala 1–20)

`StaffAttributes { determination, discipline, adaptability, playerReading, knowledge: Partial<Record<Specialty, number>> }`,
inteiros 1–20. **Por que 1–20:** é a escala da personalidade dos jogadores (`personality.md`) e do Football Manager,
inteira, e dá 19 passos para 9 meias-estrelas (1, 1,5 … 5) — 1–100 seria precisão sem efeito. Sem efeito próprio:
só derivam as estrelas.

```
nota(área)   = 0,50 × conhecimento[área] + 0,20 × leitura de jogadores + 0,15 × determinação
             + 0,10 × disciplina + 0,05 × adaptação                         (1..20)
estrelas     = arredonda para 0,5( 1 + 4 × (nota − 1) / 19 )                (1..5; nota 10,5 = 3★)
```

Conhecimento ausente numa especialidade conta 1. O treinador de área tem conhecimento nas cinco áreas de campo
(estrelas por área); as demais funções, só na sua. As **estrelas da função** (exibição, salário, renovação) são as
da especialidade; do treinador de área, a melhor área.

### Curvas (todas lineares por partes por `[1★, 3★, 5★]`, 3★ neutro)

Para **não mudar o mundo** nos efeitos que já existem, as estrelas viram a nota antiga 1–10 por
`ratingFromStars(s) = s ≤ 3 ? 1 + 2(s − 1) : 5 + 2,5(s − 3)` (1★→1, 3★→5, 5★→10) e os efeitos antigos usam as curvas
de hoje (`STAFF.ASSISTANT_DEV` etc., na nota). As estrelas implícitas da IA são as notas implícitas de hoje
convertidas: LOW 4 → **2,5★**, MEDIUM 5 → **3★**, HIGH 6 → **3,4★**, ELITE 7 → **3,8★** — o auxiliar, o físico e o
olheiro da IA ficam **idênticos** aos de hoje.

| Efeito | vaga | 1★ | 3★ | 5★ |
|---|---|---|---|---|
| Área (DP da categoria) | **×0,4** | ×0,7 | ×1 | ×1,25 |
| Auxiliar (DP total) | nota 3 (= 2★) | ×0,9 | ×1 | ×1,15 |
| Físico: recuperação / risco de lesão | 2★ | ×0,95 / ×1,1 | ×1 | ×1,1 / ×0,85 |
| Médico: duração das lesões | ×1,1 (2★) | ×1,2 | ×1 | ×0,8 |
| Analista: ganho de familiaridade | ×0,9 (2★) | ×0,8 | ×1 | ×1,25 |
| Olheiro-chefe | nota 3 (2★) | como hoje (nota 1) | nota 5 | nota 10 |

A vaga de uma função que **não** é área (auxiliar, físico na recuperação/lesão, médico, analista, olheiro) vale
**2★** (a "nota 3" de hoje). A vaga de uma **área** vale ×0,4 (decisão). O preparador físico vago: área Físico ×0,4,
recuperação e lesão a 2★.

### Onde entra cada efeito

- **Área:** `areaMultsOf(squad): Record<DPCategory, number>`; entra **só no DP de crescimento daquela categoria**
  (partida, treino, base), junto aos multiplicadores de hoje (auxiliar, CT, profissionalismo, moral, renascido).
  Nunca no declínio por idade: uma área vaga não faz o veterano cair mais devagar. Por isso
  `distributeAndResolve` recebe o crescimento e o declínio separados:
  `DP(categoria) = (crescimento × multÁrea − declínio) × peso`. Com todos os multiplicadores em 1 é a conta de hoje.
- **Médico:** `returnDate(date, severity, rng, durationMult)` → `max(1, round(dias × mult))`; o mesmo sorteio de
  `rng` (nenhum número a mais). Partida (`matches.ts`) e treino (`dailyTraining.ts`).
- **Analista:** `trainFamiliarity(..., familiarityMult × intensidade)` — **substitui** o auxiliar nesse ganho (a
  tarefa passa ao analista; com os dois em 3★, igual a hoje).
- **IA:** estrelas implícitas em todas as áreas e funções. Efeito médio no mundo (parcelas de tier do mundo inicial,
  LOW 24% / MEDIUM 53% / HIGH 19% / ELITE 3%): área ×0,925 / 1 / 1,05 / 1,1 → média ≈ 0,995; duração das lesões
  ×1,05 / 1 / 0,96 / 0,92 → ≈ 1,005. A familiaridade da IA não é treinada (regra), nada muda.

### Atribuição dos treinadores de área

`StaffRecord.areaAssignments?: Partial<Record<CoachArea, string>>` (área → id do treinador), só o que o jogador
escolheu. `resolveAreaAssignments(staff)`: primeiro as escolhas válidas (treinador presente, no máximo 2 áreas por
treinador), depois as áreas livres em ordem de maior estrela disponível, cada uma ao treinador com mais estrelas
nela que ainda tem vaga (empate: id). Área sem ninguém = vaga (×0,4). Demitir ou o contrato acabar libera as áreas
dele (a escolha manual dele some).

## 3. Limite por função (tier natural do clube, `financialTierOf`)

| Função | LOW | MEDIUM | HIGH | ELITE |
|---|---|---|---|---|
| Treinadores de área | 3 | 3 | 4 | 5 |
| Olheiros de campo | 4 | 4 | 4 | 4 |
| Demais (cada) | 1 | 1 | 1 | 1 |

Por que LOW 3 e não 2: com 5 áreas e até 2 por treinador, 3 é o mínimo que cobre todas; com 2, todo clube pequeno
começaria com uma área a 40%, abaixo da IA do mesmo tier (que tem todas as áreas implícitas). Clubes maiores ganham
especialistas (um por área). Contratar acima do limite → 409 `roleFull`; o limite é lido na hora (se o tier cair,
ninguém é demitido, só não se contrata mais).

## 4. Contratos e salário

- `StaffMember.contract = { until, wage, signed, decision? }`: 1–3 anos (`contractEndFor`, fim da temporada da
  liga do clube), `wage` congelado na assinatura.
- **Salário:** a curva de hoje, `staffWeeklyWage(ratingFromStars(estrelas), fator do clube)`, × uma parcela por
  função (`STAFF.WAGE_ROLE_SHARE`, abaixo), no fator do clube **no dia da assinatura**. A segunda-feira cobra a soma
  dos contratos (`squadStaffWages(staff)`), não mais o fator atual.

  | Função | assistant | scout | fieldScout | fitness | goalkeeping | coach | medic | analyst | groundskeeper |
  |---|---|---|---|---|---|---|---|---|---|
  | Parcela da curva (`× WAGE_SHARE` 0,5 de hoje) | 1 | 1 | 1 | 0,7 | 0,4 | 0,4 | 0,4 | 0,3 | 0,1 |

  Com essas parcelas a folha inicial de um clube MEDIUM (10 profissionais) fica em ~1,7× a de hoje (3) — Decidido 2.
  A medição da Tarefa 15 imprime folha/receita por tier; meta: folha da comissão ≤ 4% da receita anual.
- **Demitir:** multa = `round(0,5 × wage × semanas restantes)` (dias até `until` / 7, arredondado para cima), uma
  linha `staff` com `ref.stage = "severance"` no extrato (`recordMoney`, a soma = saldo continua). O profissional volta
  à lista de livres.
- **Renovação** (toda segunda, `staffContractDay`, a 60 dias do fim, uma decisão por contrato):
  - Diretor responsável (`directorHandlesContracts(meta.responsibilities)`): renova se as estrelas da função ≥
    estrelas implícitas do tier − 0,5 e idade < 66, por 2 anos, salário = o maior entre o atual e a curva de hoje;
    senão marca `decision: "leave"`. Mensagem `contract` / `staff_renewed` ou `staff_leaving`.
  - Técnico responsável: mensagem `contract` / `staff_expiring` (uma vez, `decision: "warned"`); renova na tela.
  - No primeiro dia ≥ `until` sem renovação: sai para a lista de livres, mensagem `staff_left`.
- **Renovar na tela:** `POST /staff/renew { memberId, years }` (1–3 a partir do `until` atual, com o total ≤ 3
  temporadas restantes; salário como o do diretor). O profissional sempre aceita (sem moral nesta etapa).
- **Comissão inicial** (`initialStaff`): contratos de 1, 2 ou 3 anos sorteados por membro (determinístico), então a
  primeira virada já tem renovações.

## 5. Mercado: lista de livres

- `saves/{id}/staffPool.json` = `{ season, members: StaffMember[] }` (sem `contract`), DAL `readStaffPool` /
  `writeStaffPool` (bufferizado como `freeAgents`). Gerada no `createSave` e, se faltar, na primeira leitura.
- **300 profissionais**, determinísticos por `save`: coach 90, assistant 30, fitness 30, goalkeeping 30, medic 25,
  analyst 25, scout 20, fieldScout 35, groundskeeper 15. Estrelas-alvo: 1–2★ 30%, 2,5–3★ 40%, 3,5–4★ 22%, 4,5–5★ 8%.
- **Renovação parcial** na virada do país do clube do jogador: sai quem tem 68+ anos e 1/3 dos que estão há mais
  tempo na lista (`since`), entram novos até 300 (semente `save:temporada`); todos envelhecem 1 ano.
- Demitidos, contratos encerrados e profissionais que saem no fim voltam à lista (`since` = data).
- Busca: `GET /api/saves/:id/staff/pool?role=&minStars=&maxWage=&sort=stars|wage|age&offset=&limit=` (limite 1..100,
  padrão 50). O salário pedido é calculado no fator do clube do jogador (o que ele pagaria).
- Contratar: `POST /api/saves/:id/staff/hire { memberId, years }`.
- Os mercados semanais somem: `staffMarket`, `fieldScoutMarket`, `GET /staff/market`,
  `GET/POST /api/saves/:id/staff/scouts/market|hire` (os olheiros de campo vêm da lista, função `fieldScout`).
  `POST .../staff/scouts/fire` vira o `fire` geral (que cancela a missão do olheiro, como hoje).

## 6. Troca de clube, carreira nova, kits

- `createSave` e `takeOverClub`: `initialStaff(key, squad, { date, seasonEnd })` — uma de cada função e treinadores
  até o limite do tier, estrelas = implícitas do tier ± 0,5 (sorteio determinístico), sem olheiros de campo (como
  hoje). Não saem da lista de livres.
- `releaseHumanClub` (troca ou demissão): a comissão fica no clube (o clube vira IA e só usa estrelas implícitas);
  ela não volta à lista. Sem multa.
- Start kit: continua restaurando o `staff` do clube do jogador (`applyRandomStartKit`).

## 7. Telas

- **Equipe técnica** (`StaffScreen`, aba "Comissão"): cartões por função (nome, idade, estrelas, contrato até/salário,
  efeito), agrupados (Comando: auxiliar; Treino: físico, goleiros, treinadores; Saúde e análise: médico, analista;
  Olheiros; Estrutura: jardineiro). Quadro **Áreas de treino**: as 7 áreas com responsável, estrelas e
  multiplicador (vaga em destaque "×0,4"), e um seletor do treinador em cada área de campo. Ficha do profissional
  (modal): 5 atributos em barras 1–20, estrelas por área, contrato; **Renovar** (anos 1/2/3) e **Demitir** (confirmação
  com a multa). Botão "Buscar profissionais" leva a Transferências → Comissão. A aba Responsabilidades fica.
- **Transferências → aba Comissão** (`?tab=staff`): filtros função (`OptionChips`), estrelas mínimas, salário máximo;
  tabela (`TABLE_STYLE`): nome, função, idade, estrelas, especialidade forte, salário pedido; "Contratar" abre um modal
  com anos 1/2/3, salário congelado e o limite da função ("2/3 treinadores"). Desempregado: aba visível, contratar
  desligado (409 `noClub`).
- **Estrelas:** componente `StaffStars` (5 ícones `star`/`star-filled`/`star-half`, número ao lado, `tabular-nums`).
- **Finanças:** a projeção semanal usa a soma dos contratos; o extrato mostra "Multa da comissão" (`staffSeverance`).
- **Inbox** (`contract`, tópico `contracts`): `staff_expiring`, `staff_renewed`, `staff_leaving`, `staff_left`.
- **Olheiros:** o painel de olheiros de campo deixa de ter mercado próprio e aponta para a busca da comissão.
- i18n `staff.*`, `staffPool.*`, `inbox.contract.staff*`, `financesScreen.ledgerText.staffSeverance` (en, pt-BR).

## 8. `/test`, `/lab`

Nenhum efeito dentro da partida: os efeitos são evolução, recuperação entre jogos, lesão (risco e duração) e
familiaridade.

- **`/lab`:** o slider "Fitness coach" passa de nota 1–10 para **estrelas 1–5** (meias), via `withFitnessCoach`
  (agora em estrelas); ausente = implícito do tier. Muda: o rótulo (`3.5★` em vez de `7/10`). O médico não aparece
  no lab (a congestão não simula o tempo fora). Nenhuma métrica nova: lesões e fôlego já existem.
- **`/test`:** o `EnergyPanel` continua mostrando `recovery x / injury x` do time (mesma função); o painel de
  `dpWeights` do `TestScreen` mostra as 7 categorias (lê o JSON). Nenhum cenário novo nem overlay.
- `Statistics.ts`: nada novo.

## 9. Medições obrigatórias

`bun scripts/development-pace.ts` ganha:

- `--areas <estrelas|vaga>`: aplica o multiplicador de área a todas as categorias (3 = hoje; também 1, 5 e vaga).
- Perfil **goleiro** (pesos GK, reflex/jump/pressing 5) e uma coluna de **overall** (`Player.computeOverallAvg`)
  ao lado da média dos 13 atributos.

Aceite:
1. Com 3★ em tudo, a média dos 13 atributos por idade (18, 21, 24, 27, 31, 33) fica a ±10% da tabela atual de
   `development.md` (0,385 / 0,308 / 0,256 / 0,051 / −0,121 / −0,382) — a diferença vem só da redistribuição dos
   pesos; o multiplicador 3★ é exatamente 1 (teste).
2. Vaga em tudo ≈ 40% do crescimento e o mesmo declínio; 5★ ≈ ×1,25 no crescimento. Tabela registrada em
   `development.md`.
3. Goleiros: reflex e jump evoluem; o overall do GK por idade fica entre 0,6× e 1,4× o do perfil de linha aos 18,
   21 e 24, e cai a partir dos 31.

## 10. Smoke (`scripts/season-rollover-smoke.ts`, seção "Equipe técnica")

- O clube do jogador termina com todas as funções preenchidas e os treinadores dentro do limite do tier.
- Todo contrato da comissão tem `until` ≥ data final ou foi decidido: pelo menos um contrato vencendo na temporada foi
  renovado pelo diretor (o smoke usa o diretor) ou avisado; nenhum contrato vencido continua no clube.
- Uma demissão forçada pela rota gera uma linha `staff` `severance` negativa no extrato e o profissional está na
  lista de livres; o extrato continua somando o saldo.
- Nenhum clube da IA grava `staff`.
- O goleiro titular do clube do jogador tem `reflex` ou `jump` diferente do início (evoluiu).
- Linha `staff` em toda segunda com `wages`, igual à soma dos contratos daquele dia.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/staff/staffTypes.ts` | Funções, especialidades, áreas, atributos, contrato, `StaffRecord` (lista) |
| `src/Domain/staff/staffConfig.ts` | Constantes (`STAFF`): curvas, limites, parcelas de salário, lista, renovação |
| `src/Domain/staff/staff.ts` (+ teste) | Estrelas, efeitos, áreas, salário, geração, comissão inicial, borrão do olheiro (fica) |
| `src/Domain/staff/staffPool.ts` (+ teste) | Lista de livres: geração, renovação, busca |
| `src/Domain/staff/staffContracts.ts` (+ teste) | Multa, renovação (diretor), dia de contratos |
| `src/GameEngine/PlayerDevelopment.ts` | 7 categorias, `dpWeightsFor`, multiplicador de área, crescimento × declínio |
| `src/Data/roles.json`, `src/example_data/roles.json` | `dpWeights` novos |
| `src/Domain/advanceDay/matches.ts`, `dailyTraining.ts`, `src/Domain/youth/youth.ts`, `src/Domain/injury/injury.ts` | Efeitos |
| `src/backend/staffRoutes.ts` (+ `staff.routes.test.ts`) | Rotas |
| `src/backend/dal/*`, `SaveService.ts` | `staffPool.json` |
| `src/backend/advanceDay.ts`, `jobWorld.ts`, `scoutingRoutes.ts`, `scoutingWorld.ts` | Integração |
| `src/GameInterface/StaffScreen.tsx`, `Staff/*`, `Transfers/StaffPoolTab.tsx`, `TransfersScreen.tsx` | Telas |
| `scripts/development-pace.ts`, `scripts/staff-bill.ts` | Medições |

## Decididos (2026-10-08, pelo usuário)

1. **Decidido — pesos pela posição natural (aprovado).** `positions[0]` é a linha no mundo, então hoje todo
   jogador de linha usa `DEFAULT_DP_WEIGHTS`. O plano passa a usar a posição natural (`preferredRole`); sem isso as
   categorias novas (cabeceio do zagueiro, finalização do atacante) não teriam efeito. Isso muda a distribuição por
   atributo do mundo inteiro (o total de DP e o ritmo médio ficam iguais, medido na Tarefa 6). Se o usuário preferir
   não mexer, a alternativa era chavear `roles.json` também pela linha ("Defender" etc.) com um peso por linha. O
   usuário aprovou `dpWeightsFor` → `preferredRole`.
2. **Decidido — salário com parcela por função e teto de ~4% da receita (aprovado).** A decisão manda usar a curva atual (`staffWeeklyWage`); com 10 profissionais em vez de 3, a
   curva pura triplicaria a folha da comissão (~2,3% → ~7,7% da receita num clube como o Fulham) e comeria metade
   da margem de 15% do clube. O desenho mantém a curva e acrescenta uma parcela por função (`WAGE_ROLE_SHARE`) para a
   folha inicial ficar em ~1,7× a de hoje. Os valores finais saem da medição (`scripts/staff-bill.ts`). O usuário
   aprovou `WAGE_ROLE_SHARE` com a meta de folha da comissão ≤ ~4% da receita anual.
3. **Decidido — `jump` de jogador de linha sem evoluir (aceito como limitação).** Só a área de Goleiros o treina, e
   só o GK tem peso nela; ele pesa nas disputas aéreas (`aerial.md`), mas é baixo no mundo (~0,9/10) e não fazia
   parte do pedido.

## Medição do ritmo (Tarefa 6, 2026-10-08)

`bun scripts/development-pace.ts [--areas <1..5|vaga>]`, caso "realista" (tabelas completas em
`.claude/rules/game/development.md` → "Áreas de treino (4.7)"). Média dos 13 atributos, perfis de linha:

| | 18 | 21 | 24 | 27 | 31 | 33 |
|---|---|---|---|---|---|---|
| Antes | 0,385 | 0,308 | 0,256 | 0,051 | −0,121 | −0,382 |
| 3★ (final) | 0,390 | 0,313 | 0,251 | 0,049 | −0,126 | −0,377 |
| Vagas | 0,144 | 0,095 | 0,069 | −0,008 | −0,138 | −0,377 |
| 5★ | 0,469 | 0,372 | 0,300 | 0,074 | −0,123 | −0,377 |

- Aceite 1: 3★ a −3,9%..+4,1% em todas as idades. Exigiu recalibrar `decayDpScale` (28–29 1,5 → 1,0; 30–34 0,35 →
  0,39): com os pesos da spec e a escala antiga, 27 anos saía −29% e 31 −21% (Físico em 4 atributos e o cabeceio à
  parte deixam cada atributo com uma parte menor, que a semente de meio passo esconde). Os multiplicadores de área não
  mudaram (3★ = 1 exato, teste).
- Aceite 2: o DP é exatamente ×0,4 / ×1,25; a variação realizada aos 18–24 fica em 27–37% (vagas) e ×1,20 (5★) por
  causa da zona morta da virada; na base (sem virada) as vagas dão 43–49%. Declínio igual (33: −0,377 em todas).
- Aceite 3: reflex e jump do goleiro evoluem (+0,6 aos 18); overall do goleiro / linha 1,28× / 1,10× / 1,30× aos
  18/21/24 e cai a partir dos 31 — com o peso de goleiros da spec (0,50) dava 1,84× / 1,81× / 1,71×, por isso o goleiro
  ficou com `goalkeeping 0,31 · passing 0,12 · technical 0,27 · physical 0,30`.
