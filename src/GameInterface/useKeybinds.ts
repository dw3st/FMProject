import { useEffect } from "react";

/**
 * Central keybind registry.
 * Shape: { [screen]: { [key]: actionName } }
 *
 * key follows KeyboardEvent.key convention:
 *   ' '      → Space
 *   'Escape' → Esc
 *   'Enter'  → Enter
 *   'ArrowRight' etc.
 */
export const KEYBINDS = {
  dashboard: {
    " ": "advanceDay",
  },
} as const;

type Screen = keyof typeof KEYBINDS;
type ActionsFor<S extends Screen> = Extract<(typeof KEYBINDS)[S][keyof (typeof KEYBINDS)[S]], string>;

/**
 * Registers keyboard shortcuts for the given screen.
 * Handlers are matched by action name defined in KEYBINDS.
 *
 * Keypresses are ignored when focus is inside an input/textarea/select.
 *
 * @example
 * useKeybinds("dashboard", { advanceDay: handleAdvanceDay });
 */
export function useKeybinds<S extends Screen>(
  screen: S,
  handlers: Partial<Record<ActionsFor<S>, () => void>>,
) {
  useEffect(() => {
    const map = KEYBINDS[screen] as Record<string, string>;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as Element | null)?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

      const action = map[e.key];
      if (!action) return;

      const handler = (handlers as Record<string, (() => void) | undefined>)[action];
      if (!handler) return;

      e.preventDefault();
      handler();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, ...Object.values(handlers)]);
}
