# Redes sociais (termômetro de seguidores)

Report de tester. Versão **11.2**. Lógica pura em `src/Domain/fanbase/fanbase.ts` (`FANBASE`, com teste). Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- Os seguidores (`finances.followers`) continuam mudando só na virada, pela reação da temporada (`.claude/rules/AI-clubs/finance.md`). Nada novo é guardado.
- **Tendência** (`seasonTrend`): quanto os seguidores mudariam se a temporada acabasse hoje, pela posição na tabela e pelo tier (`followersChange`). Sem tendência antes de `MIN_GAMES` (5) jogos.
- **Momento** (`heatOf`): em alta com tendência de `HOT` (+4%) ou mais, em baixa com `COLD` (−1%) ou menos, senão estável.
- **Efeito no clube humano:**
  - toda segunda, a torcida (medidor) sobe `FANS_HOT` (0,2) em alta e cai `FANS_COLD` (0,4) em baixa (`fansDeltaOf`, pelo `applyPressEffect`);
  - na virada, a receita comercial acompanha `COMMERCIAL_SHARE` (metade) da variação dos seguidores, até `COMMERCIAL_CAP` (±6%) por temporada (`commercialAfterFollowers`).
- A IA não muda: só o ranking a mostra.

## Rota

`GET /api/saves/:saveId/fanbase?scope=world|country|league&offset=&limit=` (`src/backend/fanbaseRoutes.ts`, membro do mundo; limite 1..100; 400 `invalidScope` / `invalidPage`): `{ scope, total, mine, items }`, clubes por seguidores, numerados dentro do escopo (país e liga do clube de quem vê). Os clubes do mundo ficam num cache por save, dia e versão de dados.

## Telas

- Estatísticas → **Redes sociais** (`?tab=fanbase`, `Fanbase/FanbaseTab.tsx`): chips Minha liga / Meu país / Mundo, a faixa do seu clube (posição, seguidores, tendência, momento e o efeito) e a tabela com Carregar mais.
- Painel: número Seguidores na faixa do cartão do clube, com o momento ao lado.
- i18n `fanbase.*`.

## Testes

`bun test src/Domain/fanbase`.

## Limitações

- A tendência olha só a liga (copa e continental entram na virada, como sempre).
- Nenhum nome de rede real; não há publicações nem eventos.

## Patrocinadores (12.0)

O momento nas redes (`heatOf`) entra no atrativo do clube para os patrocinadores, e `finances.commercial` (que continua seguindo os seguidores na virada) é a base das propostas. Ver `.claude/rules/game/sponsors.md`.

## Seguidores recalibrados (11.2.1)

Report do usuário (Barcelona fora do ranking, Juventude em 8º). Os seguidores do mundo base vinham do dado de origem, com erros grandes (Barcelona 7M, Goiás 173M, Juventude 155M). `scripts/curated/followersTable.ts` lista 140 clubes conhecidos com o total real nas redes (todas as plataformas, 2025: CIES Football Observatory, Goal, Ibope Repucom; Real Madrid 470M, Barcelona 420M, Manchester United 230M, Flamengo 65M, Corinthians 42M). `bun scripts/curated/buildFollowerCorrections.ts` grava `data_process/curated/followerCorrections.json`: os conhecidos pelo número da tabela; os demais ficam com o número de origem, limitado entre um quinto e o dobro do esperado pela receita do clube (ajuste log-log sobre os conhecidos, seguidores = e^2,34 × receita^0,74) e nunca acima de 15M. 305 de 1273 clubes mudaram. `bun scripts/applyFollowerCorrections.ts` aplica ao mundo base (fim da cadeia de `espn-import.md`, depois de `applyCoaches`; copiar para `src/Data`). Os start kits não foram regenerados: `applyKit` usa os seguidores do mundo base do save novo. Saves em andamento não mudam sozinhos; o mundo dos testers foi ajustado à mão (cada clube × novo/antigo do mundo base, mantendo a evolução dele; a âncora de público do clube humano junto).
