import type { ReactNode } from "react";

/** Selectable card: section-style title (smaller) and a one-line description. */
export function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`text-left rounded-md border border-border bg-card p-3 cursor-pointer ${
        selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
      } ${className}`}
    >
      <span className="block font-display font-black uppercase text-base leading-none">{title}</span>
      {description != null && <span className="block text-sm text-muted-foreground mt-1">{description}</span>}
    </button>
  );
}
