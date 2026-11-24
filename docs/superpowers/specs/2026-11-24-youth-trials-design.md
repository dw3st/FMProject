# Peneira de jovens

Report de tester 107866d4. Desenho aprovado pelo usuário em 2026-11-24 (formato A e recompensa A).

## Regra

- Só o clube humano (cada assento). A IA continua com a safra de base de sempre (`youth.md`).
- Sem efeito de partida: nada no `/test` nem no `/lab`.
- Sem migração: campos ausentes = nenhuma peneira, nenhum revelado.

## Marcar

`POST /api/saves/:id/youth/trials { age, size, date }` (`requireSeat`, `withSaveLock`, guarda de lobby).

| Tamanho | Garotos | Custo |
|---|---|---|
| `small` | 20 | 0,2% da receita anual (`wageRevenueBasisOf`) |
| `medium` | 40 | 0,5% |
| `large` | 60 | 1% |

- `age`: 15, 16 ou 17 (a idade dos garotos).
- `date`: de 14 a 28 dias depois de hoje.
- No máximo 2 por temporada da liga do clube (marcadas, não só realizadas) e uma marcada por vez.
- O custo sai na hora: linha `scouting` com `ref.stage = "trial"` no extrato, por `recordMoney`.
- Erros: 400 `invalidTrial` (idade, tamanho, data fora da janela), 409 `trialLimit`, 409 `trialPending`, 409 `noClub`, 409 `lobby`. Sem saldo também marca (como as obras de antes: o saldo pode ficar negativo).
- `DELETE /api/saves/:id/youth/trials/:trialId` cancela antes do dia, sem devolver o custo, e a peneira continua contando no limite.
- Estado em `SeatState.youthTrials` (`YouthTrialState { scheduled?, results?, seasons: { season, count }[] }`).

## O dia

No avanço do dia, para cada assento com peneira marcada para hoje (`youthTrialDay`, depois da base e antes do treino):

- Garotos: `garotos(tamanho) × fama`, gerados por `makeAcademyPlayer` (o mesmo gerador da safra), com a idade escolhida, do país do clube, nomes do livro de nomes do país.
- Nível: média da linha do clube − 2,2 + ruído N(0; 0,5), com o mesmo teto da safra (`YOUTH.LEVEL_CAP`).
- Joia: cada garoto, com chance `0,004 × estrelasTreinador × fama`, vira promessa (+1,0 de nível, teto `PROMISE_CAP`, arquétipo Wonderkid).
  - Multiplicador das estrelas do treinador da base: 1★ ×0,75, 3★ ×1, 5★ ×1,4 (`starCurve`). Sem treinador, 2★.
  - Fama: `1 + 0,25 × revelados` no número de garotos (até ×2) e na chance de joia (até ×2).
  - Sorteio determinístico: `seedFrom(save:assento:data:trial)`.
- O resultado fica em `results` (os garotos inteiros, no servidor) com validade de 14 dias.
- Inbox `youth` / `trial` (tópico `youth`), adiada para depois do `clearInbox`.

## O que o técnico vê

`GET /api/saves/:id/youth/trials`: a peneira marcada, as que ainda dá para marcar na temporada, o custo de cada tamanho e o resultado.

- Cada garoto aparece com a posição, a idade e a faixa do nível e do potencial (`potentialBand`), borradas pelo conhecimento do treinador da base: 1★ k30, 3★ k50, 5★ k70 (o modelo do olheiro, `uncertaintyOf`, `obscureForViewer`).
- Uma joia só leva o selo "Joia" quando o treinador a vê: o alto da faixa de potencial passa da média dos titulares da linha + 0,3, a mesma regra de `isGem` do olheiro.
- Os atributos de verdade nunca saem do servidor.

## Levar para a base

`POST /api/saves/:id/youth/trials/sign { ids }` (até 18).

- O garoto entra em `squad.youth` com o contrato de base de 3 anos, sem compensação.
- Fica marcado: `RosterPlayer.trialOf = { clubId, clubName, date }`.
- Base cheia: entra quem cabe e a resposta lista os que ficaram de fora (`youthFull`).
- Erros: 409 `offerClosed` (resultado vencido ou id que não é da peneira).
- Os garotos que não forem levados somem no vencimento.

## Revelado

Toda segunda, para os jogadores com `trialOf` de um clube humano que ainda não foram revelados (`RosterPlayer.trialRevealed` ausente), em qualquer elenco do mundo, conta o primeiro destes:

- `first_team`: está no elenco principal do clube da peneira com nota (`computeOverallAvg`) ≥ 6,0;
- `world_top`: está no top 100 do mundo (`worldTopIds`, a mesma lista do olheiro);
- `sold`: foi vendido por €10M ou mais (lido na hora da venda, por `squadsAfterAcceptedTransfer`).

A revelação é contada uma vez, para o assento que fez a peneira (`trialOf.clubId` = clube do assento na hora da peneira; o assento é guardado em `trialOf.seatId`). Se esse técnico não estiver mais no mundo, a revelação não conta.

## Recompensa

- **Técnico:** `SeatState.trialReveals { count, top }`. `managerReputation` soma min(5, count + 2 × top): +1 por revelado, +3 por revelado no top 100.
- **Clube:** +2% de seguidores (`finances.followers`) e +3 de torcida (`applyPressEffect`, só no clube do assento), na hora.
- **Fama da peneira:** `Squad.trialFame` (contagem de revelados do clube). Fica com o clube, não com o técnico.
- **Conquistas:** trilha `trial_reveals` (1 / 3 / 8, categoria Base, atributo Base do técnico).
- **Inbox:** `youth` / `trial_revealed`, com o motivo.
- **Ficha:** linha "Revelado na peneira do <clube>, <ano>" e, depois de revelado, o motivo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/youth/trialConfig.ts` | Constantes (`YOUTH_TRIAL`) |
| `src/Domain/youth/trials.ts` (+ teste) | Puro: validação, custo, geração, visão, revelação, reputação |
| `src/backend/youthTrialWorld.ts` | E/S: o dia, a segunda, a venda |
| `src/backend/youthTrialRoutes.ts` (+ teste) | Rotas |
| `src/GameInterface/Squad/YouthTrialsPanel.tsx` | Bloco na aba Base |
| `src/types/youthTrialTypes.ts` | Tipos |

## Testes

- Puro: custo, janela de datas, limite por temporada, número de garotos com a fama, chance de joia com as estrelas, determinismo, faixa pelo treinador, as três formas de revelar, teto da reputação.
- Rota: marcar, cancelar, limite, avançar até o dia (resultado e inbox), levar para a base (base cheia), vencimento, revelação com +reputação, +seguidores e +torcida.
- Medição: `bun scripts/youth-trial-measure.ts` (joias por peneira de cada tamanho e treinador, nível médio dos garotos contra a safra da base).

## Limitações

- Peneira só no país do clube.
- Garotos não levados não ficam no mundo (não viram livres).
- Revelados só contam a partir desta versão.
