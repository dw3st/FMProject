# Patrocinadores (12.0)

Pedido do usuário (2026-11-13), decisões dele: os patrocínios **substituem** a receita comercial semanal do clube humano; a IA ganha só os nomes (sem dinheiro); o patrocinador máster aparece na página do clube e na prévia da partida, e todos nas placas de LED; tudo numa versão.

## Regra

- Só o **clube humano** (cada assento) tem contratos: `Squad.sponsors` (`ClubSponsors`). A IA não grava nada: os patrocinadores de um clube da IA são derivados do id do clube + temporada (`aiSponsorsOf`), só nomes, para as placas e a página do clube.
- **Vagas** (`SPONSORS.SLOTS`): `master` (1, parte 0,50 da base), `kit` (fornecedor de material, 1, parte 0,25), `board` (placas, 4, parte 0,0625 cada). Soma = 1.
- **Base** = `finances.commercial` do clube (continua existindo e sendo atualizada na virada como hoje: tier, redes sociais). `clubAnnualRevenue`, `wageRevenueBasis` e a IA continuam lendo `finances.commercial`: nada disso muda.
- **Receita semanal** (segunda, lançamento `commercial` do extrato): com `Squad.sponsors` presente = soma de `contract.annual / 52` dos contratos ativos (arredondado); ausente (save de antes, até a próxima virada do país do clube) = a regra antiga (`finances.commercial / 52`). Vaga vazia não rende.
- **Empresas:** catálogo `src/example_data/sponsors.json` (runtime `src/Data/sponsors.json`), ~1000 empresas inventadas: `{ id, name, sector, size: "local" | "national" | "global", country?, funny?, colors: [fundo, texto] }`. `local` e `national` têm `country` (nome do país como no `leagueData`); `global` não. Lido só no servidor (`src/backend/sponsorCatalog.ts`), uma vez por processo.
- **Quem pode propor a quem:** `global` só a clubes de tier natural HIGH/ELITE; `national` a MEDIUM ou acima, do mesmo país (ou qualquer país se ELITE); `local` só do mesmo país, a LOW/MEDIUM (e placas de qualquer clube). Sem empresa que sirva no país: cai para as `global`/`national` de qualquer país.

## Propostas

Geradas (determinísticas: `seedFrom("sponsors:<save>:<clube>:<temporada>:<vaga>")`):
- na criação da carreira / entrada num mundo / troca de clube (`takeOverClub`): todas as vagas;
- na virada do país do clube: para as vagas vazias depois da avaliação (abaixo).

Por vaga vazia: máster 3 propostas, material 2, placas 6 para as 4 vagas (menos se há placas ocupadas: vagas livres + 2).

```
atrativo  = clamp(1 + 0,10 × campanha + 0,08 × redes + 0,05 × técnico + 0,04 × craques, 0,7, 1,3)
  campanha = 1 − 2 × (posição − 1)/(n − 1) da última temporada da liga (0 sem temporada)
  redes    = +1 em alta, 0 estável, −1 em baixa (heatOf de fanbase.md; 0 sem tendência)
  técnico  = (reputação − 50)/50, limitado a ±1
  craques  = min(1, jogadores do top 25 do mundo no elenco / 3)
perfil    = "safe" | "standard" | "demanding" (sorteado; as propostas de uma vaga nunca têm todas o mesmo perfil)
  fixo:   safe 0,90 · standard 0,95 · demanding 1,00   (× base × parte × atrativo × ruído 0,95..1,05)
  bônus:  safe 0,05 · standard 0,15 · demanding 0,30   (da mesma conta, pago na virada se a meta for cumprida)
tamanho da empresa: local × 0,9 · national × 1 · global × 1,08
anos: 1..3 (sorteado; demanding nunca 1)
```

Um clube mediano com atrativo 1 e propostas `standard` ganha 0,95 × base fixo + 0,15 de bônus: perto da receita de hoje; a faixa total vai de ~0,6 a ~1,4 da base.

**Metas** (`SponsorGoal`), pela meta da diretoria da temporada (`target`, posição): 
- `league_position { max }`: safe `min(n, target + 3)`, standard `target`, demanding `max(1, target − 3)`;
- `continental`: terminar em zona continental (só oferecida a demanding quando a liga tem zona e o `target` está a até 4 posições dela);
- `cup_stage { stage }`: chegar às quartas (standard) ou semifinal (demanding) da copa nacional;
- `promotion`: subir (só em divisão com acesso, demanding);
- `followers_growth { pct }`: seguidores crescerem 3% (standard) ou 6% (demanding) na virada;
- `attendance { avg }`: público médio em casa ≥ 90% (standard) ou 100% (demanding) do público médio da temporada anterior (só com histórico de público).
Máster e material usam metas de liga/continental/copa/acesso; placas usam qualquer uma (inclusive público e seguidores).

**Responder** (`POST /api/saves/:id/sponsors/offers/:offerId { action: "accept" | "decline" | "negotiate" }`):
- `accept`: vira contrato (vaga livre: senão 409 `slotTaken`); as outras propostas da mesma vaga única (máster, material) caem; nas placas, só quando as 4 enchem.
- `negotiate` (uma vez por proposta): sorteio determinístico por proposta: 45% a empresa sobe o fixo em 8% (a proposta fica na mesa, marcada `negotiated`), 35% mantém, 20% retira a proposta. Diretoria não entra.
- As propostas valem `OFFER_DAYS` (21) dias. Vencidas com a vaga ainda vazia: o diretor fecha a de maior valor fixo (mensagem `auto_signed`). Assim ninguém fica sem receita por esquecer.
- 409 `noClub`, `lobby` (guarda de lobby); 404 proposta desconhecida.

## Virada do país do clube (depois da avaliação da diretoria)

Para cada contrato: 
1. meta cumprida → bônus no extrato (`commercial`, `ref.stage = "sponsor_bonus"`, na temporada nova) ;
2. `seasonsLeft − 1`;
3. **saída antecipada**: rebaixado, ou meta de posição falhada por 6 ou mais posições → a empresa rompe (contrato sai, sem multa);
4. contrato no fim (`seasonsLeft = 0`): meta cumprida → proposta de renovação da mesma empresa com fixo × 1,10 (entra entre as propostas da vaga, marcada `renewal`); falhada por pouco (até 2 posições, ou meta não posicional) → renovação com fixo × 0,90; senão a empresa sai.
5. Vagas vazias recebem propostas novas.
Mensagem de inbox `sponsor` / `season_review` (uma por virada: bônus pagos, quem renovou a proposta, quem saiu) e `offers` (propostas novas), tópico `actions` (pede decisão), gravadas depois do `clearInbox`.

## Troca de clube / saída

`releaseHumanClub` apaga `Squad.sponsors` (o clube vira IA: nomes derivados). `takeOverClub` cria `sponsors` com propostas para todas as vagas. Start kits não carregam (`stripHumanOnly`); `applyRandomStartKit` restaura como o `staff`.

## Saves de antes da 12.0

Sem `Squad.sponsors`: receita comercial antiga até a próxima virada do país do clube, quando `sponsors` nasce com propostas para todas as vagas (sem avaliação). Sem migração, nenhum campo obrigatório novo; `MIN_COMPATIBLE_SAVE_VERSION` não muda.

## Onde aparece

- **Rotas:** `GET /api/saves/:id/sponsors` → `{ slots, contracts, offers, base, weekly, appeal }` (com nome, ramo, cores da empresa, meta, progresso da meta hoje quando calculável); `POST …/offers/:offerId`.
- **Finanças → aba/painel Patrocínios**: contratos por vaga (empresa, valor por temporada, bônus, meta com situação, temporadas restantes), propostas na mesa (aceitar, negociar, recusar), vagas vazias em destaque.
- **Caixa de entrada**: mensagens `sponsor` com link para o painel.
- **Página do clube (Visão geral)** e **prévia da partida**: patrocinador máster (humano: contrato; IA: derivado).
- **Placas de LED** dos jogos em casa: `match-setup` → `crowd.sponsors: { name, colors, weight }[]` do mandante (máster peso 3, material 2, placas 1; IA: derivados); `ledAdFor` sorteia entre eles em ~60% dos painéis e os anúncios genéricos no resto. Só desenho.
- `/test`, `/lab`: sem efeito de partida (só as placas, desenho): nada novo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/types/sponsorTypes.ts` | `SponsorCompany`, `SponsorSlot`, `SponsorGoal`, `SponsorOffer`, `SponsorContract`, `ClubSponsors`, `SponsorsView` |
| `src/Domain/sponsors/sponsorConfig.ts` | Constantes (`SPONSORS`) |
| `src/Domain/sponsors/sponsors.ts` (+ teste) | Puro: atrativo, elegibilidade das empresas, geração de propostas, aceitar / negociar, vencimento, avaliação da virada, receita semanal, `aiSponsorsOf` |
| `src/backend/sponsorCatalog.ts` | Leitura do catálogo |
| `src/backend/sponsorWorld.ts`, `sponsorRoutes.ts` | E/S: contexto do clube, dia (vencimento), virada, rotas |
| `scripts/sponsors/buildSponsors.ts` (+ partes) | Gera o catálogo |
