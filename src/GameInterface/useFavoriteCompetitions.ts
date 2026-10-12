import { useCallback, useState } from "react";
import { parseFavoriteCompetitions, toggleFavoriteCompetition } from "@/Domain/stats/favoriteCompetitions";

/** Per-viewer convenience (#150): kept in the browser, survives without it. */
const STORAGE_KEY = "fm.stats.favoriteCompetitions";

function load(): string[] {
  try {
    return parseFavoriteCompetitions(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}

function save(list: string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private window / blocked storage: the favourites just aren't remembered.
  }
}

/** Favourite competitions of the Stats rankings and a toggle that stores them. */
export function useFavoriteCompetitions(): { favorites: string[]; toggle: (slug: string) => void } {
  const [favorites, setFavorites] = useState<string[]>(load);
  const toggle = useCallback((slug: string) => {
    setFavorites((prev) => {
      const next = toggleFavoriteCompetition(prev, slug);
      save(next);
      return next;
    });
  }, []);
  return { favorites, toggle };
}
