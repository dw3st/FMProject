# Profundidade do elenco (aba "Profundidade", #86)

Aba **Profundidade / Depth** do Elenco (`SquadScreen`, só o clube do jogador, `?tab=depth`):
um campo (SVG com as listras de `PITCH_COLOR`/`PITCH_STRIPES`, a partir de `xl`) com um cartão por
posição detalhada no lugar dela (atacando para a direita); abaixo de `xl`, uma lista por setor
(Gol, Defesa, Meio, Ataque). Componente `src/GameInterface/Components/SquadDepthView.tsx`.

## Regra (`src/Domain/squad/depth.ts`, + teste)

- Cartão: primeiro os jogadores **de origem** da posição (`preferredRole`), depois os que **se
  adaptam** (aptidão `apt`), cada grupo pela nota na posição (`slotValue`, mostrada ×10 como OVR).
  Lesionado (dias para voltar) e suspenso em vermelho. Até 5 linhas e "+N". Emprestados por outros
  clubes contam (estão no elenco); os cedidos não. Base fora.
- Veredito por **grupo** de posições que fazem o mesmo papel: GK · CB · LB+LWB · RB+RWB ·
  CDM+CM+CAM · LM+LW · RM+RW · ST. Oferta do grupo: cada jogador conta uma vez, 1 se é de origem
  numa posição do grupo, senão 0,5 se se adapta; lesionado por mais de 28 dias conta 0.
- Alvo = vagas da formação atual do clube no grupo + um reserva por vaga, no máximo dois
  (`slots + min(slots, 2)`: GK 2, CB 4 com dois zagueiros / 5 com três, lateral 2, meio central 5
  com três, ponta 2, ST 2 com um / 4 com dois). Verde ≥ alvo; amarelo ≥ vagas (titulares sem
  cobertura); vermelho < vagas; neutro se a formação não usa o grupo.
- Posição que a formação não usa: borda neutra; some se ninguém joga nem se adapta a ela (o
  objetivo é mostrar onde falta e onde sobra, não encher o campo de cartões vazios).
- Formação: `GET /api/saves/:id/tactics` → `formationForTactics` (livre incluída).

Sem efeito de partida: nada em `/test` nem `/lab`.
