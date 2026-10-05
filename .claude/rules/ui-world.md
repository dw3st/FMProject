# Helpers de mundo (UI)

## Regra

As telas **nunca montam rótulo de liga ou de país à mão** (concatenar `nome + país`, dar
`titleCase` num slug, etc.). Sempre importar de `src/Domain/world/labels.ts`.

## `src/Domain/world/labels.ts`

| Helper | Propósito |
|---|---|
| `countryDisplayName(country, lang, t)` | Nome do país: chave i18n primeiro, depois `Intl.DisplayNames` pelo ISO, por último o nome cru. `GB` fica "England", nunca "United Kingdom". |
| `leagueLabel(league, countryName)` | Rótulo `"Nome da Liga · País"` usado em combobox e seletor de liga. |
| `competitionName(slug, leagues, lang)` | Nome de exibição de uma competição pelo slug. Liga: nome do catálogo. Continental (`ucl`/`uel`/`lib`/`sud`): nome fixo por `lang` (`CONTINENTAL_NAMES`) — "Champions League"/"Europa League" iguais em en/pt, "Copa Libertadores" igual, "Copa Sudamericana" (en) / "Copa Sul-Americana" (pt-BR). Copa (`cup_<país>`): nome próprio para as 6 grandes (`CUP_NAMES`), senão genérico localizado por `lang` a partir do `country` cru do `leagueData` ("<País> Cup" em inglês, "Copa nacional (<país>)" em português via `Intl.DisplayNames`). Slug desconhecido: `titleCase` (tira o prefixo `of_`). Ver `.claude/rules/game/cups.md` → "Interface". |
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

## Mapa-múndi do novo jogo

`src/GameInterface/NewGame/WorldMap.tsx` no passo de país do `NewGameWizard` (só a partir de `xl`,
onde ele tem ~600 px; abaixo disso só a lista). Geometria Natural Earth 1:50m (domínio público, via `world-atlas`),
simplificada e gerada em `worldMapPaths.ts` por `bun scripts/generate-world-map.ts` — não editar à mão.
Só os países com liga têm path próprio (chave = ISO2 do jogo; `GB` = Inglaterra, desenhada com o
contorno do Reino Unido); o resto é um path de fundo. Países pequenos demais (peça maior abaixo de
`MARKER_MAX_SIZE`: Malta, Chipre, Fiji, Albânia) ganham um ponto clicável (raio 7 no viewBox, ~8,5 px
de diâmetro na tela), desenhado depois de todos os países; o teste confere que todo país jogável é
grande o bastante ou tem ponto. O mapa é `aria-hidden`: a lista cobre teclado e leitor de tela. País novo
com liga: adicionar o código numérico ISO → ISO2 em `NUMERIC_TO_GAME_ISO2` do script e regerar
(`worldMapCountries.test.ts` falha se faltar).

## Rostos dos jogadores

`PlayerFace` (`src/GameInterface/Components/PlayerFace.tsx`) mostra um rosto `facesjs` (Apache-2.0),
determinístico pelo id (`playerFaceSvg`, `src/Domain/faces/playerFaceSvg.ts`: RNG semeado trocado no
`Math.random` durante o `generate`), camisa com as cores do clube, aparência sorteada de faixas amplas
por região da nacionalidade (`src/Domain/faces/faceProfile.ts`; as grafias do mundo — `Côte d’Ivoire`,
`Bosnia & Herzegovina`, `Congo - Brazzaville`... — estão todas mapeadas, só jogador sem nacionalidade
cai em `mixed`). Só na ficha do jogador (96px) e no
cartão do painel (64px), nunca em tabelas. Nada é salvo no save.

**O `facesjs` nunca vai para o bundle da página.** O SVG é gerado no servidor:
`GET /api/faces/:playerId.svg?v=&nat=&colors=` (`src/backend/faces.ts`, pública, cache em memória
limitado e com chave pela região da nacionalidade, não pelo texto cru; `Cache-Control: public,
max-age=31536000, immutable` e `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`), e o `PlayerFace` é só um `<img>`
(letra inicial até carregar ou se falhar). A URL vem de `faceUrl` (`src/Domain/faces/faceUrl.ts`, sem
import do `facesjs`). Mudou a saída do rosto (versão do `facesjs`, recorte, mistura por região)? Suba
`FACE_VERSION`, senão o navegador continua com o SVG antigo. O `import()` dinâmico anterior não era
separado pelo bundler do `Bun.serve` em produção (+346 KB min / +110 KB gzip na ficha e no painel).

### Traços reais (piloto, ESPN)

Piloto em 4 ligas (`brazil_serie_a`, `premier_league`, `la_liga`, `ligue_1`): cor da pele (7 tons) e
cor do cabelo tirados das fotos da ESPN. **A foto nunca é guardada no repositório nem publicada**; só os
parâmetros derivados.

- `bun scripts/fetchHeadshots.ts [--leagues a,b] [--probe]`: mapeia nossos jogadores para atletas da ESPN
  (`scripts/faces/athleteMap.ts`: `es_<id>`, `playerOverrides.json` ou nome único dentro do time da ESPN
  do clube) → `data_process/espn/faceAthletes.json`; lê nos elencos da API quem tem foto e baixa em
  `data_process/espn/headshots/` (no `.gitignore`).
- `bun scripts/extractFaceTraits.ts [--debug]`: heurística sobre a imagem (`scripts/faces/traits.ts`,
  decodificador PNG próprio em `png.ts`) → `data_process/espn/faceTraits.json`, chaveado pelo NOSSO id.
  Copiar para `src/example_data/faceTraits.json` (e `src/Data`). Comprimento do cabelo e barba são medidos
  mas descartados (`DROP`): acerto perto do acaso.
- `bun scripts/faces/evalTraits.ts`: acerto contra os rótulos manuais (`data_process/espn/faceTraitLabels.txt`).
- Uso: `faces.ts` lê `src/Data/faceTraits.json` uma vez (`faceTraitsOf`); `playerFaceSvg(..., traits)` chama
  `applyFaceTraits` (`src/Domain/faces/faceTraits.ts`) depois do `generate`, com RNG próprio, então o
  resto do rosto não muda. Jogador sem traços = rosto de antes. Mudou o arquivo? Suba `FACE_VERSION`.
- Cobertura: a ESPN só tem foto de ~4% dos jogadores dessas ligas (91 de 2255 mapeados, 2026-10-05).
