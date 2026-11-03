import { Icon } from "@/GameInterface/Icons";

interface Props {
  dir: 1 | -1;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/** A 40px minus or plus button beside a number field or slider. */
export function StepButton({ dir, label, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-10 h-10 shrink-0 rounded border border-border bg-transparent text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon name={dir > 0 ? "plus" : "minus"} size={16} />
    </button>
  );
}
