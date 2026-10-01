import type { ReactNode } from "react";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  disabled?: boolean;
}

interface Props<K extends string> {
  tabs: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}

/** Text tabs; the active one is foreground with a primary underline. */
export function Tabs<K extends string>({ tabs, active, onChange, className = "" }: Props<K>) {
  return (
    <div role="tablist" className={`flex gap-6 border-b border-border ${className}`}>
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
            className={`-mb-px h-10 text-sm bg-transparent border-0 border-b-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              on
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
