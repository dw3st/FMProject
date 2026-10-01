import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
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
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-2 text-left font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
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
