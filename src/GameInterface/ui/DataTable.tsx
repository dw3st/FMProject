import type { ReactNode } from "react";
import { SortButton } from "@/GameInterface/ui/SortButton";
import { useTableSort, type SortValue } from "@/GameInterface/ui/tableSort";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** The value the column sorts by: with it, a click on the header sorts the table (tester report, 8.9.35). */
  sortValue?: (row: T) => SortValue;
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isHighlighted?: (row: T) => boolean;
  className?: string;
}

/** Label-style header, rows separated by a thin top border, optional highlighted row. */
export function DataTable<T>({ columns, rows, rowKey, isHighlighted, className = "" }: Props<T>) {
  const accessors = Object.fromEntries(columns.filter((c) => c.sortValue).map((c) => [c.key, c.sortValue!]));
  const { sorted, head } = useTableSort(rows, accessors);
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                aria-sort={head(c.key)?.active ? (head(c.key)!.dir === "asc" ? "ascending" : "descending") : undefined}
                className={`px-2 py-2 text-left font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground ${c.className ?? ""}`}
              >
                {head(c.key) ? <SortButton sort={head(c.key)!}>{c.header}</SortButton> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const on = isHighlighted?.(row) ?? false;
            return (
              <tr key={rowKey(row)} className={`border-t border-border h-10 ${on ? "bg-primary/10 text-primary" : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-2 py-2 ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
