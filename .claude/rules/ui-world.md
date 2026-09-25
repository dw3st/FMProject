# Helpers de mundo (UI)

## Regra

As telas **nunca montam rótulo de liga ou de país à mão** (concatenar `nome + país`, dar
`titleCase` num slug, etc.). Sempre importar de `src/Domain/world/labels.ts`.

## `src/Domain/world/labels.ts`

| Helper | Propósito |
|---|---|
| `countryDisplayName(country, lang, t)` | Nome do país: chave i18n primeiro, depois `Intl.DisplayNames` pelo ISO, por último o nome cru. `GB` fica "England", nunca "United Kingdom". |
| `leagueLabel(league, countryName)` | Rótulo `"Nome da Liga · País"` usado em combobox e seletor de liga. |
| `competitionName(slug, leagues)` | Nome de exibição de uma competição pelo slug; se não achar na lista, faz `titleCase` do slug (tira o prefixo `of_`). |
| `groupCountriesByContinent(countries, displayName)` | Agrupa países por continente, na ordem de `CONTINENT_ORDER`, ordenado dentro do grupo pelo nome de exibição. |
| `leaguesOfCountry(leagues, countryName)` | Filtra as ligas de um país, mantendo a ordem de tier já escrita pelo importador. |
| `matchesCountryQuery(query, parts)` | Busca sem acento e sem caixa; string vazia sempre casa. |
| `continentI18nKey(continent)` | Converte o nome do continente (`"South America"`) na chave i18n (`"south_america"`). |
| `partitionDayMatches(matches, ownLeague, followed, isOwnMatch?)` | Separa as partidas do dia em `primary` (liga própria + seguidas) e `others` (o resto). `isOwnMatch` força a partida do usuário para `primary` mesmo com a liga da sessão ausente/obsoleta. |

## Nomes de país

Chave i18n primeiro (`newGame.countries.{slug}.name`), depois `Intl.DisplayNames`. `GB` é tratado
à parte porque o `Intl` devolve "United Kingdom", mas o país do jogo é a Inglaterra.

## Escudos

`squadLogoUrl(squadId)` consulta `logoIndex.json` (gerado pelo `importEspn`, helper puro em
`src/Domain/world/logos.ts`): `squadId → "{pasta}/{stem}"`, com o SVG/PNG nativo primeiro e o escudo
da ESPN (`logos/espn/{squadId}.png`) depois. Clube fora do índice não gera requisição.

`squadLogoUrl` devolve `undefined` para clube sem escudo, então a UI nem tenta a requisição. O
`ClubLogo` guarda em memória (`failedLogoUrls`) as URLs que já deram 404, para não pedir de novo a
cada instância montada — cai no brasão gerado com as cores do clube. Ver `.claude/rules/data/espn-import.md`.

## Ligas seguidas

Até 3 (`MAX_FOLLOWED_LEAGUES` em `src/Domain/advanceDay/simMode.ts`), guardadas em
`meta.followedLeagues`. `sanitizeFollowedLeagues` limpa a lista recebida do cliente: só slugs
válidos, nunca a própria liga, sem duplicata, no máximo 3. Não existe seção "Ligas seguidas" em
Configurações — o `SettingsOverlay` não tem sessão de save; seguir é uma estrela no cabeçalho da
Classificação (`LeagueTableScreen.tsx`), onde a liga já está selecionada.

## Resumo do dia

O `DaySummaryModal` usa `partitionDayMatches` para mostrar direto as partidas da liga do jogador
e das ligas seguidas, e recolhe o resto atrás de um `OtherLeaguesSection` fechado por padrão.
