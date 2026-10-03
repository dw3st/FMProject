import type { ReactNode } from "react";

/** Max content width of every in-game screen (centered inside the Layout frame). */
export const SCREEN_MAX_WIDTH = "max-w-[1440px]";

/**
 * The one content frame of every in-game screen (the screens rendered inside `Layout`): the same
 * padding (`px-6 py-5`), the same max width (`SCREEN_MAX_WIDTH`, centered) and the standard block
 * spacing (`gap-6`). Screens never add their own `max-w-*` / `mx-auto` wrapper around the whole
 * screen — side-by-side panels keep their own grid inside it. See `.claude/rules/ui-standard.md`
 * → Layout.
 *
 * The scrollbar gutter is always reserved (`scrollbar-gutter: stable`), and `TopNavigation` /
 * `StatusBar` reserve the same gutter, so the bars' content lines up with the cards' edges whether
 * or not the screen scrolls (#62).
 *
 * `fill`: the column takes the remaining height (for screens whose table scrolls internally).
 */
export function ScreenContainer({
  children,
  className = "",
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div
      data-screen-container=""
      className={`flex-1 min-w-0 min-h-0 overflow-auto [scrollbar-gutter:stable] px-6 py-5${fill ? " flex flex-col" : ""}`}
    >
      <div
        className={`w-full ${SCREEN_MAX_WIDTH} mx-auto flex flex-col gap-6${fill ? " flex-1 min-h-0" : ""}${
          className ? ` ${className}` : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
