import { Icon } from "@/GameInterface/Icons";

interface Props {
  checked: boolean;
  /** What the box means, for screen readers ("Premier League: Saka"). */
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Why it cannot change, or what it does. */
  title?: string;
  /** A box that is ticked by a rule and never changes (a free under-21): drawn in a quieter colour. */
  fixed?: boolean;
}

/**
 * A tick box for a table cell (registered in a competition, called up to a youth side): 32px target, primary when
 * ticked. One column of these replaces a list per option.
 */
export function TickBox({ checked, label, onChange, disabled, title, fixed }: Props) {
  const look = fixed
    ? "border-sky-400/50 bg-sky-400/15 text-sky-300"
    : checked
      ? "border-primary bg-primary/15 text-primary"
      : "border-muted-foreground/50 bg-card/40 text-transparent";
  const hover = disabled || fixed ? "" : checked ? "hover:bg-primary/25" : "hover:border-primary/60 hover:text-primary/40";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled || fixed}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${look} ${hover} ${fixed ? "cursor-default" : "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"}`}
    >
      <Icon name="check" size={18} />
    </button>
  );
}
