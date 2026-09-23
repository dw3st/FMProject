import type { ReactNode } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";

/** Shared “input box” look for Headless UI listboxes (filters, league picker, etc.). */
export const formSelectBoxClass =
  "w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all";

type Option<T extends string> = { value: T; label: string };

export function SelectListbox<T extends string>({
  label,
  labelId,
  value,
  onChange,
  options,
  leadingIcon,
  className,
  disabled,
}: {
  label?: string;
  labelId?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  leadingIcon?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const id = labelId ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className={className}>
      {label && (
        <span
          id={id}
          className="block text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider"
        >
          {label}
        </span>
      )}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <ListboxButton
            aria-labelledby={id}
            className={`${formSelectBoxClass} flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              leadingIcon ? "pl-2.5" : ""
            }`}
          >
            {leadingIcon}
            <span className="min-w-0 flex-1 text-left font-medium truncate">
              {selected?.label ?? "—"}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </ListboxButton>
          <ListboxOptions className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-card border border-border shadow-xl py-1 text-sm focus:outline-none">
            {options.map((opt) => (
              <ListboxOption
                key={opt.value}
                value={opt.value}
                className="group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors data-[focus]:bg-primary/10 data-[selected]:text-primary"
              >
                <span className="font-medium truncate">{opt.label}</span>
                <Check className="w-4 h-4 opacity-0 group-data-[selected]:opacity-100 text-primary shrink-0" />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
}
