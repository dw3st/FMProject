# TouchLines Promo Video — Plan

## 1. North star

A **30-second arcade promo** that looks like *the actual TouchLines app in motion*. Every screen, color, font weight, glow, and pitch line is sourced from the real game so the video reads as "this is the product" rather than "this is an abstract concept."

We are NOT making generic football graphics. We are making **moving UI**.

---

## 2. Brand & copy lock-in

From `src/i18n/locales/en.json` and the existing landing page:

| Slot | Copy |
|---|---|
| Wordmark | **TOUCHLINES** with `ARCADE` lockup beneath |
| Badge tagline | *The Football Management Arcade* |
| Hero | *Management Reborn* |
| Subtitle | *Forget the spreadsheets. Forget the 90-minute waits. Pick a club. Pick a tactic. Hit play.* |
| Feature 1 | **Pick Your Tactic** — *Counter, press, possession, direct, balanced. Pick a style, watch it click.* |
| Feature 2 | **Hunt the Next Star** — *Find young talent before anyone else does. Sign them, play them, watch them grow.* |
| Feature 3 | **Build Your Dynasty** — *Take an underdog to the top. Every club has a story — write yours.* |
| Feature 4 | **No Grinding** — *A full match runs in minutes, not hours. Skip the boring stuff. Stay for the goals.* |
| Outro CTA | **TouchLines Arcade — Management Reborn** |

No invented copy. No "Coming Soon" placeholder — the game exists, we sell it.

---

## 3. Visual identity contract

Pull directly from `src/index.css`:

| Token | Value | Use |
|---|---|---|
| `--team-hue` | 160 / 240 / 20 / 85 / 290 / 45 / 195 | Drives the entire palette per scene |
| `--background` | `oklch(0.12 0.02 hue)` | Body / void |
| `--card` | `oklch(0.15 0.025 hue)` | Card surfaces |
| `--primary` | `oklch(0.75 0.18 hue)` | Glow / accent / scoring color |
| `--muted-foreground` | `oklch(0.60 0.05 hue)` | Secondary text |
| `--destructive` | `oklch(0.55 0.22 25)` | Loss / red flags |

Utilities to mirror in Remotion:

- `card-arcade` — `linear-gradient(145deg, oklch(0.18 0.025 h), oklch(0.12 0.02 h))` + 1px hue border
- `glow-primary` — multi-layer `box-shadow` in primary hue
- `glow-text` — text-shadow in primary hue
- `border-glow` — subtle ring around interactive elements

Typography: `font-display` (system-ui) with `font-black uppercase tracking-wider` for all headlines. Matches `PageHeadline.tsx`.

Icons: `lucide-react` — same library as `Icons.tsx`. We can import directly inside Remotion (it's just React).

### Hue cycle (scene-to-scene)

Because the hero club is **Real Madrid** (white/gold `#FEBE10`), we anchor the entire promo to `data-team="yellow"` (hue 85). The match scene flexes the system by shifting briefly to red for Barcelona, then snapping back.

| Scene | `data-team` | Hue | Why |
|---|---|---|---|
| Hero | yellow | 85 | Real Madrid gold |
| Dashboard | yellow | 85 | Madrid in possession |
| Player development | yellow | 85 | Same theme, focuses on a Madrid youth |
| Transfers | yellow | 85 | Money/Madrid gold doubles up nicely |
| Formation/tactics | yellow | 85 | Madrid lineup |
| Match (RM kickoff) | yellow | 85 | Madrid hue dominates |
| Match (Barça scare) | red | 20 | 2-frame flick to red when Barça has a chance — sells the team-aware theming |
| Stats | yellow | 85 | Post-match summary |
| Outro | yellow | 85 | Brand close |

The `--team-hue` CSS variable becomes a `useTeamHue(frame)` hook driven by the timeline. The same wired-up React components used in the game will recolor themselves automatically — and the **gold accent comes from real club identity data**, not invented brand colour.

---

## 4. The shared-style infrastructure

This is the linchpin. Without it, every scene has to be hand-coded twice.

### 4.1 Set up Tailwind v4 inside Remotion

The scaffold already pulled in `tailwindcss@4`. We add `@remotion/tailwind-v4` to `remotion.config.ts` so utility classes Just Work:

```ts
// remotion.config.ts
import { enableTailwind } from "@remotion/tailwind-v4";
Config.overrideWebpackConfig(enableTailwind);
```

Then `src/index.css` becomes a near-verbatim copy of the game's `index.css` — same OKLCH variables, same `card-arcade` / `glow-*` / `border-glow` utilities, same team-hue switcher.

### 4.2 Cross-import: share code, don't fork it

We do NOT copy components. We add a path alias in `promo-video/tsconfig.json` that points `@game/*` at `../src/*`:

```jsonc
"paths": {
  "@/*":     ["./src/*"],
  "@game/*": ["../src/*"]   // direct read-only window into TouchLines
}
```

This lets us write:

```tsx
import { ScoreBar } from "@game/GameInterface/ScoreBar";
import { GoalOverlay } from "@game/GameInterface/GoalOverlay";
import { ClubLogo } from "@game/GameInterface/Components/ClubLogo";
import { PageHeadline } from "@game/GameInterface/Components/PageHeadline";
import { Icon } from "@game/GameInterface/Icons";
```

Re-render the **actual screen components** inside Remotion frames. Style stays in lockstep automatically — when the game's CSS changes, the promo updates.

### 4.3 Animation rule

Anything that's a CSS animation in the game (`animate-pulse`, `goal-pop` keyframes) is **forbidden** in Remotion (best-practices rule). We override at the wrapper level:

- For `goal-pop` → re-implement as `useCurrentFrame` + `interpolate` with the same cubic-bezier curve
- For `animate-pulse` → freeze. Wrap in a `<NoCssAnim>` boundary that strips the class

Where the game uses Pixi (the match pitch), Remotion can't run Pixi at frame-accurate render time. We replace it with an **SVG/Canvas tactical pitch** that obeys the same coordinate system (`PITCH.lengthYd=115`, `PITCH.widthYd=74`, `PITCH.scale=14`) — exactly the contract that already lives in `src/GameEngine/Configs/Constants.ts`. The existing `Pitch.tsx` we built last iteration is the right base, but we re-skin it with the game's emerald-900/950 gradient instead of the deeper green it has now.

---

## 5. Scene-by-scene script (30 seconds, 30fps = 900 frames)

Each scene assumes a 12-frame cross-fade with its neighbour.

### Scene 1 · Hero (0:00 → 0:03 · 90 frames)
**Goal:** Establish brand in one beat.

- Black void, team-hue cycling slowly from blue→purple→green in the background (radial gradient like `LandingScreen`)
- Fade in the TouchLines logo (we need to create a real wordmark — see §6) at scale 1.15 → 1.0
- Beneath: a re-creation of the landing `heroBadge` row — uppercase tracking-wider, `glow-text`
- Two thin accent lines from the existing landing motif draw in left→right
- Stat ticker (managers online, transfer volume, match speed — same 4 stats from `LandingScreen`) crawls along the bottom

**Reused art:** `card-arcade` background, `glow-text` headline, the 4-stat strip from `LandingScreen.tsx`.

---

### Scene 2 · Dashboard reveal (0:03 → 0:07 · 120 frames)
**Goal:** "This is your club." Show the dashboard layout the player sees daily.

- Cut to a **frame-accurate dashboard mock**: left `ClubSidebar` (club logo, name, fixtures), centre `SquadTable` (5–6 visible rows), right `WeekCalendar` panel
- Imports `ClubSidebar.tsx`, `SquadTable.tsx`, `WeekCalendar.tsx` directly via `@game/*`
- Use a hand-authored *fixture data prop* — a fake club ("Black Iron FC") with realistic roster
- Animation: each row of the squad table cascades in (`opacity 0→1` + `translateY 8px→0`, 4f stagger). The week calendar pills pop one by one.
- Top-right cycles through KPI cards: balance, fans, next match countdown

**Reused art:** Three real screen sections, no mock.

---

### Scene 3 · Squad → Player development (0:07 → 0:11 · 120 frames)
**Goal:** "Every player matters."

- Camera-feel transition: zoom into one squad row → it becomes a fullscreen `PlayerCard` (using `Dashboard/PlayerCard.tsx`)
- Then split-screen to `Development/AttributesPanel` showing 5 attribute bars (shooting/passing/defending/positioning/physical) animating up
- Tiny chart sparkline from `Development/RecentTrend.tsx` traces along the bottom
- A small `+0.4 PASSING` floating chip pops, then fades — the game's actual development feedback chip
- Headline overlay: **"Hunt the next star"**

**Reused art:** `PlayerCard`, `AttributesPanel`, `RecentTrend`, attribute bar styling.

---

### Scene 4 · Transfers (0:11 → 0:15 · 120 frames)
**Goal:** Show market depth — the transfer system runs daily across AI clubs.

- Recreate `TransfersScreen` tab UI (My Transfers / World / For Sale) with the active-tab `glow-primary-sm` from the real screen
- Three rows in `WorldTransfers` style animate in one after another: "Bayer Leverkusen → Real Madrid · €42M · Accepted"
- An incoming "Offer received" toast slides in from the top-right
- A red `For Sale` chip pulses on one of the player rows
- Hue cycles to **orange (45)** — the "money" hue

Headline overlay: **"Build your dynasty"**

**Reused art:** `TransfersScreen` tab strip, `MyTransfers` / `WorldTransfers` row components, `transferShared.tsx` formatting.

---

### Scene 5 · Formation & tactics (0:15 → 0:19 · 120 frames)
**Goal:** The strategic core — picks of style visibly changing the team.

- Cut to `FormationScreen` — the emerald-900 pitch with 11 positioned players
- The five tactic chips (`balanced` / `high_press` / `low_block` / `direct` / `possession`) appear stacked top-right; the active one glows
- Click animation cycles: balanced → high_press → counter_attack. With each change, the 11 player dots **physically shift positions** on the pitch (line height changes, width changes, pressing block compresses). Pure `interpolate(frame, [...])` — no real engine call needed, but we lift the actual values from `TACTIC_LINE_HEIGHTS` etc. so it's not faked.
- Headline overlay: **"Pick your tactic. Watch it click."**

**Reused art:** Formation pitch SVG, the tactic chip styles, the energy/role colour code from `Formation.ts`.

---

### Scene 6 · Match in motion (0:19 → 0:25 · 180 frames)
**Goal:** The reason the app exists. A live match clip.

- Layout reproduces `MatchScreen.tsx`: left `TeamPanel`, centre pitch, right `TeamPanel`, top `ScoreBar`
- ScoreBar imported live from `@game/GameInterface/ScoreBar` — clock animates from `42:30` → `43:11`
- The pitch is our SVG pitch (re-skinned to emerald-900 like the formation screen). Players from a hard-coded snapshot move along precomputed paths — same kind of "through ball → shot → save" we already built, but **with team kit colours coming from `matchTeamColors.ts`** instead of generic red/blue
- Right after the shot, fire the **real `GoalOverlay` component** with `scoringTeam="A"` — Remotion calls it, but with our `useCurrentFrame`-driven opacity instead of CSS keyframes
- Score updates from `0–0` → `1–0`
- Headline overlay (in the corner, not centre): **"No grinding. Just goals."**

**Reused art:** `ScoreBar`, `GoalOverlay`, `TeamPanel`, `StatsPanel` row strip at the bottom (small).

---

### Scene 7 · Stats dump (0:25 → 0:28 · 90 frames)
**Goal:** "Real engine. Real numbers." This is the StatsPanel / Statistics screen the user mentioned.

- The full-match `StatsPanel` rises from the bottom like a sheet
- Bars race in: possession 58–42, shots 14–9, xG 1.7–0.9, passes 412–280, through balls 4, tackles, etc.
- Same component as the game (`StatsPanel.tsx`) — values driven by `interpolate` so they count up
- A small **Player Ratings** strip slides in below: top 3 players from each team with their rating chips (using `AvgBadge`)

Headline overlay: **"Numbers that mean something."**

**Reused art:** `StatsPanel`, `AvgBadge`, the stat-bar render logic, the rating colour ramp from `scoreColors.ts`.

---

### Scene 8 · Outro (0:28 → 0:30 · 90 frames)
**Goal:** Wordmark + CTA.

- Snap back to the dark green hero hue
- Final wordmark in centre — same as Scene 1 but bigger and with a 1-second glow ramp
- Under it the badge: *The Football Management Arcade*
- A single CTA pill: **PLAY NOW**, styled exactly like `Button.tsx` primary variant
- Bottom small line: *touchlines.arcade* (or whatever real domain we decide)

**Reused art:** `Button.tsx`, `PageHeadline.tsx`, `glow-primary`.

---

## 6. Deliverables that need to exist BEFORE we render

These don't exist in the codebase yet — we need them for the promo to look polished:

1. **A real TouchLines wordmark SVG.** `src/logo.svg` is still the Bun logo. We design a simple, condensed sans-serif wordmark — `TOUCHLINES` in `font-black uppercase tracking-wider` with the centre `L` as the accent character (kept from the earlier draft, works well), plus a smaller `ARCADE` lockup. Save as `promo-video/public/touchlines-logo.svg`.

2. **A pitch SVG re-skin** of the existing `Pitch.tsx` to match the **emerald-900 gradient** that `FormationScreen` and `MatchScreen` use (currently we're drawing on a more saturated green).

3. **One re-usable scene wrapper** `<ScreenFrame>` that renders the **TopNavigation bar** above and a faint scanline texture, mimicking how the app actually looks in the browser. Sells the "this is a real app" feel.

---

## 6b. Hero club: **Real Madrid** (concrete data lock-in)

We use **real game data** from `src/Data/`, not invented stubs. The user is taking charge of Real Madrid. This drives every scene's content.

### Source files

| File | What we pull |
|---|---|
| `src/Data/squads/la_liga/541.json` | Real Madrid: name, colors, 40 players, venue, coach |
| `src/Data/squads/la_liga/529.json` | Barcelona (El Clásico opponent for the match scene) |
| `src/Data/logos/la_liga/real_madrid.svg` | Crest used everywhere a `<ClubLogo>` appears |
| `src/Data/logos/la_liga/barcelona.svg` | Opponent crest |
| `src/Data/la_liga.json` | League meta (38 rounds, season window) |

### Identity unlock

| Field | Value | Where it shows |
|---|---|---|
| Club name | **Real Madrid** | ScoreBar, ClubSidebar, headlines |
| Primary | `#FFFFFF` (white) | Kit, dot color in match |
| Secondary | `#FEBE10` (royal gold) | **Becomes our scene accent — replaces the made-up gold we used in draft 1.** Glow tint, line accents, CTA pill |
| Venue | *Estadio Santiago Bernabéu* (85,454) | Match scene capacity overlay, dashboard fixture card |
| Founded | 1902 | Bottom hairline on outro |
| Coach | *Alvaro Arbeloa* | Dashboard sidebar |
| Logo | `real_madrid.svg` | Every screen header |

The Real Madrid gold `#FEBE10` is **exactly the accent we want**, so the existing `--team-hue` system maps cleanly: we set `data-team="yellow"` (hue 85) for Madrid scenes. The match scene against Barcelona shifts to `data-team="red"` for the opponent moment.

### Real players to feature (sourced from `541.json`)

For the **squad table cascade** (Scene 2): top 8 by composite rating, retained in roster order so positions read naturally.

| # | Player | Pos | Age | Notes |
|---|---|---|---|---|
| 1 | Thibaut Courtois | GK | 33 | Reflex 7 — best in squad |
| 4 | Trent Alexander-Arnold | RB | 27 | Marquee RB |
| 6 | Éder Militão | CB | 27 | |
| 8 | Jude Bellingham | CM | 22 | Composite 5 — top rated |
| 14 | Arda Güler | CAM | 20 | Young star |
| 7 | Vinícius Júnior | LW | 25 | |
| 11 | Rodrygo | RW | 24 | |
| 9 | Kylian Mbappé | ST | 27 | Headline name |
| (sub) | Franco Mastantuono | FWD | 18 | "Young talent" beat in Scene 3 |

### Scene-specific data hooks

**Scene 2 (Dashboard)** — `ClubSidebar` renders Real Madrid crest + colors. `SquadTable` ingests the real roster, showing positions/ages/ratings derived live via `TeamLineup.ts` mapping. `WeekCalendar` pulls the actual La Liga fixture window (season_start 2027-08-15). Top fixture card: *Real Madrid vs Barcelona — La Liga · Round 14*.

**Scene 3 (Player development)** — Zoom target is **Franco Mastantuono** (18, FWD). The 5-attribute bars use his real stats: `passing 3, vision 3, finishing 4, dribbling 5, speed 6, acceleration 6`. The animated `+0.4 PASSING` chip is the kind of feedback `advanceDay.ts` actually emits.

**Scene 4 (Transfers)** — Use the player IDs from `541.json` as buyers / sellers. Example rows (plausibly authored against real player pool):
- *Bayern → Real Madrid · Dayot Upamecano · €58M · Accepted*
- *Real Madrid → Arsenal · Dani Ceballos · €22M · Pending*
- *Manchester City → Real Madrid · Florian Wirtz · €92M · Negotiating*

The "For Sale" pulse goes on a Real Madrid squad player (Ceballos, ~29, mid-tier rating — perfect candidate per `sellList.ts` rules).

**Scene 5 (Formation/Tactics)** — Render Real Madrid 4-3-3 with the **actual lineup** sourced from `541.json` mapped to formation slots via `pickForRole()`. Tactic chips cycle: `balanced → high_press → counter_attack`. Each shift moves players by the deltas in `tactical-config.md` (DEFENSIVE_LINE_HEIGHT etc.) so the motion is engine-accurate.

**Scene 6 (Match)** — **Real Madrid (white) vs Barcelona (claret)** — El Clásico. `ScoreBar` receives:
```ts
teamA = { name: "Real Madrid",  primaryColor: "#FFFFFF", secondaryColor: "#FEBE10", logoUrl: "/logos/la_liga/real_madrid.svg" }
teamB = { name: "Barcelona",    primaryColor: "#A50044", secondaryColor: "#004D98", logoUrl: "/logos/la_liga/barcelona.svg" }
```
The goal scorer is **Bellingham (#5)** off a Mbappé assist — both real players. Match clock animates 67:42 → 68:11. After the goal, `GoalOverlay` fires with `scoringTeam="A"` tinted in Real Madrid white/gold.

**Scene 7 (Stats)** — `StatsPanel` shows:
- Possession 57% — 43%
- Shots 14 — 9
- xG 1.7 — 0.9
- Through balls 4 — 1
- Top rated: **Bellingham 8.7**, Mbappé 8.2, Vinícius 7.9 (computed off the `player-scores.md` formula)

### How the data gets in

We don't import the JSON files into the Remotion bundle (40 players × multiple clubs is heavy). Instead:

1. Copy **only the slices we need** into `promo-video/src/data/` at build-prep time:
   - `realMadrid.ts` — extracted club meta + chosen 11 + bench (11 players)
   - `barcelona.ts` — opponent shell (just name, colors, logo, 11 players)
   - `fixtures.ts` — hand-picked 5 upcoming fixtures
   - `transfers.ts` — 6 transfer rows
   - `matchSnapshot.ts` — final score, stats, top ratings
2. Logos copied into `promo-video/public/logos/la_liga/` so `staticFile()` resolves them
3. All TypeScript-typed against the same interfaces the game uses (`Player`, `Club`, `TacticalStyle`) — no schema drift

A tiny script `scripts/extract-realmadrid.ts` in `promo-video/` reads `src/Data/squads/la_liga/541.json` and emits the slices. Re-runnable any time the game data changes.

---

## 7. Risks & open questions

| Risk | Mitigation |
|---|---|
| Some game components depend on `react-i18next` / `react-router` / fetch calls | Wrap them in a minimal `MockGameProviders` shell in Remotion: stub `useTranslation`, no-op router, prefetch nothing |
| Tailwind v4 with the game's complex CSS variables might miscompile under Remotion's webpack | Test with Scene 2 first; if `@theme inline` blocks fail, copy the resolved CSS variable list manually |
| Pixi components can't render in Remotion's server pipeline | Replace pitch with SVG-only version (already proven to work) |
| Path alias `@game/*` won't auto-include CSS from TouchLines's `index.css` | We copy `src/index.css` from the game into `promo-video/src/index.css` verbatim and keep it in sync manually |
| The user does not yet have a fixed colour kit for the demo clubs shown | Reuse colour pairs from `DEFAULT_TEAM_KIT_HEX` — they already exist |

---

## 8. Implementation order

1. Wire Tailwind v4 + game `index.css` into `promo-video` (Scene foundations)
2. Add the `@game/*` path alias and verify importing **one** real component (e.g. `PageHeadline`) renders correctly
3. Build `MockGameProviders` + `ScreenFrame` wrapper
4. Build stub data in `promo-video/src/data/`
5. Design the TouchLines wordmark SVG
6. Implement scenes in order: **2 → 3 → 4 → 5 → 6 → 7 → 1 → 8** (the middle "product screens" are the hardest; bookends are simpler and benefit from lessons learned)
7. Add cross-fade transitions in `Composition.tsx`
8. Render full MP4 at 1920×1080 / 30fps with `npx remotion render Promo out/touchlines.mp4`

Estimated effort: 4–6 focused hours for a polished render, most of it on scenes 2 / 4 / 6 (the screen-faithful ones).

---

## 9. What stays from the first draft

- The 1920×1080 canvas + 30fps choice
- The `<Pitch>` SVG coordinate system (it already mirrors the engine)
- The cross-fade `<Sequence>` pattern in `Composition.tsx`

What gets thrown out: the abstract dark-blue/gold colour palette, the made-up logo, the generic "Coming Soon" CTA, and all hand-drawn graphics that don't appear in the actual app.

---

## Next step

If this plan looks good, the first concrete commit is:

> **Wire Tailwind v4 + a copy of the game's `index.css` into `promo-video`, add the `@game/*` alias, render Scene 2 (Dashboard) as a static still to verify the cross-import works.**

That single test answers ~80% of the risks above and unlocks everything else.
