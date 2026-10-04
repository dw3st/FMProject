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
- In-game screens render inside `<Layout>` (`GameInterface/Components/Layout.tsx`) and wrap their
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
- Duas fontes, embutidas via `@fontsource` (nunca Google Fonts), definidas em `src/index.css`:
  **Barlow** (400/500/600/700, `font-sans`, padrão do `body`) para texto e UI; **Barlow Condensed**
  (600/700, `font-display`) para títulos, painéis e números de destaque. `h1`/`h2`/`h3` já saem em
  `font-display` uppercase (`@layer base`).
- Não usar `font-family` inline nem `font-mono` decorativo. `font-mono` só em telas de debug
  (`/test`, `DebugPanel`, heatmap) onde o dado é tabular de verdade; números alinhados: `tabular-nums`.
