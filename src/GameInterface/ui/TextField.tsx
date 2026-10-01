import type { InputHTMLAttributes } from "react";
import { Label } from "@/GameInterface/ui/Label";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  /** `underline` (default, large) or `box`. */
  variant?: "underline" | "box";
}

/** Text input with a visible label above it. */
export function TextField({ id, label, variant = "underline", className = "", ...rest }: Props) {
  const field =
    variant === "underline"
      ? "w-full bg-transparent border-0 border-b border-border focus:border-primary focus:outline-none py-2 text-lg"
      : "w-full bg-transparent rounded border border-border focus:border-primary focus:outline-none h-10 px-3 text-sm";
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2">
        {label}
      </Label>
      <input id={id} className={`${field} text-foreground placeholder:text-muted-foreground`} {...rest} />
    </div>
  );
}
