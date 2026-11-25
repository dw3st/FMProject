# Naturalização de jogadores

Pedido do usuário em 2026-11-25. Um estrangeiro que mora há tempo no país do clube, ou que foi criado lá, pode pedir a
segunda nacionalidade. Vale também para quem chegou adulto. Sem efeito de partida: nada em `/test` nem `/lab`.

## 1. Quem pode pedir

Um jogador de elenco, ou da base, de qualquer clube do mundo pode pedir quando:

- tem nacionalidade de fora do país do clube (país = o do `leagueData` da liga do clube);
- ainda não tem segunda nacionalidade e não tem um pedido em andamento;
- **não jogou pela seleção principal do país de origem** (`RosterPlayer.national.caps > 0` com a nação de origem: nunca pede);
- cumpre um dos dois caminhos:
  - **residência:** pelo menos `NATURALIZATION.RESIDENCE_SEASONS` (5) temporadas seguidas em clubes do país. Contam as
    linhas do histórico (empréstimos incluídos) e a temporada em andamento, sem buraco entre elas;
  - **formação:** formado no país. Vale quem saiu da base de um clube do país (`clubTrained`: id `youth_<clube>_`,
    `academyOf`) ou tem 3 temporadas em clubes do país até os 21 anos (`formativeSeasons`, a regra da inscrição), e
    tem pelo menos `FORMED_MIN_AGE` (18) anos.

## 2. Interesse

Cumprindo os requisitos, ele decide uma vez por temporada, no sorteio `seedFrom("natur:<id>:<ano>")`:

```
chance = 0,25 + 0,20 × t_lealdade + 0,30 × (vaga na seleção nova) − 0,30 × (vaga na seleção de origem)
```

- O resultado fica entre 0,05 e 0,85.
- `t` é o traço da personalidade de −1 a 1.
- "Vaga na seleção" = o nível dele está entre os 23 primeiros convocáveis da nação (`pickCallUp` sobre os candidatos de
  hoje).
- Quem é titular da seleção de origem quase nunca pede; quem não entra nela e entraria na nova pede muito.

## 3. Quando e como

- **Na virada do país do clube**, junto da aposentadoria e das expirações, cada jogador do país passa pelo teste.
- **Clube da IA:** o pedido segue sozinho.
- **Clube humano:** chega a mensagem `player` / `naturalization` com dois botões, Apoiar e Não apoiar.
  - Vale 30 dias; sem resposta conta como apoio.
  - Apoiar: o jogador ganha +3 de moral.
  - Não apoiar: ele perde 4 de moral e só pode pedir de novo na temporada seguinte.
- **Processo:** começa no dia do apoio e leva de 90 a 180 dias, sorteados. Fica em `RosterPlayer.naturalization`:
  `{ country, since, until }`.
- **No dia do `until`**, no avanço do dia:
  - grava `RosterPlayer.secondNationality = country`;
  - apaga o pedido;
  - manda a mensagem `player` / `naturalized`, só para o clube humano.
- **Transferência para fora do país durante o processo:** o pedido cai.
- O processo não tem custo.

## 4. O que muda para ele

- **Inscrição:** `foreignByNation`, `foreignBasis` e `nationTrained` olham as duas nacionalidades. Ele é doméstico
  quando qualquer uma das duas é doméstica (ou da UE, nas regras `nonEU`). Ou seja: deixa de contar como
  extracomunitário em La Liga e na Ligue 1 e como um dos 9 estrangeiros por jogo do Brasileirão.
- **Seleção:**
  - entra na lista de convocáveis da nação nova (`nationalWorld.ts`: candidato pelas duas nacionalidades), e também da
    de origem enquanto não jogar pela nova;
  - o primeiro jogo por uma das duas o prende a ela (`RosterPlayer.national.nation`), como na regra da FIFA;
  - a convocação escolhe a nação em que ele está melhor colocado.
- **Telas:**
  - a segunda bandeira ao lado da primeira na ficha, no Elenco e no Olheiro;
  - na ficha, a linha "Naturalização em andamento até <data>";
  - na aba Inscritos, o selo Estrangeiro some.

## 5. Dados e rotas

- `RosterPlayer.secondNationality?: string`
- `RosterPlayer.naturalization?: { country: string; since: string; until: string }`
- `SeatState.naturalizationAsks?: { playerId, country, expires }[]` (os pedidos esperando resposta)
- `POST /api/saves/:id/naturalization/:playerId { support: boolean }`
  - erros: 404 `noRequest`, 409 `noClub`;
  - com `withSaveLock` e guarda de lobby.
- O aposentado leva a segunda nacionalidade (`toRetiredRecord`).
- Sem migração.

## 6. Arquivos

| Arquivo | Papel |
|---|---|
| `src/Domain/naturalization/naturalizationConfig.ts` | Constantes (`NATURALIZATION`) |
| `src/Domain/naturalization/naturalization.ts` (+ teste) | Puro: requisitos, chance, sorteio, aplicação |
| `src/Domain/registration/formed.ts` | As duas nacionalidades nas regras de estrangeiro |
| `src/backend/naturalizationWorld.ts` | E/S: passo da virada, passo do dia, rota |
| `src/backend/nationalWorld.ts` | Candidato pelas duas nacionalidades e a regra do primeiro jogo |
| `src/GameInterface/Components/Flag*`, ficha, mensagem | Telas |

## 7. Testes e medição

- **Puros:**
  - residência de 5 temporadas seguidas (um buraco zera a contagem);
  - formação pela base e por 3 temporadas até 21;
  - jogador preso à seleção de origem nunca pede;
  - a chance dentro dos limites;
  - duas nacionalidades na inscrição: Brasileirão, La Liga e MLS.
- **Rota:** apoiar, não apoiar, 404, e o pedido que vence vira apoio.
- **Avanço do dia:** o processo termina no `until` e a segunda bandeira aparece.
- **Medição** (`scripts/naturalization-measure.ts`, sobre o mundo de um save adiantado):
  - quantos jogadores cumprem os requisitos e quantos pedem por temporada, por liga;
  - quantos deixam de ser estrangeiros no Brasileirão, em La Liga e na Ligue 1.
  - Meta: menos de 3% dos estrangeiros de cada liga por temporada, para o limite de estrangeiros continuar valendo.

## 8. Limitações

- A residência só conta a partir do começo do mundo (o histórico não tem as temporadas reais anteriores). Nos primeiros
  anos, só pede quem é formado no país.
- Sem dupla nacionalidade de nascimento (filhos de imigrantes).
- Sem regra própria por país (alguns pedem mais anos, outros menos).
