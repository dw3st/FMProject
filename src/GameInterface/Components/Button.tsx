import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground font-bold hover:scale-[1.02] active:scale-[0.98] glow-primary",
  secondary:
    "card-arcade text-secondary-foreground font-bold hover:scale-[1.02] hover:border-primary/50 active:scale-[0.98]",
  ghost:
    "bg-transparent text-muted-foreground font-semibold hover:text-primary active:scale-[0.98]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-lg gap-2",
  md: "px-6 py-3 text-base rounded-xl gap-2.5",
  lg: "px-8 py-4 text-lg rounded-xl gap-3",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center cursor-pointer transition-all duration-200 tracking-wide uppercase ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
