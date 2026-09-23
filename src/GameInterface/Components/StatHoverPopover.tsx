type StatHoverPopoverProps = {
  label: string;
  description: string;
};

/**
 * Hover popover for stat rows. Parent must use `group/stat` on a wrapping element.
 */
export function StatHoverPopover({ label, description }: StatHoverPopoverProps) {
  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-[100] mb-1.5 hidden group-hover/stat:block">
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg w-44">
        <p className="text-[11px] font-black text-foreground mb-0.5">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
