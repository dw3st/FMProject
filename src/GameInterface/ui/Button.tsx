import type { ButtonHTMLAttributes } from "react";

export type UiButtonVariant = "primary" | "ghost" | "danger";

const VARIANT: Record<UiButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground",
  danger: "bg-destructive text-white hover:opacity-90",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
}

export function Button({ variant = "primary", className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 min-h-10 px-4 rounded text-sm font-semibold cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}
