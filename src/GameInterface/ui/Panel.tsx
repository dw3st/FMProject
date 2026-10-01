import type { HTMLAttributes, ReactNode } from "react";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Section title shown above the content. */
  title?: ReactNode;
  /** Draw a thin border (no fill, no shadow). Off by default: spacing and a title are enough. */
  bordered?: boolean;
}

/** Content block: no box by default; `bordered` adds a thin outline only. */
export function Panel({ title, bordered = false, className = "", children, ...rest }: Props) {
  return (
    <div className={`${bordered ? "border border-border rounded-md p-4" : ""} ${className}`} {...rest}>
      {title != null && <SectionTitle className="mb-3">{title}</SectionTitle>}
      {children}
    </div>
  );
}
