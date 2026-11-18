# Perfil da conta

Aprovado pelo usuário em 2026-11-18, com o mock `Desktop/mock-perfil-conta/perfil-da-conta.png`.

## Problema

A conta só guarda o apelido. O técnico, os títulos, os prêmios e as conquistas ficam em cada save. Cada carreira nova começa do zero e nada sobra quando um save é apagado.

## Decisões

- O técnico continua por save: nome, rosto e nacionalidade de cada carreira.
- A conta tem um perfil acima dos saves, que soma títulos, temporadas, prêmios, jogos, vitórias, acessos, demissões e cartões do técnico.
- A história fica para sempre: um save apagado (ou um mundo de amigos que o jogador deixou) continua no perfil, marcado.
- O perfil é visto pelo próprio jogador e pelos amigos.
- A tela inicial (`/start`) vira o perfil da conta, com os saves embaixo.
- Os saves que já existem entram na primeira abertura.
- Nos lugares sociais (liga de amigos, classificação, membros) aparece o apelido, com o técnico do save ao lado.

## Dados

SQLite, migração só aditiva (`migrateAccountSchema`, `src/backend/db.ts`):

- `account_careers(user_id, save_id, seat_id, data TEXT, updated_at INTEGER, deleted INTEGER DEFAULT 0, PRIMARY KEY(user_id, save_id, seat_id))`: uma foto (`AccountCareer`, JSON) de cada carreira.
- `account_profile(user_id PRIMARY KEY, badges TEXT, backfilled INTEGER DEFAULT 0)`.

`AccountCareer` (`src/types/accountTypes.ts`) guarda:
- o técnico: nome, rosto, nacionalidade e a data do jogo;
- o modo: `solo`, `friends` ou `public`;
- as passagens por clubes e seleções, com o nome e o motivo da saída;
- os títulos, com o país da liga;
- os prêmios;
- as temporadas, os jogos e as vitórias (dos contadores de conquistas);
- os cartões do técnico.

## Quando a foto é gravada

`syncSaveCareers(saveId)` (`src/backend/accountWorld.ts`) lê `managers.json`, os assentos e as conquistas de cada assento. Para cada membro do save (`save_members`), grava uma linha. Ela roda:

- depois de cada dia gravado (`runBufferedDay`);
- antes de `deleteWorld` (depois a linha fica com `deleted = 1`);
- antes de `removeSeat` (a linha daquele assento fica com `deleted = 1`).

Uma falha só vai para o log e nunca derruba o dia. Gravar a mesma foto de novo não muda nada, então um dia refeito não conta duas vezes.

Na primeira abertura do perfil (`backfilled = 0`), todos os saves da conta são sincronizados.

## Números do perfil (`accountSummary`)

- títulos por tipo: liga, copa, continental, seleção e acesso;
- temporadas;
- clubes, contados como pares save + clube distintos;
- jogos e vitórias, com o aproveitamento em porcentagem de vitórias;
- prêmios: melhor técnico da liga e do mundo;
- demissões: passagens encerradas com `sacked`;
- amarelos e vermelhos do técnico;
- quantidade de carreiras e quantas foram com amigos.

## Conquistas da conta (40)

Trilhas, com os limiares bronze / prata / ouro:

| Trilha | Bronze | Prata | Ouro |
|---|---|---|---|
| Títulos de liga | 3 | 10 | 25 |
| Copas nacionais | 2 | 6 | 15 |
| Títulos continentais | 1 | 3 | 8 |
| Países com título de liga | 2 | 3 | 5 |
| Saves com título de liga | 2 | 3 | 5 |
| Temporadas | 10 | 25 | 50 |
| Clubes treinados | 3 | 6 | 10 |
| Vitórias | 100 | 500 | 1500 |
| Prêmios de melhor técnico | 1 | 5 | 15 |
| Acessos | 1 | 3 | 6 |

Avulsas:
- melhor técnico do mundo;
- título com seleção;
- Copa do Mundo;
- campeão de liga num mundo com amigos;
- acesso e título: subir de divisão e depois ser campeão de outra liga com o mesmo clube.

Secretas:
- tríplice coroa: liga, copa e continental na mesma temporada com o mesmo clube;
- dois continentes: título continental europeu e sul-americano;
- pavio curto: 10 vermelhos de técnico;
- andarilho: 3 demissões;
- fênix: campeão de liga no clube seguinte a uma demissão.

Tudo é calculado na hora a partir das fotos, sem nada guardado. O ouro de cada trilha dá um selo, e o jogador mostra até 3 deles no topo (`PUT /api/account/badges`).

## Rotas

- `GET /api/account/profile[?nickname=]`: o próprio perfil, ou o de um amigo (404 para quem não é amigo). Devolve apelido, data da conta, rosto (da carreira mais recente), resumo, conquistas, selos e carreiras.
- `PUT /api/account/badges { badges }`: até 3 selos, só de trilhas com ouro (400 se não).

## Telas

- `/start`: o perfil (mock), com os saves da tela atual na coluna da esquerda e as carreiras na da direita.
- Perfil de amigo: abre pelo apelido no painel de Amigos, numa janela com os mesmos blocos, sem a lista de saves.
- Liga de amigos: na classificação e nos membros, o apelido vem primeiro e o técnico depois.

## Fora

- Pontos ou loja da conta.
- Cartões do time: esse número não é guardado hoje.
- Os cartões de técnico existem só desde a 8.7.10.
