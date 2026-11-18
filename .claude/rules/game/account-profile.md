# Perfil da conta

Spec: `docs/superpowers/specs/2026-11-18-account-profile-design.md`. Pedido do usuário, mock aprovado. Versão **12.15**. Sem efeito de partida: nada em `/test` nem `/lab`.

## Regra

- O técnico continua sendo de cada save. A conta tem um perfil acima dos saves.
- Cada carreira (usuário + save + assento) vira uma foto (`AccountCareer`, `src/types/accountTypes.ts`), guardada no SQLite em `account_careers`:
  - técnico, modo (solo, amigos, público), passagens, títulos (com o país da liga), prêmios e temporadas;
  - jogos e vitórias, que vêm dos contadores das conquistas do save;
  - cartões do técnico.
- A foto é regravada (`syncSaveCareers`, `src/backend/account/accountWorld.ts`, nunca derruba o dia):
  - no fim de cada `runBufferedDay`;
  - antes de `deleteWorld`, que depois marca a carreira como `deleted`;
  - antes de `removeSeat`, que marca só aquele assento.
- Apagar o save não apaga a carreira. Regravar a mesma foto não conta nada duas vezes.
- Na primeira abertura do perfil (`account_profile.backfilled`), todos os saves da conta são lidos.
- Resumo e 40 conquistas da conta (10 trilhas × 3, 5 avulsas, 5 secretas) são calculados na hora, em `src/Domain/account/accountProfile.ts` (`ACCOUNT`, com teste). Nada além dos selos é guardado.
- Selos: o ouro de cada trilha dá um, e o jogador mostra até 3 (`account_profile.badges`). Um selo que perdeu o ouro some da tela.

## Rotas

- `GET /api/account/profile[?nickname=]`: o próprio perfil ou o de um amigo. Para quem não é amigo, 404; sem apelido, 409 `noNickname`.
- `PUT /api/account/badges { badges }`: 400 `invalidBadges`, 413.

## Telas

- `/start` (`StartScreen`) é o perfil: topo com rosto, apelido e selos; faixa de números; sala de troféus; conquistas da conta. Embaixo ficam os saves de sempre, à esquerda, e todas as carreiras, à direita. Os blocos estão em `Account/AccountProfileBlocks.tsx`.
- Perfil de amigo: no menu da linha do amigo no painel de Amigos, "Ver perfil" abre `FriendProfileModal`.
- Liga de amigos (classificação e membros): o apelido vem primeiro, com o técnico do save embaixo.
- i18n `account.*`, `screenTitles.account`.

## Testes

`bun test src/Domain/account src/backend/account.routes.test.ts`.

## Limitações

- Os cartões de técnico só existem desde a 8.7.10.
- Os cartões do time não são guardados.
- Num mundo de amigos, cada conta soma só o próprio assento.
