# Comissão técnica (Staff)

Spec: `docs/superpowers/specs/2026-10-08-coaching-staff-design.md` (Etapa 31a, versão **4.7**; substitui o staff de
3 funções da Etapa 10, `docs/superpowers/specs/2026-10-01-staff-design.md`). Visual: `.claude/rules/ui-standard.md`.
Áreas de treino: `development.md` → "Áreas de treino (4.7)".

## Regra

- **Só o clube do jogador grava comissão** (`Squad.staff: StaffRecord { members, areaAssignments? }`). Clubes da IA
  não gravam nada e usam as **estrelas implícitas do tier** (`STAFF.IMPLIED_STARS`: LOW 2,5★, MEDIUM 3★, HIGH 3,4★,
  ELITE 3,8★ — as notas antigas 4/5/6/7 convertidas) em todas as funções e áreas: o auxiliar, o físico e o olheiro da
  IA ficam idênticos aos de antes (regras, não simulação, `.claude/rules/AI-clubs/finance.md`).
- Função sem ninguém (que não é área) = **2★** (a "nota 3" antiga). Área de treino sem responsável = **×0,4**.
- Sem migração (protótipo).
- Tipos de dado em `src/types/staffTypes.ts` (`StaffRole`, `StaffMember`, `StaffRecord`…); `src/Domain/staff/staffTypes.ts`
  reexporta e guarda as listas (`STAFF_ROLES`, `COACH_AREAS`…), com checagem de tipo de que batem.

## Funções

| Função | `StaffRole` | Especialidade | Efeito (1★ / 3★ / 5★) | Limite |
|---|---|---|---|---|
| Auxiliar técnico | `assistant` | `general` | DP total ×0,9 / ×1 / ×1,15 | 1 |
| Preparador físico | `fitness` | `physical` | Área Físico; recuperação diária ×0,95 / ×1 / ×1,1; risco de lesão ×1,1 / ×1 / ×0,85 | 1 |
| Preparador de goleiros | `goalkeeping` | `goalkeeping` | Área Goleiros | 1 |
| Treinador de área | `coach` | as 5 áreas de campo | Até 2 áreas cada (Defesa, Ataque, Técnica, Tática, Bola parada) | LOW 3 · MEDIUM 3 · HIGH 4 · ELITE 5 |
| Médico / fisioterapeuta | `medic` | `medical` | Duração das lesões ×1,2 / ×1 / ×0,8 (`injuries.md`) | 1 |
| Analista de desempenho | `analyst` | `analysis` | Ganho de familiaridade ×0,8 / ×1 / ×1,25 (`style-training.md`) | 1 |
| Olheiro-chefe | `scout` | `scouting` | Incerteza ×1,3 / ×1 / ×0,75; ganho das missões ×0,7 / ×1 / ×1,4 (`scouting.md`) | 1 |
| Olheiro de campo | `fieldScout` | `scouting` | Uma missão cada | 4 (`STAFF.LIMITS.fieldScout`) |
| Jardineiro | `groundskeeper` | `pitch` | Desgaste dos gramados do clube ×1,3 / ×1 / ×0,75 (× 0,9 por jardineiro a mais; sem nenhum ×1,6; base pela metade) — `StaffEffects.pitchWearMult`, `facilities.md` (5.1) | LOW 1 · MEDIUM 1 · HIGH 2 · ELITE 2 |

Limite pelo tier natural do clube (`roleLimit`, `financialTierOf`), lido na hora: acima dele, 409 `roleFull`; se o
tier cair, ninguém é demitido.

## Estrelas

- Atributos 1–20 inteiros (`StaffAttributes`): determinação, disciplina, adaptação, leitura de jogadores e
  conhecimento por especialidade. Sem efeito próprio: só derivam as estrelas.
- `nota(área) = 0,50 × conhecimento + 0,20 × leitura + 0,15 × determinação + 0,10 × disciplina + 0,05 × adaptação`;
  `estrelas = arredonda para 0,5(1 + 4 × (nota − 1)/19)` (nota 10,5 = 3★). Conhecimento ausente conta 1.
- Estrelas da função (exibição, salário, renovação) = as da especialidade; do treinador de área, a melhor área.
- Curvas novas (`starCurve`) lineares por `[1★, 3★, 5★]`, 3★ neutro. Os efeitos que já existiam passam pela nota
  antiga: `ratingFromStars(s) = s ≤ 3 ? 1 + 2(s − 1) : 5 + 2,5(s − 3)` e as curvas de antes (`STAFF.ASSISTANT_DEV`…).
- Efeito de uma função = o membro de mais estrelas dela (`headOf`, `effectiveStars`); `staffEffectsOf(squad)` é a
  única porta de entrada (`devMult`, `recoveryMult`, `injuryMult`, `injuryDurationMult`, `familiarityMult`,
  `scoutUncertaintyMult`, `scoutGainMult`).

## Áreas de treino

- `areaStars(squad)` / `areaMultsOf(squad)`: Goleiros pelo preparador de goleiros, Físico pelo preparador físico, as 5
  de campo pelos treinadores (`resolveAreaAssignments`: primeiro as escolhas válidas do jogador, `areaAssignments`, no
  máximo 2 por treinador; depois as livres, cada uma ao treinador com mais estrelas nela que ainda tem vaga; empate:
  id). Área sem ninguém = ×0,4. Demitir ou o contrato acabar libera as áreas dele.
- O multiplicador entra **só no crescimento** da categoria (partida, treino, base), nunca no declínio
  (`development.md`).

## Contratos

- `StaffMember.contract = { until, wage, signed, decision? }`: 1–3 temporadas (`contractEndFor`), salário congelado
  na assinatura: `staffWageFor(role, estrelas, fator do clube) = staffWeeklyWage(ratingFromStars(estrelas), fator) ×
  STAFF.WAGE_ROLE_SHARE[role]`. A segunda cobra a soma dos contratos (`squadStaffWages(staff, data)`, linha `staff` do
  extrato), sem quem tem `until` antes do dia (sai mais tarde no mesmo dia: não paga a semana a mais).
- **Demitir** (`POST /staff/fire`): multa = `round(0,5 × wage × semanas restantes)` (dias até `until` / 7, para cima),
  linha `staff` com `ref.stage = "severance"` (`recordMoney`; extrato = saldo; `ledgerText` → `staffSeverance`); o
  profissional volta à lista de livres. Olheiro de campo: a missão dele é cancelada.
- **Renovação** (`staffContractDay`, `src/Domain/staff/staffContracts.ts`, no avanço do dia do clube humano): quem
  passou do `until` sai para a lista (`staff_left`, qualquer dia; olheiro de campo leva a missão,
  `cancelScoutMissions`); toda segunda, a ≤ 60 dias do fim, uma decisão por contrato:
  - diretor responsável (`directorHandlesContracts`, `responsibilities.md`): renova por 2 anos se estrelas ≥ implícitas
    do tier − 0,5 e idade < 66, salário = o maior entre o atual e a curva de hoje (`staff_renewed`); senão `decision:
    "leave"` (`staff_leaving`);
  - técnico responsável: aviso `staff_expiring` (`decision: "warned"`), renovação na tela. O aviso não trava: se o
    diretor passa a responder pelos contratos, ele decide esse contrato na segunda seguinte. `decision: "leave"`
    (do diretor) é definitiva.
- **Envelhecimento** (`ageStaff`, na virada do país do clube do jogador, no mesmo ponto do `refreshPool`): toda a
  comissão +1 ano; quem chega a `STAFF.POOL.RETIRE_AGE` (68) se aposenta: sai sem multa, não volta à lista, libera as
  áreas, mensagem `staff_retired`.
- **Renovar na tela** (`POST /staff/renew { memberId, years }`): `years` a mais a partir do `until`, total ≤ 3
  temporadas a partir do fim desta (400 `tooManyYears`); sempre aceita.
- Mensagens `contract` / `staff_expiring | staff_renewed | staff_leaving | staff_left | staff_retired` (`staff: [{ id, name, role }]`,
  `players` vazio), tópico `contracts`, gravadas depois do `clearInbox`.
- **Comissão inicial** (`initialStaff`, `createSave` e `takeOverClub`): uma de cada função e treinadores até o limite,
  estrelas = implícitas do tier ± 0,5, contratos de 1, 2 ou 3 anos sorteados (a primeira virada já tem renovações), sem
  olheiros de campo. Não sai da lista de livres.
- **Troca de clube / demissão do técnico:** `releaseHumanClub` tira o `staff` (o clube vira IA e usa as estrelas
  implícitas); a comissão não volta à lista e não há multa. O clube novo ganha a comissão inicial dele.
- Start kit: `applyRandomStartKit` restaura o `staff` do clube do jogador (o kit não carrega comissão).

## Lista de livres (`src/Domain/staff/staffPool.ts`)

- `saves/{id}/staffPool.json` = `{ season, refreshedOn, members }` (sem contrato, com `since`), DAL
  `readStaffPool`/`writeStaffPool` (bufferizado). Gerada no `createSave` e, se faltar, na primeira leitura
  (`SaveService.getStaffPool`; a rota `GET /staff/pool` lê sob `withSaveLock`).
- 300 profissionais determinísticos por save (coach 90, assistant 30, fitness 30, goalkeeping 30, medic 25, analyst
  25, scout 20, fieldScout 35, groundskeeper 15); estrelas 1–2★ 30%, 2,5–3★ 40%, 3,5–4★ 22%, 4,5–5★ 8%.
- Na virada do país do clube do jogador (`refreshPool`): sai quem tem 68+ e 1/3 dos que estão há mais tempo; entram
  novos até 300 (semente `save:temporada`, ids com a data); todos envelhecem 1 ano. Uma vez por data de virada
  (`refreshedOn`; a geração grava o dia): numa troca entre ligas de calendários diferentes, a virada do país do clube
  novo renova mesmo com o mesmo rótulo de temporada. Demitidos e contratos encerrados voltam com
  `since` = data.

## Rotas (`src/backend/staffRoutes.ts`, dono do save; escrita com `withSaveLock`; sem clube → 409 `noClub`)

Contratar e demitir gravam elenco, extrato, lista e olheiros num `BufferingSaveDAL` por requisição (`inUnit`), com o
flush no fim (nada é gravado numa resposta de erro).

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/staff` | `staffView`: membros (`stars`, `starsByArea` do treinador, `severance` de hoje, `renewYears` aceitos e `renewWage`), as 7 áreas (estrelas, multiplicador, responsável), `areaAssignments`, `limits` por função, `effects`, `weeklyTotal` |
| `GET /api/saves/:id/staff/pool?role=&minStars=&maxWage=&sort=name\|role\|age\|stars\|wage&dir=asc\|desc&offset=&limit=` | Busca (limite 1..100, padrão 50); ordenação na lista inteira (sem `dir`: estrelas da maior, o resto crescente; função na ordem de `STAFF_ROLES`; 400 para coluna ou sentido inválido), clicando no cabeçalho da coluna na aba Comissão; salário pedido no fator do clube do jogador (desempregado: fator 1, a lista continua visível) |
| `POST /api/saves/:id/staff/hire { memberId, years }` | Contrata da lista (404 `notInPool`, 409 `roleFull`, 400 `invalidYears`) |
| `POST /api/saves/:id/staff/fire { memberId }` (ou `{ role }`) | Demite: multa, volta à lista; resposta com `severance` |
| `POST /api/saves/:id/staff/renew { memberId, years }` | Renova (400 `tooManyYears`) |
| `PUT /api/saves/:id/staff/areas { [área]: memberId \| null }` | Treinador de uma área de campo (`null` = automático; 400 `unknownArea`, `notACoach`, `tooManyAreas`) |

Os mercados semanais (`staffMarket`, `fieldScoutMarket`, `/staff/market`, `/staff/scouts/*`) não existem mais.

## Telas

- **Equipe técnica** (`StaffScreen`, "SUA **COMISSÃO**" / "COACHING **STAFF**"; abas Comissão | Responsabilidades):
  cartões por grupo (Comando; Treino; Saúde e análise; Olheiros; Estrutura) com `StaffStars` (número com largura fixa, `min-w-[3ch]`: as estrelas alinham entre linhas com 3 e
  3,5), idade, contrato ("até
  05/2028 · €12,300/sem") e o efeito em uma linha, em texto e porcentagem contra um profissional médio de 3★
  (`formatEffect`, `Staff/staffApi.ts`: "Evolução dos jogadores +6%", "Duração das lesões −8%", "sem efeito" no neutro;
  nunca o multiplicador cru `×1,06`), com a linha de ajuda "comparado a um profissional médio (3 estrelas)" acima dos
  cartões e na ficha (que repete o efeito); o ritmo das áreas e o ritmo de um país no olheiro usam o mesmo formato; vaga = cartão tracejado "Vago" + "Buscar"
  (→ `/transfers?tab=staff&role=`). Quadro **Áreas de treino** (`Staff/TrainingAreasPanel.tsx`, `TABLE_STYLE`): as 7
  áreas, responsável (seletor do treinador nas 5 de campo, "Automático · nome"; um treinador que já cuida de 2 áreas
  manuais aparece desligado, "Nome · já cuida de 2 áreas"), estrelas e ritmo (vaga em `text-destructive`). Ficha (`Staff/StaffDetailModal.tsx`; nacionalidade traduzida por `nationalityDisplayName`, `src/Domain/world/labels.ts`): 5 atributos em barras 1–20, estrelas por área, contrato,
  **Renovar** (1/2/3 anos, só os que a rota aceita, com o salário novo) e **Demitir** (confirmação com a multa). Rodapé
  com a folha e "Buscar profissionais".
- **Transferências → aba Comissão** (`?tab=staff&role=`, `Transfers/StaffPoolTab.tsx`): filtros de função, estrelas
  mínimas, salário máximo, ordenação; tabela com nome (abre a ficha), função, idade, estrelas, "forte em", salário
  pedido (o filtro de salário busca 300 ms depois da digitação); "Contratar" abre `HireStaffModal` (anos, salário congelado, uso do limite; cheio ou sem clube → desligado com
  o motivo). A faixa da janela de transferências não aparece nessa aba (a comissão não depende dela).
- **Central de Olheiros:** chefe e olheiros de campo em estrelas; "Buscar olheiros" → aba Comissão. Dispensar um
  olheiro de campo (aba Missões) confirma com a multa de hoje (`severance` em `GET /scouting`) e mostra o erro real
  da rota. Na segunda, `scoutingDay` descarta missões de quem não é o chefe nem um olheiro de campo atual.
- **Finanças:** projeção semanal = soma dos contratos; extrato com "Multa da comissão" (`staffSeverance`).
- **Rostos (31b):** cartão (48px), ficha (64px) e lista de livres (32px) com o rosto `facesjs` do profissional (`StaffFace`, `GET /api/faces/person/:id.svg`, idade e nacionalidade; camisa do clube, neutra na lista). Ver `.claude/rules/ui-world.md` → "Rostos da comissão e dos técnicos".
- `StaffStars` (`Staff/StaffStars.tsx`): 5 ícones `star` / `star-half` / `star-filled` (via `Icons.tsx`) e o número.
- i18n `staff.*`, `staffPool.*`, `transfers.staffTab`, `inbox.contract.staff_*`,
  `financesScreen.ledgerText.staffSeverance` (en, pt-BR).

## `/test`, `/lab`

Sem efeito dentro da partida (evolução, recuperação entre jogos, lesão e familiaridade).

- `/lab`: `Variant.fitnessCoachStars` (slider 1–5 em meias, 0 = tier, rótulo `3.5★`) → `withFitnessCoach` (lesões no
  motor e no quickSim, recuperação entre os jogos da congestão). O médico não aparece (a congestão não simula o tempo
  fora).
- `/test`: o `EnergyPanel` mostra `recovery x / injury x` do staff de cada time; os elencos do `/test` não têm
  finanças (tier LOW).
- `Statistics.ts`: nada novo.

## Custo da comissão (`bun scripts/staff-bill.ts`)

Folha antiga (auxiliar, físico e olheiro na nota implícita, `staffWeeklyWage` × 3) × nova (`initialStaff`), mundo de
2026-10-08, 1273 clubes, contra a receita anual (`wageRevenueBasisOf`). Mediana por tier:

| Tier | clubes | membros | antiga / receita | nova / receita (p90) | nova / antiga |
|---|---|---|---|---|---|
| LOW | 305 | 10 | 11,3% | 3,6% (9,4%) | 0,32 |
| MEDIUM | 706 | 10 | 12,1% | 3,8% (8,5%) | 0,33 |
| HIGH | 222 | 11 | 7,3% | 2,7% (4,4%) | 0,37 |
| ELITE | 40 | 12 | 4,2% | 1,7% (2,8%) | 0,41 |

A folha antiga já comia ~12% da receita do clube mediano: a curva paga um profissional de nota r como um jogador de
nota `3 + 0,35r`, bem acima dos jogadores de um clube pequeno. Com as parcelas do desenho (1 / 0,7 / 0,4 / 0,3 / 0,1)
a nova ficava em ~21% (MEDIUM, 1,8× a antiga). Decisão do usuário: teto de ~4% da receita; `WAGE_ROLE_SHARE` foi
escalado por 0,18 (auxiliar e olheiros 0,18 · físico 0,126 · goleiros, treinadores e médico 0,072 · analista 0,054 ·
jardineiro 0,018). A comissão de 10–12 profissionais fica mais barata que as 3 funções de antes.

## Testes

```
bun test src/Domain/staff src/backend/staff.routes.test.ts src/backend/staff.advanceDay.test.ts \
  src/backend/scouting.routes.test.ts src/Domain/finance src/Domain/advanceDay src/lab src/GameInterface
```

`scripts/season-rollover-smoke.ts`, seção "Equipe técnica": todas as funções preenchidas e treinadores no limite; nenhum
contrato vencido no fim; o contrato do analista, forçado a acabar na temporada, renovado pelo diretor (ou avisado); um
treinador demitido pela rota depois da primeira semana (linha `staff` `severance` negativa, de volta à lista) e outro
contratado da lista; o goleiro titular com `reflex` ou `jump` mudados; a linha `staff` de cada segunda = soma dos
contratos; nenhum clube da IA com `staff`.

## Personalidade (Etapa 26)

`obscurePlayer` também grava `personalityView` (traços ± ruído × 4, temperamento e profissionalismo "?" com ruído
≥ 1). Ver `.claude/rules/game/personality.md`. Desde a 4.3 o ruído é o do jogador (conhecimento, `scouting.md`).

## Nacionalidades e conhecimento por país (5.0)

- **Origem** (`src/Domain/staff/staffOrigin.ts`, `src/backend/staffNameBook.ts`): um livro de nomes por país dos 60 de
  `countries.json`, com nomes e sobrenomes dos jogadores do mundo base daquela nacionalidade (`Czechia`, `Türkiye`,
  `United States` contam para o país do jogo; com menos de 15 nomes, completa com os jogadores dos clubes do país),
  lido uma vez por processo. A comissão inicial do clube (`initialStaff`, criação e troca de clube) nasce 80% do país do
  clube e o resto de outro país do continente; a lista de livres (`generatePool`/`refreshPool`) sorteia entre todos os
  países com peso clubes^0,5. RNG próprio (`staff-origin:<chave>`): os atributos não mudam. Sem o livro (testes,
  `/lab`): as 8 listas embutidas de `staffNames.ts`.
- **Olheiros** (`scout`, `fieldScout`) guardam `countryKnowledge` (conhecimento por país, `scouting.md`); o campo vai com
  o profissional para a lista de livres. `GET /staff` e `/staff/pool` trazem `strongCountry`; a coluna "Forte em" da
  aba Comissão e os cartões mostram o país forte; a ficha de um olheiro abre o mapa de países
  (`GET /api/saves/:id/staff/:memberId/countries`).

## Trocar com a função cheia (8.7.10)

Report do usuário. Com a função no limite, a janela de contratação lista quem está nela (estrelas, salário, fim do contrato, multa de hoje); escolher um troca os dois num passo só: `POST /staff/hire { memberId, years, replaceId }` dispensa o escolhido (multa no extrato, volta à lista de livres, áreas liberadas, missão cancelada se olheiro de campo) e contrata o novo no mesmo `BufferingSaveDAL`. `replaceId` de outra função ou fora da comissão: 404 `notYourStaff`.

## Comissão de confiança e cursos (10.7)

Report de tester, desenho aprovado pelo usuário (3 profissionais, o técnico paga, ausente durante o curso). Lógica pura em `src/Domain/staff/trustedStaff.ts` (`TRUSTED`, com teste); só o clube do jogador.

- **Confiança:** `StaffMember.trusted`, até `TRUSTED.MAX` (3), qualquer função. `PUT /api/saves/:id/staff/trusted { memberId, trusted }` (404 `notYourStaff`, 409 `trustedFull`). O diretor sempre renova um profissional de confiança (a idade continua valendo). Demitido ou com o contrato encerrado, ele volta à lista de livres sem a marca.
- **Segue o técnico:** ao sair de um clube (troca, demissão, fim de contrato, pedido de demissão), `releaseHumanClub` guarda os de confiança, sem contrato, em `SeatState.trustedStaff`. Ao assumir um clube, `takeOverClub` → `joinNewClub`: cada um toma o lugar do mais fraco da função dele na comissão inicial (ou uma vaga livre da função) e assina por `NEW_CLUB_YEARS` (2) temporadas com o salário do clube novo. Quem não tem lugar (a função já cheia de outros de confiança) fica de fora.
- **Curso:** `POST /api/saves/:id/staff/course { memberId }`, pago da carteira do técnico (`managerSpent`, apostas abertas descontadas): `COURSE_DAYS` (60) dias, +`STAR_GAIN` (0,5) estrela na especialidade (a da função; no treinador de área, a melhor área; `withStarGain` sobe o conhecimento e, no teto, os atributos gerais; nunca passa de 5). Preço pelas estrelas de hoje: até 3★ €150 mil, 3,5★ €300 mil, 4★ €600 mil, 4,5★ €1,2 milhão. Recusas (409): `notTrusted`, `onCourse`, `courseBusy` (um por vez no clube), `atBest`, `tooSoon` (um curso a cada 365 dias por profissional), `contractEnds` (o contrato acaba antes do fim do curso), `onMission` (lidera uma missão de observação), `noMoney`. Guarda de lobby nas duas rotas.
- **Ausente:** com `course`, ele não conta em `membersOf` / `headOf` / `resolveAreaAssignments`: a função vale como vaga (2★) e a área dele fica sem responsável (×0,4) ou vai para outro treinador. O salário continua. Um olheiro em curso não lidera missão.
- **Volta:** no avanço do dia (junto dos contratos da comissão), `settleCourses` aplica o ganho no dia `until`; mensagem `contract` / `staff_course_done`. Um curso que acaba enquanto ele espera sem clube é concluído quando ele entra no clube novo.
- **Tela:** ficha do profissional (bloco Confiança: marcar, tirar, curso com preço, carteira e o motivo quando não pode; confirmação antes de mandar), selo "De confiança" e "Em curso até" no cartão, "De confiança: N de 3" no topo da Equipe técnica, treinador em curso indisponível no seletor das áreas. `GET /staff` devolve `trusted { used, max }`, `wallet` e, por profissional de confiança fora de curso, `courseOffer`.
- A IA não usa nada disso. Testes: `bun test src/Domain/staff/trustedStaff.test.ts src/backend/staffTrusted.routes.test.ts`.
- Limitações: os de confiança não envelhecem enquanto esperam sem clube; o curso não escolhe a área do treinador (sempre a melhor); quem sai do mundo (liga de amigos) perde a lista.

## Contrato perto do fim na tela (10.7)

Report de tester. `GET /staff` devolve `endsInDays` em cada profissional com contrato a até `STAFF.CONTRACT.RENEW_WINDOW_DAYS` (60) dias do fim: linha em âmbar no cartão e um aviso no topo da Equipe técnica com os nomes (`staff.expiring.*`).

## Treinador da base (12.1)

Desenho aprovado pelo usuário. Só o clube do jogador; a IA não tem base nem a função.

- **Função:** `youthCoach` (especialidade `youth`), um por clube (`STAFF.LIMITS.other`), contratado da lista de livres como os outros, com estrelas, contrato e salário (`WAGE_ROLE_SHARE` 0,072, como o preparador de goleiros). Entra na comissão inicial (`initialStaff`). Lista de livres: 20 (`POOL.BY_ROLE`), total 320. Fica no fim de `STAFF_ROLES` (no meio mudaria o sorteio das estrelas da lista) e no grupo Treino da tela.
- **Saves antigos:** a lista de livres gravada sem a função recebe a cota dela na primeira leitura (`topUpMissingRoles`, `staffPool.ts`, chamado por `SaveService.getStaffPool`; determinístico por save e função; uma lista com pelo menos um da função não muda). O clube fica com a função vaga até contratar.
- **Efeito** (`StaffEffects.academyDevMult`, `academyDevMultOf`, curva `STAFF.YOUTH_COACH_DEV` 0,92 / 1 / 1,08 em 1★ / 3★ / 5★; vago ou em curso = 2★ = 0,96; clube sem comissão = 1): multiplica a DP de crescimento de quem está na base (`squad.youth`) no treino diário da base (`trainAcademy`) e nos jogos de base (`youthDpMult(..., academy)`). Inteiro, sem a metade de `CLUB_BONUS_SHARE`. Nunca o time principal (nem um jogador do elenco num jogo de base), nunca o declínio. Com 3★ os números são os de antes (testes).
- **Responsabilidade** `Responsibilities.youth` (`manager` padrão, `coach`; bloco Base da aba Responsabilidades). Só vale com um treinador da base contratado e fora de curso (`youthCoachOnDuty`); sem ele nada acontece e o que o técnico configurou fica.
- **Convocações** (`coachCallUps`, `src/Domain/youth/youthCoach.ts`; no avanço do dia `coachCallUpsToday`, `src/backend/youthCoachWorld.ts`, antes do `playYouthDay`): num dia em que o clube tem jogo do sub-21 ou sub-19 e não joga pelo time principal, ele refaz as próprias convocações da idade (duração `next`, `byCoach: true`): jogadores do elenco com idade para o time (≤ 21 / ≤ 19), fora do XI salvo (sem XI salvo, o XI automático), disponíveis, com fôlego ≥ 70 e com menos jogos na temporada que metade dos jogos do mais usado do elenco (`seasonLog.appearances`; antes de alguém jogar, todos valem). Menos jogos primeiro, depois a melhor nota; até 6 por idade (`YOUTH_COACH.MAX_CALL_UPS`), nunca passando de 11 na idade, nunca repetindo um convocado do técnico. O sub-19 vem antes, e quem foi chamado para ele fica fora do sub-21 do mesmo dia. As entradas do técnico não mudam; as do treinador são gastas pelo jogo como qualquer `next` (`advanceCallUps`). Jogo adiado: ficam até o dia do jogo, quando são refeitas.
- **Treino da base** (`coachTrainingPlan`, toda segunda, antes do treino do dia; `coachMondaySquad`): intensidade do grupo pelo fôlego médio da base (≥ 80 pesado, ≥ 65 normal, senão leve) e, por jovem, o foco = a área mais fraca (menor média dos atributos da área, `CATEGORY_STATS`) entre as que importam para a posição natural (peso de DP ≥ 0,15 em `dpWeightsFor`). Ele marca o que escreve (`YouthTrainingPlan.intensityByCoach`, `players[id].byCoach`) e só reescreve o que está ausente ou marcado: uma intensidade que o técnico já gravou (qualquer plano salvo sem a marca) e um jovem com foco ou posição de treino do técnico ficam como estão. O foco do grupo e a posição de treino nunca são dele. Ao salvar o plano (`PUT /youth/training` → `managerSavesPlan`), o que o técnico mudou perde a marca e o que ele deixou igual a mantém.
- **Telas:** cartão na Equipe técnica com "Evolução da base +5%" (`staff.effects.youthCoach`, o mesmo texto na vaga); Mercado → Comissão lista e filtra a função. Na aba Base, com o treinador no comando (`coach` em `GET /youth` e `GET /youth-callups`), uma linha no topo de cada bloco e "pelo treinador da base" ao lado do que ele fez (`youthCoach.*`). Sem mensagem na caixa de entrada.
- **Arquivos:** `src/Domain/youth/youthCoach.ts` (+ teste), `src/backend/youthCoachWorld.ts`, `src/backend/advanceDay.ts` (convocações antes dos jogos de base, plano na segunda), `src/Domain/staff/staff.ts`, `staffPool.ts`, `staffConfig.ts`, `src/Domain/responsibilities/director.ts`, `src/backend/youthRoutes.ts`, `youthCompRoutes.ts`, `src/GameInterface/Staff/ResponsibilitiesPanel.tsx`, `Components/YouthTable.tsx`, `Squad/YouthCallUpsPanel.tsx`.
- **Testes:** `bun test src/Domain/youth/youthCoach.test.ts src/backend/youthCoach.advanceDay.test.ts src/Domain/staff src/Domain/youthComps/youthMatch.test.ts src/Domain/advanceDay/dailyTraining.test.ts src/Domain/responsibilities src/backend/responsibilities.routes.test.ts`.
- **Limitações:** as convocações do treinador nascem no dia do jogo, então o técnico só as vê na tela quando o jogo foi adiado (para barrar um jogador, ele precisa estar no XI salvo); "joga pouco" conta jogos, não minutos; num save com plano de treino já gravado a intensidade continua do técnico; um jovem que o técnico volta para "foco do grupo" recebe de novo o foco do treinador na segunda seguinte; sem medição de ritmo própria (o efeito é ±8% sobre a DP da base, dentro do que a 11.2 mediu).
