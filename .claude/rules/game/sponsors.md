# Patrocinadores

Spec: `docs/superpowers/specs/2026-11-13-sponsors-design.md`. Versão **12.0**. Pedido do usuário. Visual: `.claude/rules/ui-standard.md`. Sem efeito de partida (só as placas, desenho): nada em `/test` nem `/lab`.

## Regra

- Só o **clube humano** (cada assento) tem contratos: `Squad.sponsors` (`ClubSponsors { contracts, offers }`). A IA não grava nada: os patrocinadores de um clube da IA são nomes sorteados do id do clube + temporada (`aiSponsorsOf`), para as placas e a página do clube. As finanças da IA não mudam.
- Os patrocínios **substituem** a receita comercial semanal do clube humano. `finances.commercial` continua existindo como **base** (atualizada na virada como antes: tier e redes sociais); `clubAnnualRevenue`, `wageRevenueBasis` e a IA continuam lendo esse campo.
- **Vagas** (`SPONSORS.SLOTS`): `master` 1 (parte 0,50 da base), `kit` 1 (0,25), `board` 4 (0,0625 cada). Soma 1.
- **Segunda-feira** (linha `commercial` do extrato): com `Squad.sponsors` = soma de `annual / 52` dos contratos (`ref.stage = "sponsors"`; sem contrato nenhum, nenhuma linha); sem o campo (save de antes da 12.0) = a regra antiga, `finances.commercial / 52`, sem `ref`. Vaga vazia não rende.
- Um clube sem `Squad.sponsors` se comporta exatamente como antes: nenhum sorteio novo no dia.
- Ciclo de vida igual ao das instalações: criado no `createSave` e no `takeOverClub` (propostas para todas as vagas), apagado no `releaseHumanClub`, fora dos kits (`stripHumanOnly`), restaurado pelo `applyRandomStartKit`. Sem migração; `MIN_COMPATIBLE_SAVE_VERSION` não mudou.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/sponsorTypes.ts` | `SponsorCompany`, `SponsorBrand`, `SponsorSlot`, `SponsorGoal`, `SponsorOffer`, `SponsorContract`, `ClubSponsors`, `SponsorsView`, `SponsorBoard`, `MasterSponsor` |
| `src/Domain/sponsors/sponsorConfig.ts` | Constantes (`SPONSORS`) |
| `src/Domain/sponsors/sponsors.ts` (+ teste) | Puro: atrativo, elegibilidade, propostas, aceitar / recusar / negociar, vencimento, avaliação da virada, receita semanal, `aiSponsorsOf`, placas, progresso das metas |
| `src/Domain/sponsors/sponsorMessages.ts` | Inbox `sponsor` (`buildSponsorMessage`) |
| `src/backend/sponsorCatalog.ts` (+ teste) | Catálogo: `src/Data/sponsors.json`, senão `src/example_data/sponsors.json`, senão uma lista embutida de 16 empresas |
| `src/backend/sponsorWorld.ts` | E/S: contexto do clube (`sponsorContext`), `createClubSponsors`, `sponsorRollover`, `sponsorsView`, `masterSponsorOf`, `sponsorBoardsOf` |
| `src/backend/sponsorRoutes.ts` (+ `sponsors.routes.test.ts`) | Rotas |
| `src/backend/advanceDay.ts` (+ `sponsors.advanceDay.test.ts`) | Vencimento do dia, virada, mensagens adiadas (`DaySeat.deferred.sponsor`), mensagem das primeiras propostas no `/presimulate` |
| `src/Domain/advanceDay/financial.ts` | Linha semanal `commercial` |
| `scripts/sponsors/buildSponsors.ts` | Gera o catálogo |

## Empresas

Catálogo de empresas inventadas: `{ id, name, sector, size: "local" | "national" | "global", country?, funny?, colors: [fundo, texto] }`, lido só no servidor, uma vez por processo. Proposta e contrato guardam uma cópia da empresa (`SponsorBrand`): as telas nunca precisam do catálogo.

Quem propõe a quem (`companyEligible`, tier natural do clube): `global` só HIGH / ELITE; `national` MEDIUM ou acima, do mesmo país (qualquer país se ELITE); `local` do mesmo país, LOW / MEDIUM (e placas de qualquer clube). Empresa sem `country` serve a qualquer país. Faltando empresas para a vaga (`eligibleCompanies`): entram as `global` / `national` de qualquer país e, por último, qualquer uma.

## Propostas

Geradas por `generateOffers` (semente `sponsors:<save>:<clube>:<temporada>:<vaga>`, temporada = ano da liga) para cada vaga com lugar livre e sem proposta na mesa (renovação não conta): máster 3, material 2, placas lugares livres + 2. Uma empresa que já está no clube (contrato ou proposta) nunca vem de novo.

```
atrativo = clamp(1 + 0,10 × campanha + 0,08 × redes + 0,05 × técnico + 0,04 × craques, 0,7, 1,3)
  campanha = 1 − 2 × (posição − 1)/(n − 1) da última temporada da liga (0 sem temporada)
  redes    = +1 em alta, 0 estável, −1 em baixa (heatOf; 0 sem tendência)
  técnico  = (reputação − 50)/50, limitado a ±1
  craques  = min(1, jogadores do top 25 do mundo no elenco / 3)
fixo  = base × parte × atrativo × ruído (0,95..1,05) × tamanho × perfil.fixo
bônus = a mesma conta × perfil.bônus
perfil: safe 0,90 / 0,05 · standard 0,95 / 0,15 · demanding 1,00 / 0,30
tamanho: local 0,9 · national 1 · global 1,08
anos: 1..3 (demanding 2..3)
```

Valores na grade de €1.000 (€100 abaixo de €20 mil). As propostas de uma vaga nunca têm todas o mesmo perfil (a última troca).

**Metas** (`goalOptions`, sorteada entre as que valem; `target` = meta da diretoria):

| Meta | Quem pede |
|---|---|
| `league_position { max }` | todos: safe `min(n, target + 3)`, standard `target`, demanding `max(1, target − 3)` |
| `continental` | demanding, liga com zona continental e `target` até 4 posições depois dela |
| `cup_stage { stage }` | país com copa: standard quartas, demanding semifinal |
| `promotion` | demanding, liga com zona de acesso |
| `followers_growth { pct }` | só placas: standard 3%, demanding 6% |
| `attendance { avg }` | só placas, com público da temporada anterior: standard 90%, demanding 100% dele |

**Responder:** aceitar vira contrato (`seasonsLeft` = anos); as outras propostas da vaga caem quando ela enche (máster e material na hora, placas com as 4). Negociar uma vez por proposta (`negotiationOutcome`, sorteio pelo id da proposta): 45% o fixo sobe 8%, 35% fica, 20% a empresa retira. Proposta vale `OFFER_DAYS` (21) dias; a resposta vale até o próprio dia do prazo.

**Vencimento** (`expireOffers`, todo dia no bloco financeiro do assento, antes da linha de segunda): proposta vencida sai da mesa; com a vaga ainda livre o diretor fecha a de maior fixo entre as vencidas (`auto: true`, mensagem `auto_signed`). Sem sorteio.

## Virada do país do clube

`sponsorRollover`, no laço dos assentos da virada, depois da avaliação da diretoria, dos movimentos de liga e da meta nova. Um assento demitido nesse dia fica de fora. Por contrato (`evaluateSponsorSeason`):

1. meta cumprida → bônus no extrato da temporada nova (`commercial`, `ref.stage = "sponsor_bonus"`, `ref.clubName` = a empresa), por `recordMoney`;
2. `seasonsLeft − 1`;
3. rebaixado, ou meta de posição falhada por 6 ou mais (`EXIT_MISS`) → a empresa sai;
4. no fim (`seasonsLeft = 0`): cumprida → proposta de renovação com fixo e bônus × 1,10; falhada por até 2 posições, ou meta que não é de posição → × 0,90; senão sai. A renovação (`renewal: true`, 2 temporadas) entra entre as propostas; a meta de posição é refeita com a meta nova da diretoria.
5. Vagas com lugar livre recebem propostas novas.

Resultado da temporada: posição final e tamanho da tabela fechada, zona continental da liga antiga, fase alcançada na copa do país (antes de a copa ser regenerada), variação dos seguidores da virada, público médio em casa na janela da temporada (`facilities.attendance`).

Clube sem `Squad.sponsors` (save de antes): o campo nasce aqui, com propostas para todas as vagas, sem avaliação.

## Inbox `sponsor` (tópico `actions`, nunca descartada; tema Clube)

`SponsorInboxMessage`, `kind`: `offers` (`offers: { slot, count }[]`, `expires`), `auto_signed` (`signed: { slot, company, annual, years }[]`), `season_review` (`bonuses`, `renewals`, `left: { slot, company, reason: "relegated" | "missed" }[]`). `offers` sai no `/presimulate` (dono), no `takeOverClub` (troca de clube, entrada num mundo) e na virada; as do dia são adiadas para depois do `clearInbox` e não saem se o assento perdeu o clube no dia.

## Rotas (`requireSeat`)

| Rota | Faz |
|---|---|
| `GET /api/saves/:id/sponsors` | `SponsorsView`: `date`, `slots` (vaga, lugares, parte, ocupados), `contracts` e `offers` com `progress` da meta hoje, `base`, `weekly`, `appeal`, `active` (false = save de antes, ainda na receita antiga). 409 `noClub` |
| `POST /api/saves/:id/sponsors/offers/:offerId { action: "accept" \| "decline" \| "negotiate" }` | `withSaveLock`, guarda de lobby. `{ ok, action, contract?, negotiation?, view }`. 400 `invalidAction`; 404 `notFound` (desconhecida ou vencida); 409 `slotTaken` / `alreadyNegotiated` / `noClub` / `lobby` |

`POST /api/match-setup`: `sponsors: { mine, opponent }` (patrocinador máster de cada lado, `{ name, sector, colors }` ou null) e `crowd.sponsors: { name, colors, weight }[]` do mandante (máster 3, material 2, placa 1; ausente em campo neutro). `GET …/clubs/:squadId/overview`: `masterSponsor`. Clube humano com o campo = os contratos (máster vazio = null); IA e clube humano ainda sem o campo = derivados. `publicSeatSquad` tira `sponsors` do elenco de outro assento.

## Testes

```
bun test src/Domain/sponsors src/backend/sponsorCatalog.test.ts src/backend/sponsors.routes.test.ts \
  src/backend/sponsors.advanceDay.test.ts src/Domain/advanceDay src/Domain/finance
```

## Limitações

- Carreira nova: nenhuma receita comercial até o primeiro contrato (no máximo 21 dias, quando o diretor fecha).
- A meta de um contrato de mais de uma temporada não muda até a renovação.
- O atrativo das primeiras propostas não conhece campanha nem tendência (carreira nova: 0).
- Um contrato assinado perto da virada é avaliado nela como os outros.
- A fase da copa vem das fases já sorteadas (`cup.stages[].entrants`); uma liga que vira antes do fim da copa do país conta até onde o clube chegou naquele dia.
- A rota de elenco de outro clube humano (`GET …/squad/…`) continua devolvendo o elenco inteiro, como já fazia com as instalações.
