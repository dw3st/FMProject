import { useMemo, useState } from "react";

/**
 * Sorting by a clicked column header, shared by every list table (tester report, 8.9.35). A column is a key plus an
 * accessor; the first click sorts numbers from the highest and text from A, the next click flips it.
 */
export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export interface SortState { key: string; dir: SortDir }

/** Props a header cell needs to sort (see `StatsHead` `sort`). */
export interface HeadSort { active: boolean; dir: SortDir; onSort: () => void }

/** The direction a first click on a column takes: numbers high first, text A first. */
export function firstDir<T>(rows: readonly T[], get: (row: T) => SortValue): SortDir {
  for (const r of rows) {
    const v = get(r);
    if (v === null || v === undefined || v === "") continue;
    return typeof v === "number" ? "desc" : "asc";
  }
  return "asc";
}

/** A stable sort; empty values always go last, whatever the direction. */
export function sortRows<T>(rows: readonly T[], get: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ae = a.v === null || a.v === undefined || a.v === "" || (typeof a.v === "number" && Number.isNaN(a.v));
      const be = b.v === null || b.v === undefined || b.v === "" || (typeof b.v === "number" && Number.isNaN(b.v));
      if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

/**
 * Rows sorted by the clicked column. `initial` null keeps the order the rows came in until a header is clicked.
 * `head(key)` gives the header props for that column (undefined for a column without an accessor).
 */
export function useTableSort<T>(rows: readonly T[], accessors: SortAccessors<T>, initial: SortState | null = null) {
  const [state, setState] = useState<SortState | null>(initial);
  const sorted = useMemo(() => {
    const get = state ? accessors[state.key] : undefined;
    return state && get ? sortRows(rows, get, state.dir) : [...rows];
    // The accessors are rebuilt each render; the key decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state?.key, state?.dir]);
  const head = (key: string): HeadSort | undefined => {
    const get = accessors[key];
    if (!get) return undefined;
    const active = state?.key === key;
    return {
      active,
      dir: active ? state!.dir : firstDir(rows, get),
      onSort: () => setState(active ? { key, dir: state!.dir === "asc" ? "desc" : "asc" } : { key, dir: firstDir(rows, get) }),
    };
  };
  return { sorted, sort: state, head };
}
