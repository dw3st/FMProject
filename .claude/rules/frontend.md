---
description: Rules for the React frontend — App, components, and UI conventions.
globs: "src/**/*.tsx, src/**/*.ts, src/index.html, src/index.css"
alwaysApply: false
---

## Stack
- React 19 + TypeScript
- Tailwind CSS v4 via `bun-plugin-tailwind`
- Pixi.js for canvas rendering (in GraficsEngine only)
- Iconoir icons via `iconoir-react` — always through the `Icon` abstraction (see below)

## Styling
**Use Tailwind utility classes for all styling.** Do not use inline `style={{}}` except for:
- Dynamic values derived from game state (e.g. team colors, glow shadows tied to a hex color)
- Pixi canvas sizing passed as props

Everything else — layout, spacing, typography, borders, colors, transitions — must use Tailwind classes.

Dark theme reference:
- Background: `bg-[#242424]` (set globally in `index.css`)
- Panels: `bg-white/[0.03]`, `border-white/10`
- Muted text: `text-white/40`, `text-white/70`
- Hover states: `hover:bg-white/10`, `hover:text-white`

## Icons
**All icons go through `GameInterface/Icons.tsx`.** This is the only file that imports from `iconoir-react`.

Usage:
```tsx
import { Icon } from "./GameInterface/Icons";
<Icon name="pause" size={16} />
```

Adding a new icon:
1. Find the component name in `iconoir-react` (browse iconoir.com)
2. Add the semantic name to `IconName` in `Icons.tsx`
3. Import the component and add it to `ICON_MAP`
4. Use `<Icon name="your-name" />` everywhere

To swap icon libraries: change only `Icons.tsx` — no other file needs to change.

## Component conventions
- Functional components only, props-in / render-out (dumb components)
- Game state lives in `App.tsx`; child components never subscribe to `gameBus` directly
- `PixiPitch` always stays mounted; control visibility/pause via props, never unmount it

## Imports
- Use relative imports within `src/` (the `@` alias is configured but not enforced)
- CSS imported once in `App.tsx` via `import "./index.css"`
