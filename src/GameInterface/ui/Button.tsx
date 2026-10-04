import type { ButtonHTMLAttributes } from "react";

type UiButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<UiButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-transparent text-muted-foreground hover:text-foreground",
  // Alias of secondary, kept for existing callers.
  ghost: "bg-transparent text-muted-foreground hover:text-foreground",
  danger: "bg-transparent text-destructive hover:opacity-80",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
  /** No horizontal padding: a text button (secondary/danger) aligned with the content around it. */
  flush?: boolean;
}

export function Button({ variant = "primary", flush = false, className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 h-10 ${flush ? "px-0" : "px-5"} rounded text-sm font-semibold cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}
