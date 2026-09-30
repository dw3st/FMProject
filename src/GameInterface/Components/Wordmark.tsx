const SIZE = { sm: "text-lg", md: "text-4xl", lg: "text-6xl sm:text-7xl" } as const;

export function Wordmark({ size = "md", className = "" }: { size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={`font-wordmark font-bold tracking-wide leading-none text-foreground ${SIZE[size]} ${className}`}>
      FM<span className="text-primary">PROJECT</span>
    </span>
  );
}
