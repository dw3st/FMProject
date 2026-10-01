/** Only two sizes exist: `lg` on entry screens (centered, like the landing), `sm` in bars and side columns. */
const SIZE = { sm: "text-lg", lg: "text-6xl sm:text-7xl" } as const;

export function Wordmark({ size = "lg", className = "" }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={`font-wordmark font-bold tracking-wide leading-none text-foreground ${SIZE[size]} ${className}`}>
      FM<span className="text-primary">PROJECT</span>
    </span>
  );
}
