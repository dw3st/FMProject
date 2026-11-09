---
description: Rules for the React frontend — pages, components, and UI conventions.
globs: "src/**/*.tsx, src/**/*.ts, src/index.html, src/index.css"
alwaysApply: false
---

## Stack
- React 19 + TypeScript, served by `Bun.serve()` (`src/index.ts`): every page is its own HTML
  bundle (`src/pages/<page>/index.html` → `entry.tsx`)
- Tailwind CSS v4 via `bun-plugin-tailwind`
- Pixi.js for the pitch canvas (`src/GraficsEngine` only)
- Icons from `lucide-react`, always through the `Icon` abstraction (see below)

## Pages
- `src/pages/<page>/entry.tsx` calls `createPage(Component, options)` (`src/createPage.tsx`), which
  wraps the screen in `LanguageProvider` → `ScreenSizeGate` → `AuthGate` → `GameSaveProvider`
  (`public`, `noAuth` and `responsive` drop layers for landing, login, start and the lab).
- **The fixed frame (8.8):** every in-game screen lives in one page, `src/pages/app/` → `AppShell.tsx`
  (`docs/superpowers/specs/2026-11-06-spa-shell-design.md`). The route table is `GameInterface/router/appRoutes.ts`
  (path → screen, tab title, `chrome`); a new in-game screen adds a route there, a `case` in `AppShell` and its path in
  `src/index.ts` (served by `appPage`). Pages of their own: landing, login, start, new game, join, fired, watch, and the
  live match page `/match-live`.
- **Navigation:** always `navigate(to, { replace })` (`router/navigation.ts`), never `window.location.href = …`: inside
  the frame a frame path changes in place, anything else loads the page. `<a href>` to a frame path is intercepted by
  the frame. Read the route with `useRoute()`; the screen remounts on every navigation (a screen that reads the URL on
  mount works as after a page load) and the save refreshes in the background.
- A link inside something clickable (a table row) uses `onClick={followLinkOnly}` (`router/navigation.ts`), never a bare `stopPropagation`: React's stops the native event too, the frame never sees the click and the whole page reloads, radio included (8.8.26).
- In-game screens render inside `<Layout>` (`chrome`: `full` with the bars; `bare` without the top bar for the preview and
  the result, with the footer so the radio keeps playing; `match` for the live match, which runs `/match-live` in an iframe so the engine's globals live and die
  with it; the preference "Partida dentro do jogo", `fm.match.inFrame`, opens the match page on its own) and wrap their
  content in `<ScreenContainer>`; see `ui-standard.md`.
- Session and save state come from `GameSaveProvider` (`useGameSave()`). There is no `App.tsx`.
- Lab tools (`/lab`, `/test`, `/simulate`, `/matrix`, `/promo`) are separate pages served by
  `src/lab/server.ts`.

## Styling
**Use Tailwind utility classes for all styling.** Do not use inline `style={{}}` except for:
- Dynamic values derived from game state (e.g. team colors, glow shadows tied to a hex color)
- Pixi canvas sizing passed as props

Everything else (layout, spacing, typography, borders, colors, transitions) uses Tailwind classes
and the theme tokens (`bg-background`, `bg-card`, `border-border`, `text-muted-foreground`,
`text-primary`…) defined in `src/index.css`. Visual rules: `ui-standard.md`.

## Icons
**All icons go through `GameInterface/Icons.tsx`.** It is the only file that imports from
`lucide-react`, lab pages included.

```tsx
import { Icon, iconOf } from "@/GameInterface/Icons";
<Icon name="pause" size={16} />
const Trophy = iconOf("trophy");   // component form, for icon tables
```

Adding a new icon:
1. Find the component name in `lucide-react` (lucide.dev)
2. Add the semantic name to `IconName` in `Icons.tsx`
3. Import the component and add it to `ICON_MAP`
4. Use `<Icon name="your-name" />` everywhere

To swap icon libraries, change only `Icons.tsx`.

## Component conventions
- Functional components only; shared pieces are dumb (props in, render out). `ui/` holds the
  standard kit (`Button`, `Chip`, `OptionChips`, `SegmentedTabs`, `ScreenTitle`, `ScreenContainer`…).
- Pure logic (formatting, display models, roles, dates, money) lives in `src/Domain`, not in
  `GameInterface`. Domain, types, backend and the engines never import `GameInterface`.
- Only the match screens subscribe to `gameBus`: `MatchScreen`, `TestScreen`, `StatsPanel`,
  `DebugPanel`, `Broadcast/BroadcastSubscriber` and `matchResume` (plus the lab's promo page).
  `PixiPitch` drives the simulation clock and emits; it always stays mounted, so control
  visibility/pause via props, never unmount it.

## Imports
- Always `@/…` (alias for `src/`), never relative paths. The only exception is the HTML bundle
  imports in the server entries (`import page from "./pages/x/index.html"`).
- CSS is imported once, by `createPage.tsx` (`import "@/index.css"`).

## Tipografia
- Duas fontes, arquivos woff2 do `@fontsource` (nunca Google Fonts), só subsets latin + latin-ext:
  **Barlow** (400/500/600/700, `font-sans`, padrão do `body`) para texto e UI; **Barlow Condensed**
  (600/700, `font-display`) para títulos, painéis e números de destaque. `h1`/`h2`/`h3` já saem em
  `font-display` uppercase (`@layer base`). `font-black` (900) não tem arquivo: renderiza no 700.
- **Nunca importe o CSS do `@fontsource` (nem outro CSS com `url()` de arquivo) em `index.css`:** o bundler
  do Bun transforma todo arquivo pequeno em data URI base64 dentro do CSS da página (as fontes e as
  bandeiras do `flag-icons` deixavam o CSS em 5,3 MB). Os `@font-face` ficam em `src/fontFaces.ts`
  (injetados por `createPage`), os arquivos são servidos por `src/backend/staticAssets.ts`
  (`/assets/fonts/v1/`, `/assets/flags/v1/`, cache `immutable` — suba o `v1` se os arquivos mudarem).
  Bandeira: sempre `<Flag code>` (`Components/Flag.tsx`), nunca as classes `fi fi-xx`.
- Não usar `font-family` inline nem `font-mono` decorativo. `font-mono` só em telas de debug
  (`/test`, `DebugPanel`, heatmap) onde o dado é tabular de verdade; números alinhados: `tabular-nums`.

## Aviso de versão nova (8.8.8)

A moldura nunca recarrega sozinha, então uma aba aberta antes de um deploy ficava com o código antigo (reports de correção que "não funcionou"). `useNewVersion` (`changelog/useNewVersion.ts`) pergunta `GET /api/version` a cada 5 minutos com a aba visível e quando ela volta; com uma versão diferente da do bundle, o `Layout` mostra o aviso "Saiu uma versão nova do jogo" com Recarregar. `ClubLogo` aceita `title` (nome no hover) onde o escudo aparece sem o nome.

## Rádio e rodapé na partida (8.8.10)

Pedido do usuário. A partida (chrome `match`) mostra o rodapé (`StatusBar`); o meio dele é o encaixe `fm-match-radio` (`MATCH_RADIO_SLOT`, `World/frameHost.ts`), onde a partida no iframe põe a faixa de amigos jogando (`LiveRivalsStrip footer`) por um portal no documento pai (`frameRadioSlot`). O botão Amigos saiu da partida; abrir uma conversa pelo aviso do iframe vai por `postMessage` (`OPEN_CHAT_MESSAGE`) ao chat da moldura. `RadioPlayer` (rodapé, opção B do mock desde a 8.8.11: pílula com o nome e um equalizador tocando): Mundo Livre FM ao vivo (StreamTheWorld), nunca toca sozinho, volume em `fm.radio.volume`; como o rodapé não desmonta, toca de tela em tela. O crédito westlab.dev ficou só no login e na tela inicial.

Divisórias na barra de baixo (8.8.27, report do usuário): uma linha de 20px entre cada coisa (`Divider`, `StatusBar`) e entre os amigos da faixa; o encaixe da faixa só desenha as dele quando tem conteúdo. Desde a 8.8.16 a rádio tem mais de uma estação (`radioStations.ts`: Mundo Livre FM e Ouro Verde FM, Curitiba; streams https e abertos ao navegador): a seta dentro da pílula passa para a próxima (tocando, ela começa na hora), lembrada em `fm.radio.station`.
