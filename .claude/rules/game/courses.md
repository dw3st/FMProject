# Idiomas, licenças e técnico ídolo

Desenho aprovado pelo usuário (reports de tester). Versão **9.3**. Lógica pura em `src/Domain/managers/courses.ts` (`COURSES`, com teste).

## Regra

- **Idioma:** o técnico fala a língua da nacionalidade dele (`managerNation` → `languageKey`, os grupos de `settling.ts`: espanhol, português, inglês, francês, alemão, árabe, servo-croata; uma nação fora deles fala a própria; `COUNTRY_ALIAS` para "USA", Chipre e Fiji).
- **Cursos** (`SeatState.managerStudies { languages, licences, course }`), pagos da carteira do técnico (`managerSpent`, apostas abertas descontadas), um por vez:
  - idioma €150 mil, 90 dias, qualquer língua dos países do mundo que ele não fala;
  - Licença A €100 mil, 60 dias, +1 de reputação; Licença Pro €400 mil, 120 dias, +2 (exige a A).
  - O curso termina na data (`until`), lido na hora (`settledStudies`): nada roda no avanço do dia e não há mensagem.
- **Reputação:** `managerReputation(..., licencePoints)` soma `licenceReputation` (até 3).
- **Propostas** (`pickOfferingClubs({ countryWeight })`, `offerCountryWeight` em `jobWorld.ts`): clube de um país cuja língua ele não fala × 0,5; país de um clube onde ele foi ídolo × 1,5. Ídolo (`idolClubs`): 4 temporadas (1460 dias) numa passagem, ou um título (fora acesso) creditado durante ela. As duas regras multiplicam.
- `POST /api/saves/:id/manager-course { kind: "language" | "a" | "pro", language? }`: 400 `invalidCourse`, 409 `busy` / `known` / `needsA` / `noMoney`; guarda de lobby.

## Limite de idiomas (report de tester, 2026-11-16)

No máximo `COURSES.MAX_LEARNED` (2) idiomas aprendidos em curso, além da língua nativa. Com o limite cheio, um curso novo de idioma precisa de `replace` (um idioma aprendido, nunca o nativo; 409 `languagesFull` sem ele, 400 `invalidCourse` com um que ele não aprendeu): o escolhido é esquecido quando o curso termina (`ManagerCourse.replaces`, aplicado em `settledStudies`). Quem já tinha mais de 2 de antes fica com eles; só o próximo curso pede a troca. Tela: "Idiomas aprendidos: N de 2" e, com o limite cheio, a escolha do idioma para esquecer antes de começar.

## Tela

"Seu técnico" → aba **Cursos** (`CoursesTab`): carteira, línguas que fala, curso em andamento; chips das línguas (nomes por `Intl.DisplayNames`, `LANGUAGE_CODE`) e as duas licenças. i18n `courses.*`.

## Testes

`bun test src/Domain/managers/courses.test.ts src/backend/managerCourse.routes.test.ts src/backend/jobs.test.ts`.

## Limitações

- A seleção (convites de seleções) não usa a língua.
- A IA não tem idioma: só o técnico humano.
