import type { ReactNode } from "react";

const titleLg =
  "text-2xl font-black font-display text-foreground uppercase tracking-wider m-0";

const titleMd =
  "text-xl font-black font-display text-foreground m-0 uppercase tracking-wider";

export function PageHeadline({
  backHref: _backHref,
  backLabel: _backLabel,
  children,
  subtitle,
  trailing,
  hideTitle,
  className,
  titleClassName,
  size = "lg",
}: {
  backHref?: string;
  backLabel?: string;
  children?: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  hideTitle?: boolean;
  className?: string;
  titleClassName?: string;
  size?: "lg" | "md";
}) {
  if (hideTitle) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 w-full${className ? ` ${className}` : ""}`}
      >
        {trailing}
      </div>
    );
  }

  const titleBase = size === "md" ? titleMd : titleLg;
  const hClass = titleClassName ? `${titleBase} ${titleClassName}` : titleBase;

  const titleCol = (
    <div className="min-w-0 flex-1">
      {children != null && children !== false && <h1 className={hClass}>{children}</h1>}
      {subtitle != null && subtitle !== false && (
        <div className="text-sm text-muted-foreground mt-1 m-0">{subtitle}</div>
      )}
    </div>
  );

  const rowAlign = subtitle != null ? "items-start" : "items-center";
  const trailingRowAlign = subtitle != null ? "sm:items-start" : "sm:items-center";

  if (trailing) {
    return (
      <div
        className={`flex flex-col gap-4 sm:flex-row ${trailingRowAlign} sm:justify-between w-full${
          className ? ` ${className}` : ""
        }`}
      >
        <div className={`flex gap-4 min-w-0 flex-1 ${rowAlign}`}>
          {titleCol}
        </div>
        <div className="shrink-0">{trailing}</div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 w-full ${rowAlign}${className ? ` ${className}` : ""}`}>
      {titleCol}
    </div>
  );
}
