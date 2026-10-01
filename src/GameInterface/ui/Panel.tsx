import type { HTMLAttributes } from "react";

/** Thin-bordered container, no shadow. */
export function Panel({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`border border-border rounded-lg bg-card ${className}`} {...rest} />;
}
