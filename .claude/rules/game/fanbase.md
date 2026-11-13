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
