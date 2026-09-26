# Competições continentais — Design

Data: 2026-09-26. Status: aprovado pelo usuário. Etapa 2 do `docs/ROADMAP.md` (1.2 Continentais +
issue #2).

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Alcance | **Champions League + Europa League** (33 países europeus) e **Copa Libertadores + Copa Sul-Americana** (8 sul-americanos). Ásia/África/Concacaf ficam para depois |
| Formato | **Grupos de 4 (ida e volta, 6 rodadas) + mata-mata em ida e volta** (oitavas, quartas, semi) + **final única em campo neutro** |
| Tamanho | 32 clubes por competição (8 grupos) |
| Conference League | Não existe; as vagas `uecl` das 5 grandes vão para a Europa League |
| Preliminares | Não há; todos entram nos grupos |
| Desempate do mata-mata | Agregado (gols fora não contam); agregado empatado ao fim da volta → prorrogação + pênaltis na volta |
| Modo de simulação | Motor completo só quando um clube da liga do jogador joga; o resto no quickSim |
| Dinheiro | Prêmios, bilheteria e tier da IA ficam para a Etapa 3 |

## 1. Quem joga e quando

### Vagas

- **Coeficiente de país** = nível médio (`teamLevel` do quickSim) dos clubes da liga de nível 1 do
  país, calculado no momento da geração. Desempate: nome do país.
- **Champions (32):** zonas `ucl` das 5 grandes (PL 4, Bundesliga 4, La Liga 4, Serie A 4, Ligue 1
  3 = 19); as outras 13 vagas: 1 para cada um dos 13 primeiros países europeus restantes pelo
  coeficiente.
- **Europa League (32):** zonas `uel` + `uecl` das 5 grandes (2 × 5 = 10); as outras 22 para os
  países europeus pela ordem do coeficiente: cada país que teve 1 vaga na Champions ganha 1 na
  Europa League; os países sem vaga na Champions ganham 1 cada, pela ordem, até completar 32; se
  sobrar vaga depois de todos terem 1, dá a 2ª vaga pela mesma ordem.
- **Libertadores (32):** Brasil 6 (zona `lib`); Argentina 6; as outras 20 repartidas entre os 6
  demais países pelo coeficiente (4, 4, 3, 3, 3, 3).
- **Sul-Americana (32):** Brasil 6 (zona `sud`); Argentina 6; as outras 20 como na Libertadores.
- Países sem clubes suficientes cedem a vaga ao próximo pela ordem do coeficiente.

### Quem pega as vagas

- Liga de nível 1 do país, pela **posição na tabela final da temporada anterior** (arquivo da
  liga); as vagas da competição principal primeiro, depois as da segunda.
- **Primeira temporada** (sem tabela anterior): ordem de força do elenco (`teamLevel`) dentro da
  liga.
- Um clube nunca está nas duas competições do mesmo continente.

### Calendário

- **Europa** (temporada das ligas europeias, ago–mai): grupos set–dez; mata-mata fev–mai; final ≥ 7
  dias antes do fim da janela. Champions às terças, Europa League às quintas.
- **América do Sul** (ano civil, fev–nov): grupos mar–mai; mata-mata jul–nov; final ≥ 7 dias antes
  do fim. Libertadores às quartas, Sul-Americana às quintas.
- Uma data de rodada nunca cai num dia (nem no dia anterior) em que algum clube participante joga
  pela liga ou pela copa nacional; entre dois jogos do mesmo clube sempre ≥ 3 dias.

### Geração

- Quando a temporada do continente começa: na carreira nova (`createSave`), e na virada — a
  continental europeia é arquivada e regenerada quando **todas** as ligas europeias viraram; a
  sul-americana, quando todas as sul-americanas viraram (mesma regra das copas, por continente).
- Os start kits guardam as continentais (rodadas europeias até 05/02 já jogadas nos kits).

## 2. Dados, confrontos e motor

### Armazenamento

- `saves/{id}/leagues/{ucl|uel|lib|sud}/`: `meta.json`, `rounds/{n}.json`, `date-index.json`;
  sem `standings.json` (a tabela do grupo é calculada).
- `LeagueSeasonMeta.kind = "continental"`, `continental: { competition, continent, groups:
  { name, clubs[] }[], stages: { name, rounds: number[], dates: string[], drawn }[], pots,
  coefficient, championId }`.
- Fixtures normais; o mata-mata usa `tieId` (mesmo nos dois jogos) e `leg: 1 | 2`; a volta tem
  `knockout: true` e `aggregate` com os gols da ida (home/away da volta); a final tem `knockout` e
  `neutral`.

### Sorteio dos grupos

4 potes de 8 por força do clube; um clube de cada pote por grupo; dois clubes do mesmo país nunca no
mesmo grupo (backtracking determinístico); semente `save + temporada + competição`.

### Tabela do grupo

`computeStandings` sobre as fixtures do grupo, só com os 4 clubes. Desempate: pontos, saldo, gols
pró, confronto direto (pontos, depois saldo entre os empatados), id.

### Mata-mata

- Oitavas: 1º × 2º de outro grupo, sem mesmo grupo nem mesmo país; o 1º faz a volta em casa.
- Quartas e semi: sorteio livre (mandante da volta sorteado).
- Vencedor: agregado; empate → decidido na volta (prorrogação + pênaltis).

### Motor e quickSim

- `GameState.aggregate?: { A: number; B: number }` (gols da ida por lado da partida atual). Com
  `knockout`, a prorrogação acontece quando `score + aggregate` empata ao fim dos 90'; os pênaltis
  quando empata ao fim da prorrogação. `knockoutDecider` e `simulateMatch` respeitam o agregado.
- quickSim: `input.aggregate?: { home: number; away: number }` com a mesma regra.
- Registro: a volta guarda `decider` como nas copas.

### Integração

Avanço do dia joga pelo `date-index`; ao terminar a última rodada dos grupos sorteia as oitavas; ao
terminar a volta de uma fase sorteia a seguinte; grava o campeão; virada arquiva e regenera por
continente; smoke e start kits.

## 3. Interface, #2 e verificação

### Interface

- Calendário do jogador inclui os seus jogos continentais; prévia mostra "ida"/"volta" e o placar da
  ida na volta; partida ao vivo com `knockout` + `aggregate` na volta.
- Tela de ligas: aba **Continental** com seletor (Champions, Europa League, Libertadores,
  Sul-Americana): 8 tabelas de grupo + chaveamento (ida, volta, agregado, prorr./pên.) + campeão.
- Inbox, categoria `continental`: classificação, sorteio do grupo e de cada fase, eliminação, título
  (só do clube do jogador).
- Nomes: Champions League, Europa League, Copa Libertadores, Copa Sul-Americana (en/pt-BR).
- `seasonLog.continental` (como `cup`).

### Issue #2 (antes da integração)

Recalibrar o quickSim com `quicksim-spread` (collect ~26 ligas, `analyze`, reajuste de gols,
`events --apply`). Meta: todas as ligas a ±15% do motor, rms menor que o atual. Nova checagem:
jogos entre ligas (ex.: Premier × Eredivisie), comparando quickSim × motor na taxa de vitória do
mais forte.

### Testes

Unitários: vagas (32, zonas respeitadas), sorteio (país, determinismo), tabela do grupo, cruzamento
das oitavas, agregado com prorrogação/pênaltis (motor e quickSim), datas sem choque e ≥ 3 dias.
Smoke: 4 competições, nenhum clube com dois jogos no dia, campeão da Champions e regeneração na
virada, nenhum jogo no passado sem jogar. Start kits regenerados. Navegador: carreira na Premier
(grupo, jogo de volta, aba Continental).
