# Naturalização

Spec: `docs/superpowers/specs/2026-11-25-naturalization-design.md`. Versão **12.44**. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- Um estrangeiro (nenhuma das nacionalidades dele é do país do clube; Inglaterra conta País de Gales, como na inscrição) pode pedir a nacionalidade do país do clube por um de dois caminhos:
  - **residência:** `RESIDENCE_SEASONS` (5) temporadas seguidas em clubes do país, empréstimos incluídos (linhas do histórico e a temporada em andamento, se já começou para ele); uma temporada fora zera a sequência;
  - **formação:** a partir de `FORMED_MIN_AGE` (18), saiu da base de um clube do país (`academyOf` ou o id `youth_<clube>_…`) ou tem 3 temporadas formativas no país até os 21 (`formativeSeasons` da inscrição).
- Nunca pede quem já tem segunda nacionalidade, já está em processo ou já jogou pela seleção principal (`national.caps > 0`, preso a ela).
- **Interesse:** na virada do país do clube, cada elegível sorteia uma vez por temporada (`natur:<id>:<ano>`) com chance `BASE` 0,2 + `LOYALTY` 0,2 × t_lealdade + `NEW_PLACE` 0,3 (entraria nos 23 da seleção nova) − `ORIGIN_PLACE` 0,3 (está nos 23 da seleção de origem), entre 0,05 e 0,85. Os 23 vêm de `pickCallUp` sobre o mundo.
- **Clube da IA:** o processo começa na hora. **Clube humano:** o assento recebe o pedido (`SeatState.naturalizationAsks`, inbox `player` / `naturalization`, tópico ações) e responde em `ASK_DAYS` (30) dias; sem resposta conta como apoio. Apoiar: moral +3 e o processo começa. Não apoiar: moral −4 e ele não pede de novo na temporada.
- **Processo:** `PROCESS_MIN_DAYS`..`PROCESS_MAX_DAYS` (90–180) dias, sorteados (`natur-days:<id>:<ano>`). No dia `until` ele ganha `secondNationality` (inbox `naturalized`, tópico desenvolvimento). Se o clube dele deixa de ser do país, o processo cai.
- **Efeitos da segunda nacionalidade:**
  - inscrição: doméstico por qualquer das duas (`nationsOf`, `foreignByNation`, `isForeign`, `foreignBasis`); na La Liga uma segunda nacionalidade da UE também basta;
  - seleções: candidato pelas duas até a primeira convocação com jogo; no sorteio dos 23 fica só na seleção em que ranqueia melhor (`keepBestNation`).
- Sem migração: jogadores sem os campos simplesmente não têm.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/naturalization/naturalizationConfig.ts` | Constantes (`NATURALIZATION`) |
| `src/Domain/naturalization/naturalization.ts` (+ teste) | Requisitos, chance, sorteios, processo, `candidateNations` |
| `src/Domain/registration/formed.ts` | Dupla nacionalidade na inscrição |
| `src/Domain/national/nationalSquad.ts`, `src/backend/nationalWorld.ts` | `keepBestNation` e o pool por nação |
| `src/backend/naturalizationWorld.ts` | E/S: pedidos na virada, resposta, fim dos processos, pedidos vencidos |
| `src/backend/naturalizationRoutes.ts` (+ `naturalization.routes.test.ts`) | Rota |
| `src/backend/advanceDay.ts` | Passo 7c da virada, processos e pedidos vencidos no mercado do dia, mensagens |
| `src/GameInterface/Morale/NaturalizationBody.tsx` | Corpo da mensagem (Apoiar / Não apoiar) |
| `scripts/naturalization-measure.ts` | Medição |

## Rota

`POST /api/saves/:saveId/naturalization/:playerId { support: boolean }` (`requireSeat`, `withSaveLock`, guarda de lobby): 400 `invalidBody`, 404 `noRequest` (sem pedido aberto ou o jogador saiu), 409 `noClub`, 413 `tooLarge`.

## Telas

- Caixa de entrada: o pedido com Apoiar / Não apoiar e o prazo; o aviso de nacionalidade concedida.
- Ficha: a segunda bandeira no cartão de nacionalidade e a linha "Naturalização em andamento até <data>".
- Elenco e Olheiro: a segunda bandeira ao lado da primeira.
- i18n `naturalization.*`.

## Medição (`bun scripts/naturalization-measure.ts [dir] [temporadas] [saída por temporada]`)

O mundo base não tem histórico: o script projeta 12 temporadas, cada estrangeiro ganha uma linha por temporada no clube ou (25% por temporada, e sempre quem pediu) é trocado por um estrangeiro novo sem anos no país. Mundo de `src/Data/squads` (1273 elencos, 10 091 estrangeiros):

| Chance base | 1ª onda (2032) | Regime (2035–2038) | Mediana por liga no regime |
|---|---|---|---|
| 0,25 (spec) | 5,2% | 2,9–3,2% | 2,7–2,9% |
| **0,2** (adotado) | 4,2% | 2,7% | 2,2–2,6% |

A 1ª onda é artefato da projeção (todo mundo começa sem histórico e completa 5 temporadas no mesmo ano). Ligas pequenas variam muito (poucos estrangeiros).

## Testes

`bun test src/Domain/naturalization src/backend/naturalization.routes.test.ts`.

## Limitações

- A IA não recusa nem atrasa processos.
- Sem nacionalidade por casamento ou ascendência; sem troca de seleção depois de jogar.
- A chance usa os 23 do dia da virada.
