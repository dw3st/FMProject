import type { ReactNode } from "react";

export type NoticeKind = "info" | "warning" | "error";

const KIND: Record<NoticeKind, string> = {
  info: "border-border text-muted-foreground",
  warning: "border-chart-4/50 text-chart-4",
  error: "border-destructive/50 text-destructive",
};

/** One-line notice. */
export function Notice({ kind = "info", className = "", children }: { kind?: NoticeKind; className?: string; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`border-l-2 pl-3 py-1 text-sm ${KIND[kind]} ${className}`}>
      {children}
    </div>
  );
}
