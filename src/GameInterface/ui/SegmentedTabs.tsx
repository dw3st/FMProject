import type { ReactNode } from "react";

export interface SegmentedTabItem<K extends string> {
  key: K;
  label: ReactNode;
  disabled?: boolean;
}

interface Props<K extends string> {
  tabs: SegmentedTabItem<K>[];
  active: K | null;
  onChange: (key: K) => void;
  /** Wrap onto several lines when they don't fit (e.g. a long list of competitions). */
  wrap?: boolean;
  /** Smaller horizontal padding for a secondary selector inside a tab. */
  compact?: boolean;
  /** Stretch over the full width, tabs sharing it equally (a two-way switch inside a panel). */
  fill?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Tab bar of the Leagues screen ("TABELA | JOGOS | ..."): condensed uppercase tabs inside a
 * bordered rounded container; the active tab is a raised card. Standard tab bar of the game
 * (`.claude/rules/ui-standard.md` → Abas).
 */
export function SegmentedTabs<K extends string>({
  tabs, active, onChange, wrap, compact, fill, className = "", "aria-label": ariaLabel,
}: Props<K>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 p-1 bg-secondary/20 rounded-lg border border-border ${fill ? "w-full" : "w-fit"} ${wrap ? "flex-wrap" : ""} ${className}`}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            className={`${compact ? "px-3" : "px-4"} ${fill ? "flex-1" : ""} inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[13px] font-bold uppercase tracking-[0.08em] font-display transition-all cursor-pointer border-0 disabled:opacity-40 disabled:cursor-not-allowed ${
              on
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground bg-transparent"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
