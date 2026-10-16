# Etapa 43, parte 5a — Classificação dos técnicos da liga de amigos

Visão geral: `docs/superpowers/specs/2026-10-14-multiplayer-design.md`. Partes 1–4 na `main` (4.26). A parte 5 foi dividida:
**5a** (esta) é a classificação dos técnicos humanos de um mundo; **5b** (mundo público) fica para depois, com spec própria.
Decisões do usuário (2026-10-16): pontuação **por temporada**, relativa à meta da diretoria; a temporada em andamento
aparece **ao vivo** (parcial). Regra viva: `.claude/rules/game/multiplayer.md`.

## 1. Regra

- Vale em mundos `mode: "multi"` com 2+ assentos; no solo nada aparece.
- Cada técnico humano (assento) soma pontos por **passagem** num clube dentro de uma temporada. Uma passagem fecha na
  virada do país do clube, numa troca de clube, numa demissão ou no fim do contrato. O total é a soma das passagens
  fechadas; a passagem aberta aparece como **parcial**, calculada na hora.
- O cálculo é puro sobre fatos que o jogo já guarda; nada novo é simulado.

### 1.1 Pontos de uma passagem

| Componente | Pontos | Fonte |
|---|---|---|
| Meta da diretoria cumprida | +10 | `board.objective.target` × posição final na liga |
| Posições acima da meta | +1 cada, até +10 | idem |
| Posições abaixo da meta | −1 cada, até −10 | idem |
| Título da liga | +15 | 1º da tabela na virada |
| Copa nacional | campeão +8, finalista (perdeu a final) +3 | fase alcançada na copa do país |
| Continental | campeão +15, finalista +6, semifinal +3, passou dos grupos +1 (só o maior) | fases da competição |
| Acesso / rebaixamento | +8 / −8 | mudança de nível na virada |
| Melhor técnico da liga | +4 | `awards` da virada (`best_manager`) |
| Melhor técnico do mundo | +8 | cerimônia de janeiro (`world_manager`) |
| Seleção: título de torneio | +6 | registro do técnico (`kind: "national"`) |
| Seleção: meta da federação cumprida | +2 | resultado da meta (`national_coach` `result`) |

- "Posição" = posição na tabela da liga do clube; meta = `target` da diretoria do assento (a pior posição que cumpre).
  Cumprir = posição ≤ target.
- Copa e continental contam a melhor fase daquela temporada; cada componente uma vez por passagem.
- Prêmios e seleção entram na passagem aberta no dia em que acontecem (o mundial de janeiro e os torneios de seleção
  caem na passagem aberta naquela data; desempregado, não pontuam).
- Todas as constantes num `STANDINGS` (`src/Domain/multiplayer/standingsConfig.ts`).

### 1.2 Passagem que fecha no meio da temporada

- **Troca de clube (aceitar proposta):** fecha com a posição do dia contra a meta, **valendo metade** (arredondado para
  baixo em módulo; títulos e fases já conquistados contam inteiros). A nova passagem começa com a meta do clube novo.
- **Demissão ou fim de contrato:** fecha como a troca, mais **−5** na demissão (o fim de contrato não tira).
- Liga sem jogos ainda (tabela zerada): a parte da meta vale 0.
- Desempregado: nenhuma passagem aberta.

### 1.3 Parcial (temporada em andamento)

Mesmo cálculo da passagem aberta com a posição de hoje e o que já foi conquistado (títulos de copa/continental
decididos, fases alcançadas, prêmios e seleção do período), sem o −5 nem a metade. Na virada, o parcial fecha com os
valores finais.

## 2. Dados

`saves/{id}/seatSeasons.json` (do mundo, bufferizado como os outros arquivos do mundo): `SeatSeasonRow[]`.

```ts
interface SeatSeasonRow {
  id: string;            // `${seatId}:${clubId}:${season}:${closedOn}`
  seatId: string;
  clubId: string; clubName: string;
  leagueSlug: string;
  season: string;        // rótulo da temporada da liga (`seasonLabel`)
  from: string;          // início da passagem
  closedOn: string;      // data do fechamento
  reason: "rollover" | "club_change" | "sacked" | "contract";
  position: number | null; target: number | null;
  items: { key: StandingItemKey; points: number }[];
  total: number;
}
```

- A passagem aberta guarda no assento só o começo e o acumulado do que não está em outro lugar:
  `SeatState.standing = { from, clubId, season, extras: { key, points }[] }` (prêmios de janeiro e seleção, que não se
  reconstroem da tabela). O resto do parcial vem da tabela e das competições na hora.
- **Idempotente:** a linha usa um id determinístico; uma virada refeita não grava de novo.
- Sem migração (protótipo): mundos sem o arquivo começam do zero.

## 3. Onde grava

- **Virada do país do assento** (`advanceDay`, junto da avaliação da meta da diretoria): fecha a passagem com
  `reason: "rollover"` e abre a nova (`standing` com a temporada nova).
- **Troca de clube** (`acceptJobOffer`), **demissão e fim de contrato** (`advanceDay` / `sackHumanManager`): fecha com o
  motivo; a troca abre a passagem do clube novo.
- **Prêmios de janeiro e seleção:** somam em `standing.extras` no dia.
- **Entrada na liga** (`addSeat`) e **começo do mundo**: abrem a primeira passagem.

## 4. Rota e telas

- `GET /api/worlds/:saveId/standings` (qualquer membro; solo 409 `notMulti`): por técnico `{ seatId, nickname,
  managerName, face, clubId, clubName, partial: { total, items, position, target }, closedTotal, total, seasons: number }`
  ordenado por `total` (desempate: parcial, depois nome) e as linhas fechadas (`rows`).
- **`/world` → aba "Classificação"** (`SegmentedTabs` junto do conteúdo atual): tabela padrão (`StatsTable`/`TABLE_STYLE`)
  com #, rosto 32px, técnico, apelido, escudo e clube, "Temporada atual" (parcial, marcado como parcial), "Fechadas" e
  "Total" (coluna em destaque); a linha do próprio técnico destacada. Clicar abre o detalhe: por temporada, cada item
  com o texto ("Meta cumprida +10", "3 acima da meta +3", "Copa: finalista +3", "Saiu no meio: metade").
- **Painel:** no cartão do clube, uma linha "Liga de amigos: 2º de 4" (link para a aba).
- **Caixa:** na virada do país de um técnico, todos os membros recebem `world` / `season_closed` ("Temporada de Ana
  fechada: +22, 3º na classificação"), gravada depois do `clearInbox`; o socket `world_members` avisa as telas.
- i18n `world.standings.*` (en, pt-BR).

## 5. `/test`, `/lab`

Sem efeito de partida: nada a exibir.

## 6. Testes

- Fórmula pura item a item: meta cumprida/falhada com limites ±10, títulos, copa/continental pela maior fase,
  acesso/rebaixamento, prêmios, seleção; passagem no meio valendo metade; demissão −5; fim de contrato sem −5; tabela
  zerada.
- Parcial = fechamento quando nada muda até a virada.
- Virada grava uma linha e abre a passagem nova; dia refeito não duplica.
- Troca de clube e demissão fecham com o motivo; desempregado sem passagem.
- Rota: membros veem, não membros 404, solo 409.
- Navegador: liga com dois técnicos, aba Classificação com o parcial dos dois.

## 7. Versão e limitações

- Próxima minor: **4.27**; changelog e `upcoming` (5b: mundo público).
- Limitações: começa do zero em cada mundo; sem troféu ou premiação do campeão da liga de amigos; a meta é a da diretoria
  (um técnico com meta fácil pontua mais pela posição relativa, por desenho); o mundo público é a 5b.
