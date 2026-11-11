import type { ReactNode } from "react";
import { Icon } from "@/GameInterface/Icons";
import type { HeadSort } from "@/GameInterface/ui/tableSort";

/** The clickable label of a sortable header; the arrow hangs off the label so a centred label stays over its column. */
export function SortButton({ sort, align = "left", children }: { sort: HeadSort; align?: "left" | "right" | "center"; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); sort.onSort(); }}
      className={`relative inline-flex items-center bg-transparent border-0 p-0 cursor-pointer font-display font-bold uppercase tracking-[0.08em] text-[13px] hover:text-primary transition-colors ${sort.active ? "text-primary" : "text-inherit"}`}
    >
      {children}
      {sort.active && (
        <Icon
          name={sort.dir === "asc" ? "chevron-up" : "chevron-down"}
          size={16}
          className={`text-primary ${align === "right" ? "absolute right-full mr-0.5" : "absolute left-full ml-0.5"}`}
        />
      )}
    </button>
  );
}
